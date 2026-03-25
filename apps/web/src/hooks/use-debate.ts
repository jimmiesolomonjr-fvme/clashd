'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@clashd/supabase-client';
import type {
  DebateStatus,
  RoundPhase,
  BroadcastMessage,
  MuteControlMessage,
  TimerSyncMessage,
  AudienceMeterMessage,
  DebatePausedMessage,
  EmojiReaction,
  PresenceState,
  ReportReason,
} from '@clashd/shared';
import {
  subscribeToDebate,
  sendReaction as sendRealtimeReaction,
  trackPresence,
  getDebate,
  getRounds,
  getDebateComments,
  getUserVote,
} from '@clashd/supabase-client';
import { MAX_COMMENT_LENGTH } from '@clashd/shared';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DebateRealtimeChannels } from '@clashd/supabase-client';

// ---------------------------------------------------------------------------
// Type aliases for DB rows
// ---------------------------------------------------------------------------

type DebateRow = Database['public']['Tables']['debates']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];
type CommentRow = Database['public']['Tables']['comments']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** Debate row joined with side_a / side_b profiles (matches getDebate query). */
type DebateWithProfiles = DebateRow & {
  side_a: ProfileRow;
  side_b: ProfileRow;
};

/** Comment row joined with user profile (matches getDebateComments query). */
type CommentWithUser = CommentRow & {
  user: Pick<ProfileRow, 'id' | 'username' | 'avatar_url'>;
};

// ---------------------------------------------------------------------------
// Vote scores shape passed to the submit-vote Edge Function
// ---------------------------------------------------------------------------

export interface VoteScores {
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
}

// ---------------------------------------------------------------------------
// Audience meter snapshot (broadcast)
// ---------------------------------------------------------------------------

interface AudienceMeter {
  sideAPercentage: number;
  sideBPercentage: number;
  sampleSize: number;
}

// ---------------------------------------------------------------------------
// Hook params
// ---------------------------------------------------------------------------

export interface UseDebateParams {
  debateId: string;
  userId: string;
  supabase: SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseDebateReturn {
  // Core data
  debate: DebateWithProfiles | null;
  rounds: RoundRow[];
  currentRound: RoundRow | null;

  // Derived state
  phase: RoundPhase | null;
  debateStatus: DebateStatus | null;
  currentSpeakerId: string | null;
  isMyTurn: boolean;

  // Timer
  timerStartedAt: number | null;
  timerDurationSeconds: number;

  // Mute
  isMuted: boolean;
  shouldBeMuted: boolean;

  // Realtime data
  comments: CommentWithUser[];
  audienceCount: number;
  audienceMeter: AudienceMeter | null;

  // Role
  isDebater: boolean;
  isSpectator: boolean;

  // Actions
  actions: {
    startDebate: () => Promise<void>;
    sendComment: (content: string) => Promise<void>;
    sendReaction: (emoji: EmojiReaction) => Promise<void>;
    submitVote: (scores: VoteScores) => Promise<void>;
    submitReport: (reason: ReportReason, details?: string) => Promise<void>;
  };

  // Moderation
  isPaused: boolean;
  pauseInfo: { reportCount: number; reason: string } | null;

  // Voting
  hasVoted: boolean;

  // Presence
  presentUserIds: string[];

  // Broadcast channel (for FloatingReactions to subscribe)
  broadcastChannel: RealtimeChannel | null;

  // Status
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Phases where each debater should be unmuted
// ---------------------------------------------------------------------------

const SIDE_A_SPEAKING_PHASES: ReadonlySet<RoundPhase> = new Set([
  'side_a_speaking',
]);

const SIDE_B_SPEAKING_PHASES: ReadonlySet<RoundPhase> = new Set([
  'side_b_speaking',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseFunctionsUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${base}/functions/v1`;
}

/**
 * Call a Supabase Edge Function. Resolves the current session token from the
 * provided client so the function can authenticate the caller.
 */
async function invokeEdgeFunction(
  supabase: SupabaseClient<Database>,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${getSupabaseFunctionsUrl()}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { data: null, error: text || `Edge function ${functionName} returned ${res.status}` };
  }

  const data = await res.json();
  return { data, error: null };
}

/**
 * Parse a Postgres ISO timestamp (or null) into epoch milliseconds (or null).
 * This is used for timer_started_at which comes from the DB as an ISO string.
 */
function parseTimestamp(ts: string | null): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useDebate({ debateId, userId, supabase }: UseDebateParams): UseDebateReturn {
  // ---- Core data state ----
  const [debate, setDebate] = useState<DebateWithProfiles | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [comments, setComments] = useState<CommentWithUser[]>([]);

  // ---- Realtime derived state ----
  const [audienceCount, setAudienceCount] = useState(0);
  const [presentUserIds, setPresentUserIds] = useState<string[]>([]);
  const [audienceMeter, setAudienceMeter] = useState<AudienceMeter | null>(null);
  const [muteOverride, setMuteOverride] = useState<boolean | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [pauseInfo, setPauseInfo] = useState<{ reportCount: number; reason: string } | null>(null);

  // ---- Status ----
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Refs ----
  const channelsRef = useRef<DebateRealtimeChannels | null>(null);
  const timerAdvancedRef = useRef<string | null>(null); // tracks round id for which we already called advance

  // ---------------------------------------------------------------------------
  // Derived values (no extra state needed)
  // ---------------------------------------------------------------------------

  const currentRound = useMemo<RoundRow | null>(() => {
    // First non-completed round, or the last round if all completed
    const active = rounds.find((r) => r.phase !== 'completed');
    return active ?? rounds[rounds.length - 1] ?? null;
  }, [rounds]);

  const phase = currentRound?.phase ?? null;
  const debateStatus = (debate?.status ?? null) as DebateStatus | null;
  const currentSpeakerId = currentRound?.current_speaker_id ?? null;

  const isDebater = useMemo(() => {
    if (!debate) return false;
    return userId === debate.side_a_user_id || userId === debate.side_b_user_id;
  }, [debate, userId]);

  const isSpectator = !isDebater;

  const isMyTurn = useMemo(() => {
    if (!isDebater || !currentSpeakerId) return false;
    return currentSpeakerId === userId;
  }, [isDebater, currentSpeakerId, userId]);

  /**
   * Whether the current user *should* be muted based on the round phase.
   * - Debaters are unmuted only during their speaking phase.
   * - Spectators are always muted.
   */
  const shouldBeMuted = useMemo(() => {
    if (!isDebater || !debate || !phase) return true;

    if (userId === debate.side_a_user_id) {
      return !SIDE_A_SPEAKING_PHASES.has(phase);
    }
    if (userId === debate.side_b_user_id) {
      return !SIDE_B_SPEAKING_PHASES.has(phase);
    }
    return true;
  }, [isDebater, debate, phase, userId]);

  // Effective mute state: server override wins, otherwise use shouldBeMuted
  const isMuted = muteOverride ?? shouldBeMuted;

  // Moderation
  const isPaused = debateStatus === 'paused';

  // Timer values derived from current round
  const timerStartedAt = parseTimestamp(currentRound?.timer_started_at ?? null);
  const timerDurationSeconds = currentRound?.timer_duration_seconds ?? 0;

  // ---------------------------------------------------------------------------
  // Initial data load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [debateResult, roundsResult, commentsResult] = await Promise.all([
          getDebate(supabase, debateId),
          getRounds(supabase, debateId),
          getDebateComments(supabase, debateId),
        ]);

        if (cancelled) return;

        if (debateResult.error) {
          setError(debateResult.error.message);
          setLoading(false);
          return;
        }

        setDebate(debateResult.data as unknown as DebateWithProfiles);
        setRounds(roundsResult.data ?? []);
        setComments((commentsResult.data as unknown as CommentWithUser[]) ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load debate data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debateId, supabase]);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const channels = subscribeToDebate(supabase, debateId, {
      // ---- Broadcast ----
      onBroadcast: (message: BroadcastMessage) => {
        switch (message.type) {
          case 'mute_control': {
            const msg = message as MuteControlMessage;
            if (msg.target_user_id === userId) {
              setMuteOverride(msg.muted);
            }
            break;
          }
          case 'timer_sync': {
            // The server may broadcast corrected timer values. We reconcile
            // by updating the matching round in local state.
            const msg = message as TimerSyncMessage;
            setRounds((prev) =>
              prev.map((r) => {
                if (r.id !== msg.round_id) return r;
                // Reconstruct timer_started_at from remaining + server timestamp
                const startedAt = new Date(
                  msg.server_timestamp - (r.timer_duration_seconds - msg.remaining_seconds) * 1000,
                ).toISOString();
                return { ...r, timer_started_at: startedAt, phase: msg.phase as RoundPhase };
              }),
            );
            break;
          }
          case 'audience_meter': {
            const msg = message as AudienceMeterMessage;
            setAudienceMeter({
              sideAPercentage: msg.side_a_percentage,
              sideBPercentage: msg.side_b_percentage,
              sampleSize: msg.sample_size,
            });
            break;
          }
          case 'debate_paused': {
            const msg = message as DebatePausedMessage;
            setPauseInfo({ reportCount: msg.report_count, reason: msg.reason });
            break;
          }
          case 'reaction':
            break;
          default:
            break;
        }
      },

      // ---- Postgres changes: debates ----
      onDebateChange: (payload) => {
        setDebate((prev) => {
          if (!prev) return prev;
          // Merge the updated debate row while keeping the joined profiles
          return { ...prev, ...payload.new };
        });
      },

      // ---- Postgres changes: rounds ----
      onRoundChange: (payload) => {
        const updated = payload.new;
        setRounds((prev) => {
          const idx = prev.findIndex((r) => r.id === updated.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          // New round inserted — append and keep sorted
          return [...prev, updated].sort((a, b) => a.round_number - b.round_number);
        });

        // When a round phase changes, clear any mute override so the derived
        // shouldBeMuted takes over again.
        setMuteOverride(null);
      },

      // ---- Postgres changes: comments ----
      onNewComment: (payload) => {
        const newComment = payload.new as unknown as CommentWithUser;
        setComments((prev) => {
          // Guard against duplicates (realtime can fire twice)
          if (prev.some((c) => c.id === newComment.id)) return prev;
          return [...prev, newComment];
        });
      },

      // ---- Presence ----
      onPresenceSync: (state) => {
        const allUsers: string[] = [];
        for (const key of Object.keys(state)) {
          for (const p of state[key]) {
            if (p.user_id) allUsers.push(p.user_id);
          }
        }
        setAudienceCount(allUsers.length);
        setPresentUserIds(allUsers);
      },
    });

    channelsRef.current = channels;

    // Track this user's presence in the debate
    const presencePayload: PresenceState = {
      user_id: userId,
      username: '', // Will be enriched by the component layer if needed
      avatar_url: null,
      joined_at: Date.now(),
    };
    trackPresence(channels.presence, presencePayload);

    return () => {
      channels.cleanup();
      channelsRef.current = null;
    };
  }, [debateId, userId, supabase]);

  // ---------------------------------------------------------------------------
  // Timer expiry -> advance round (debaters only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isDebater || !currentRound || !timerStartedAt || timerDurationSeconds <= 0) return;

    // Only trigger for speaking and voting phases where advancing makes sense
    const advanceablePhases: ReadonlySet<RoundPhase> = new Set([
      'countdown',
      'side_a_speaking',
      'side_b_speaking',
      'voting',
    ]);
    if (!advanceablePhases.has(currentRound.phase)) return;

    // Don't re-fire for the same round+phase
    const advanceKey = `${currentRound.id}:${currentRound.phase}`;
    if (timerAdvancedRef.current === advanceKey) return;

    const elapsed = Date.now() - timerStartedAt;
    const remainingMs = timerDurationSeconds * 1000 - elapsed;

    if (remainingMs <= 0) {
      // Already expired — fire immediately
      timerAdvancedRef.current = advanceKey;
      invokeEdgeFunction(supabase, 'advance-round', {
        debate_id: debateId,
        round_id: currentRound.id,
      }).catch(() => {
        // Allow retry on next render cycle
        timerAdvancedRef.current = null;
      });
      return;
    }

    const timeout = setTimeout(() => {
      timerAdvancedRef.current = advanceKey;
      invokeEdgeFunction(supabase, 'advance-round', {
        debate_id: debateId,
        round_id: currentRound.id,
      }).catch(() => {
        timerAdvancedRef.current = null;
      });
    }, remainingMs);

    return () => clearTimeout(timeout);
  }, [
    isDebater,
    currentRound,
    timerStartedAt,
    timerDurationSeconds,
    debateId,
    supabase,
  ]);

  // ---------------------------------------------------------------------------
  // Vote status check — reset when round changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!currentRound || !userId) {
      setHasVoted(false);
      return;
    }
    let cancelled = false;
    getUserVote(supabase, currentRound.id, userId).then(({ data }) => {
      if (!cancelled) setHasVoted(!!data);
    });
    return () => { cancelled = true; };
  }, [currentRound?.id, userId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startDebate = useCallback(async () => {
    const { error: fnError } = await invokeEdgeFunction(supabase, 'start-debate', {
      debate_id: debateId,
      present_user_ids: presentUserIds,
    });
    if (fnError) {
      setError(fnError);
    }
  }, [supabase, debateId, presentUserIds]);

  const sendComment = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const truncated = trimmed.slice(0, MAX_COMMENT_LENGTH);

      const { error: insertError } = await supabase.from('comments').insert({
        debate_id: debateId,
        user_id: userId,
        content: truncated,
      });

      if (insertError) {
        setError(insertError.message);
      }
    },
    [supabase, debateId, userId],
  );

  const sendReaction = useCallback(
    async (emoji: EmojiReaction) => {
      const channels = channelsRef.current;
      if (!channels) return;
      await sendRealtimeReaction(channels.broadcast, emoji, userId);
    },
    [userId],
  );

  const submitVote = useCallback(
    async (scores: VoteScores) => {
      if (!currentRound) {
        setError('No active round to vote on');
        return;
      }

      const { error: fnError } = await invokeEdgeFunction(supabase, 'submit-vote', {
        debate_id: debateId,
        round_id: currentRound.id,
        ...scores,
      });

      if (fnError) {
        setError(fnError);
      } else {
        setHasVoted(true);
      }
    },
    [supabase, debateId, currentRound],
  );

  const submitReport = useCallback(
    async (reason: ReportReason, details?: string) => {
      const { error: fnError } = await invokeEdgeFunction(supabase, 'process-report', {
        debate_id: debateId,
        reason,
        details: details || undefined,
      });
      if (fnError) {
        setError(fnError);
      }
    },
    [supabase, debateId],
  );

  // ---------------------------------------------------------------------------
  // Stable actions object
  // ---------------------------------------------------------------------------

  const actions = useMemo(
    () => ({
      startDebate,
      sendComment,
      sendReaction,
      submitVote,
      submitReport,
    }),
    [startDebate, sendComment, sendReaction, submitVote, submitReport],
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Core data
    debate,
    rounds,
    currentRound,

    // Derived state
    phase,
    debateStatus,
    currentSpeakerId,
    isMyTurn,

    // Timer
    timerStartedAt,
    timerDurationSeconds,

    // Mute
    isMuted,
    shouldBeMuted,

    // Realtime data
    comments,
    audienceCount,
    audienceMeter,

    // Role
    isDebater,
    isSpectator,

    // Actions
    actions,

    // Moderation
    isPaused,
    pauseInfo,

    // Voting
    hasVoted,

    // Presence
    presentUserIds,

    // Broadcast channel (for FloatingReactions)
    broadcastChannel: channelsRef.current?.broadcast ?? null,

    // Status
    loading,
    error,
  };
}
