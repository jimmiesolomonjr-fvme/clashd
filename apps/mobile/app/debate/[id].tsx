import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, Link } from 'expo-router';
import { useAuth } from '../../context/auth-context';
import { supabase } from '../../lib/supabase';
import {
  subscribeToDebate,
  sendReaction as sendRealtimeReaction,
  trackPresence,
  getDebate,
  getRounds,
  getDebateComments,
  getUserVote,
} from '@clashd/supabase-client';
import type { DebateRealtimeChannels } from '@clashd/supabase-client';
import { useTimerValue, formatTime } from '@clashd/ui';
import { MAX_COMMENT_LENGTH } from '@clashd/shared';
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

const REACTIONS: EmojiReaction[] = ['🔥', '👏', '💀', '🤔', '😂', '💯'];

const REPORT_REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'harassment', label: 'Harassment or Bullying' },
  { value: 'spam', label: 'Spam or Scam' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'other', label: 'Other' },
];

function phaseLabel(phase: RoundPhase | null): string {
  switch (phase) {
    case 'countdown': return 'Starting...';
    case 'side_a_speaking': return 'Side A Speaking';
    case 'side_b_speaking': return 'Side B Speaking';
    case 'voting': return 'Vote Now!';
    case 'score_reveal': return 'Scores';
    case 'completed': return 'Round Complete';
    default: return '';
  }
}

type DebateRow = any;
type RoundRow = any;
type CommentRow = any;

export default function DebateRoomScreen() {
  const { id: debateId } = useLocalSearchParams<{ id: string }>();
  const { user, session } = useAuth();

  const [debate, setDebate] = useState<DebateRow | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [audienceCount, setAudienceCount] = useState(0);
  const [presentUserIds, setPresentUserIds] = useState<string[]>([]);
  const [audienceMeter, setAudienceMeter] = useState<{
    sideA: number;
    sideB: number;
    sample: number;
  } | null>(null);
  const [muteOverride, setMuteOverride] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [voteScores, setVoteScores] = useState({
    side_a_argument: 3, side_a_delivery: 3, side_a_persuasion: 3,
    side_b_argument: 3, side_b_delivery: 3, side_b_persuasion: 3,
  });
  const [isVoting, setIsVoting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [pauseInfo, setPauseInfo] = useState<{ reportCount: number; reason: string } | null>(null);

  const channelsRef = useRef<DebateRealtimeChannels | null>(null);

  // Derived state
  const currentRound = rounds.find((r: RoundRow) => r.phase !== 'completed') ?? rounds[rounds.length - 1] ?? null;
  const phase: RoundPhase | null = currentRound?.phase ?? null;
  const debateStatus: DebateStatus | null = debate?.status ?? null;

  const isDebater =
    !!debate && !!user && (user.id === debate.side_a_user_id || user.id === debate.side_b_user_id);
  const isSpectator = !isDebater;
  const isCreator = user?.id === debate?.created_by;
  const isWaitingRoom = debateStatus === 'waiting_room';
  const isLive = debateStatus === 'live' || debateStatus === 'countdown';
  const isCompleted = debateStatus === 'completed';
  const isPaused = debateStatus === 'paused';

  const timerStartedAt = currentRound?.timer_started_at
    ? new Date(currentRound.timer_started_at).getTime()
    : null;
  const timerDurationSeconds = currentRound?.timer_duration_seconds ?? 0;
  const { remainingSeconds } = useTimerValue(timerStartedAt, timerDurationSeconds);

  // Initial data load
  useEffect(() => {
    if (!debateId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [debateRes, roundsRes, commentsRes] = await Promise.all([
          getDebate(supabase, debateId),
          getRounds(supabase, debateId),
          getDebateComments(supabase, debateId),
        ]);
        if (cancelled) return;
        if (debateRes.error) {
          setError(debateRes.error.message);
          setLoading(false);
          return;
        }
        setDebate(debateRes.data);
        setRounds(roundsRes.data ?? []);
        setComments(commentsRes.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [debateId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!debateId || !user) return;

    const channels = subscribeToDebate(supabase, debateId, {
      onBroadcast: (message: BroadcastMessage) => {
        switch (message.type) {
          case 'mute_control': {
            const msg = message as MuteControlMessage;
            if (msg.target_user_id === user.id) setMuteOverride(msg.muted);
            break;
          }
          case 'timer_sync': {
            const msg = message as TimerSyncMessage;
            setRounds((prev: RoundRow[]) =>
              prev.map((r: RoundRow) => {
                if (r.id !== msg.round_id) return r;
                const startedAt = new Date(
                  msg.server_timestamp - (r.timer_duration_seconds - msg.remaining_seconds) * 1000,
                ).toISOString();
                return { ...r, timer_started_at: startedAt, phase: msg.phase };
              }),
            );
            break;
          }
          case 'audience_meter': {
            const msg = message as AudienceMeterMessage;
            setAudienceMeter({
              sideA: msg.side_a_percentage,
              sideB: msg.side_b_percentage,
              sample: msg.sample_size,
            });
            break;
          }
          case 'debate_paused': {
            const msg = message as DebatePausedMessage;
            setPauseInfo({ reportCount: msg.report_count, reason: msg.reason });
            break;
          }
        }
      },
      onDebateChange: (payload) => {
        setDebate((prev: DebateRow | null) => (prev ? { ...prev, ...payload.new } : prev));
      },
      onRoundChange: (payload) => {
        const updated = payload.new;
        setRounds((prev: RoundRow[]) => {
          const idx = prev.findIndex((r: RoundRow) => r.id === updated.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [...prev, updated].sort((a: RoundRow, b: RoundRow) => a.round_number - b.round_number);
        });
        setMuteOverride(null);
      },
      onNewComment: (payload) => {
        const newComment = payload.new;
        setComments((prev: CommentRow[]) => {
          if (prev.some((c: CommentRow) => c.id === newComment.id)) return prev;
          return [...prev, newComment];
        });
      },
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

    const presencePayload: PresenceState = {
      user_id: user.id,
      username: '',
      avatar_url: null,
      joined_at: Date.now(),
    };
    trackPresence(channels.presence, presencePayload);

    return () => {
      channels.cleanup();
      channelsRef.current = null;
    };
  }, [debateId, user]);

  // Vote status check
  useEffect(() => {
    if (!currentRound || !user) { setHasVoted(false); return; }
    let cancelled = false;
    getUserVote(supabase, currentRound.id, user.id).then(({ data }) => {
      if (!cancelled) setHasVoted(!!data);
    });
    return () => { cancelled = true; };
  }, [currentRound?.id, user]);

  async function handleSubmitVote() {
    if (!currentRound || !session || isVoting) return;
    setIsVoting(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ debate_id: debateId, round_id: currentRound.id, ...voteScores }),
      });
      if (res.ok) setHasVoted(true);
    } finally {
      setIsVoting(false);
    }
  }

  async function handleSendComment() {
    const trimmed = commentInput.trim();
    if (!trimmed || !user) return;
    const truncated = trimmed.slice(0, MAX_COMMENT_LENGTH);
    await supabase.from('comments').insert({
      debate_id: debateId!,
      user_id: user.id,
      content: truncated,
    });
    setCommentInput('');
  }

  async function handleReaction(emoji: EmojiReaction) {
    if (!channelsRef.current || !user) return;
    await sendRealtimeReaction(channelsRef.current.broadcast, emoji, user.id);
  }

  async function handleStartDebate() {
    if (!session) return;
    await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/start-debate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ debate_id: debateId, present_user_ids: presentUserIds }),
    });
  }

  async function submitReport(reason: ReportReason, details?: string) {
    if (!session || !debateId) return;
    setIsReporting(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ debate_id: debateId, reason, details: details || undefined }),
      });
      if (res.ok) {
        Alert.alert('Report Submitted', 'Thank you for helping keep Clashd safe.');
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  }

  function handleReport() {
    const labels = REPORT_REASON_OPTIONS.map((r) => r.label);

    function onReasonSelected(reasonIndex: number) {
      const selectedReason = REPORT_REASON_OPTIONS[reasonIndex].value;
      // Ask for optional details
      Alert.prompt(
        'Additional Details',
        'Optionally describe what happened (max 500 characters).',
        [
          { text: 'Skip', onPress: () => submitReport(selectedReason) },
          {
            text: 'Submit',
            onPress: (detailsText) => submitReport(selectedReason, detailsText?.slice(0, 500)),
          },
        ],
        'plain-text',
        '',
        'default',
      );
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Report this Debate',
          message: 'Why are you reporting this debate?',
          options: [...labels, 'Cancel'],
          cancelButtonIndex: labels.length,
          destructiveButtonIndex: undefined,
        },
        (buttonIndex) => {
          if (buttonIndex < labels.length) {
            onReasonSelected(buttonIndex);
          }
        },
      );
    } else {
      // Android fallback: use Alert with buttons for reason selection
      Alert.alert(
        'Report this Debate',
        'Why are you reporting this debate?',
        [
          ...REPORT_REASON_OPTIONS.map((option, idx) => ({
            text: option.label,
            onPress: () => onReasonSelected(idx),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Debate Room' }} />
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !debate) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Debate Room' }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Debate not found'}</Text>
          <Link href="/" style={styles.backLink}>
            <Text style={styles.backLinkText}>Back to Home</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  const sideA = debate.side_a;
  const sideB = debate.side_b;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: debate.topic, headerBackTitle: 'Back' }} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status badge */}
        <View style={styles.statusRow}>
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          {isWaitingRoom && (
            <View style={styles.waitingBadge}>
              <Text style={styles.waitingText}>WAITING ROOM</Text>
            </View>
          )}
          {isCompleted && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedText}>COMPLETED</Text>
            </View>
          )}
          <Text style={styles.audienceText}>{audienceCount} watching</Text>
          {/* Report button — only for spectators */}
          {isSpectator && user && (
            <TouchableOpacity
              style={[styles.reportBtn, isReporting && { opacity: 0.5 }]}
              onPress={handleReport}
              disabled={isReporting}
            >
              <Text style={styles.reportBtnText}>Report</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Video placeholders (split screen) */}
        <View style={styles.videoRow}>
          <View style={styles.videoBox}>
            <View style={[styles.avatarCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <Text style={[styles.avatarLetter, { color: '#EF4444' }]}>
                {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
              </Text>
            </View>
            <Text style={styles.debaterName}>{sideA?.username ?? 'Debater A'}</Text>
            <View style={[styles.sideLabel, { backgroundColor: 'rgba(239,68,68,0.85)' }]}>
              <Text style={styles.sideLabelText}>{debate.side_a_label}</Text>
            </View>
            {phase === 'side_a_speaking' && (
              <View style={styles.speakingBadge}>
                <Text style={styles.speakingText}>SPEAKING</Text>
              </View>
            )}
          </View>

          <View style={styles.videoBox}>
            <View style={[styles.avatarCircle, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
              <Text style={[styles.avatarLetter, { color: '#3B82F6' }]}>
                {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
              </Text>
            </View>
            <Text style={styles.debaterName}>{sideB?.username ?? 'Debater B'}</Text>
            <View style={[styles.sideLabel, { backgroundColor: 'rgba(59,130,246,0.85)' }]}>
              <Text style={styles.sideLabelText}>{debate.side_b_label}</Text>
            </View>
            {phase === 'side_b_speaking' && (
              <View style={styles.speakingBadge}>
                <Text style={styles.speakingText}>SPEAKING</Text>
              </View>
            )}
          </View>
        </View>

        {/* Pause overlay */}
        {isPaused && (
          <View style={styles.pauseOverlay}>
            <View style={styles.pauseIconCircle}>
              <Text style={styles.pauseIconText}>!</Text>
            </View>
            <Text style={styles.pauseHeading}>Debate Paused</Text>
            <Text style={styles.pauseSubtext}>
              This debate has been paused for review due to community reports.
            </Text>
            {pauseInfo?.reason ? (
              <Text style={styles.pauseReason}>Reason: {pauseInfo.reason}</Text>
            ) : null}
            {pauseInfo?.reportCount != null && pauseInfo.reportCount > 0 ? (
              <View style={styles.pauseReportBadge}>
                <Text style={styles.pauseReportText}>
                  Reports received: {pauseInfo.reportCount}
                </Text>
              </View>
            ) : null}
            <Text style={styles.pauseFooter}>
              A moderator will review shortly. Please stand by.
            </Text>
          </View>
        )}

        {/* Audience meter */}
        {audienceMeter && (
          <View style={styles.meterContainer}>
            <View style={styles.meterBar}>
              <View style={[styles.meterFillA, { width: `${audienceMeter.sideA}%` as any }]} />
              <View style={[styles.meterFillB, { width: `${audienceMeter.sideB}%` as any }]} />
            </View>
            <View style={styles.meterLabels}>
              <Text style={styles.meterLabelA}>{audienceMeter.sideA}%</Text>
              <Text style={styles.meterSample}>{audienceMeter.sample} votes</Text>
              <Text style={styles.meterLabelB}>{audienceMeter.sideB}%</Text>
            </View>
          </View>
        )}

        {/* Timer */}
        {isLive && currentRound && (
          <View style={styles.timerContainer}>
            <Text style={styles.roundInfo}>
              Round {currentRound.round_number} of {debate.round_count}
            </Text>
            <View style={styles.timerBox}>
              <Text style={[styles.timerText, remainingSeconds <= 10 && { color: '#EF4444' }]}>
                {formatTime(remainingSeconds)}
              </Text>
            </View>
            <Text style={styles.phaseText}>{phaseLabel(phase)}</Text>
          </View>
        )}

        {/* Waiting room enhanced view */}
        {isWaitingRoom && (
          <View style={styles.waitingRoomPanel}>
            <View style={styles.waitingRoomDebaters}>
              <View style={styles.waitingRoomDebater}>
                <View style={[styles.avatarCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                  <Text style={[styles.avatarLetter, { color: '#EF4444' }]}>
                    {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
                  </Text>
                </View>
                <Text style={styles.debaterName}>{sideA?.username ?? 'Debater A'}</Text>
                <View style={[styles.presenceDot, presentUserIds.includes(debate.side_a_user_id) ? styles.presenceOnline : styles.presenceOffline]} />
                <Text style={styles.presenceLabel}>
                  {presentUserIds.includes(debate.side_a_user_id) ? 'In room' : 'Not here yet'}
                </Text>
              </View>
              <Text style={styles.vsText}>VS</Text>
              <View style={styles.waitingRoomDebater}>
                <View style={[styles.avatarCircle, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                  <Text style={[styles.avatarLetter, { color: '#3B82F6' }]}>
                    {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
                  </Text>
                </View>
                <Text style={styles.debaterName}>{sideB?.username ?? 'Debater B'}</Text>
                <View style={[styles.presenceDot, presentUserIds.includes(debate.side_b_user_id) ? styles.presenceOnline : styles.presenceOffline]} />
                <Text style={styles.presenceLabel}>
                  {presentUserIds.includes(debate.side_b_user_id) ? 'In room' : 'Not here yet'}
                </Text>
              </View>
            </View>
            {isCreator ? (
              <TouchableOpacity
                style={[styles.startBtn, !(presentUserIds.includes(debate.side_a_user_id) && presentUserIds.includes(debate.side_b_user_id)) && { opacity: 0.5 }]}
                onPress={handleStartDebate}
                disabled={!(presentUserIds.includes(debate.side_a_user_id) && presentUserIds.includes(debate.side_b_user_id))}
              >
                <Text style={styles.startBtnText}>Start Debate</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.waitingCreatorText}>Waiting for the debate creator to start...</Text>
            )}
          </View>
        )}

        {/* Reactions */}
        {isLive && (
          <View style={styles.reactionsRow}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionBtn}
                onPress={() => handleReaction(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Voting panel */}
        {phase === 'voting' && !isDebater && user && (
          hasVoted ? (
            <View style={styles.votedBanner}>
              <Text style={styles.votedText}>Vote submitted! Waiting for results...</Text>
            </View>
          ) : (
            <View style={styles.votingPanel}>
              <Text style={styles.votingTitle}>CAST YOUR VOTE</Text>
              {(['a', 'b'] as const).map((side) => (
                <View key={side} style={{ marginBottom: 12 }}>
                  <Text style={[styles.votingSideLabel, { color: side === 'a' ? '#EF4444' : '#3B82F6' }]}>
                    {side === 'a' ? debate?.side_a_label : debate?.side_b_label}
                  </Text>
                  {(['argument', 'delivery', 'persuasion'] as const).map((dim) => {
                    const key = `side_${side}_${dim}` as keyof typeof voteScores;
                    return (
                      <View key={dim} style={styles.votingDimRow}>
                        <Text style={styles.votingDimLabel}>{dim[0].toUpperCase() + dim.slice(1)}</Text>
                        <View style={styles.votingBtns}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setVoteScores((p) => ({ ...p, [key]: n }))}
                              style={[
                                styles.votingBtn,
                                n <= voteScores[key] && {
                                  backgroundColor: side === 'a' ? '#EF4444' : '#3B82F6',
                                },
                              ]}
                            >
                              <Text style={[styles.votingBtnText, n <= voteScores[key] && { color: '#fff' }]}>
                                {n}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
              <TouchableOpacity
                style={[styles.startBtn, isVoting && { opacity: 0.5 }]}
                onPress={handleSubmitVote}
                disabled={isVoting}
              >
                {isVoting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.startBtnText}>Submit Vote</Text>
                )}
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Score reveal */}
        {phase === 'score_reveal' && currentRound && (
          <View style={styles.scoreRevealPanel}>
            <Text style={styles.votingTitle}>ROUND {currentRound.round_number} SCORES</Text>
            {(['argument', 'delivery', 'persuasion'] as const).map((dim) => {
              const aVal = currentRound[`side_a_score_${dim}`] ?? 0;
              const bVal = currentRound[`side_b_score_${dim}`] ?? 0;
              return (
                <View key={dim} style={styles.scoreRow}>
                  <Text style={[styles.scoreVal, aVal > bVal && { color: '#EF4444', fontWeight: '800' }]}>
                    {Number(aVal).toFixed(1)}
                  </Text>
                  <Text style={styles.scoreDimLabel}>{dim[0].toUpperCase() + dim.slice(1)}</Text>
                  <Text style={[styles.scoreVal, bVal > aVal && { color: '#3B82F6', fontWeight: '800' }]}>
                    {Number(bVal).toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Chat */}
        <View style={styles.chatSection}>
          <Text style={styles.chatTitle}>Live Chat ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.chatEmpty}>No messages yet</Text>
          ) : (
            comments.slice(-50).map((c: CommentRow) => (
              <View key={c.id} style={styles.chatMessage}>
                <Text style={styles.chatUser}>{c.user?.username ?? 'anon'}</Text>
                <Text style={styles.chatContent}>{c.content}</Text>
              </View>
            ))
          )}
        </View>

        {/* Chat input */}
        {user && (
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={commentInput}
              onChangeText={setCommentInput}
              placeholder="Send a message..."
              placeholderTextColor="#6B7280"
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !commentInput.trim() && { opacity: 0.5 }]}
              onPress={handleSendComment}
              disabled={!commentInput.trim()}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  scroll: { padding: 16, paddingBottom: 40 },
  errorText: { color: '#EF4444', fontSize: 16, marginBottom: 12 },
  backLink: { marginTop: 8 },
  backLinkText: { color: '#A0A0A0', fontSize: 14 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  liveText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  waitingBadge: { backgroundColor: 'rgba(234,179,8,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  waitingText: { fontSize: 11, fontWeight: '600', color: '#FBBF24' },
  completedBadge: { backgroundColor: '#262626', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  completedText: { fontSize: 11, fontWeight: '600', color: '#A0A0A0' },
  audienceText: { fontSize: 12, color: '#6B7280', marginLeft: 'auto' },

  videoRow: { flexDirection: 'row', gap: 4, marginBottom: 12 },
  videoBox: {
    flex: 1,
    aspectRatio: 16 / 9,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatarLetter: { fontSize: 18, fontWeight: '800' },
  debaterName: { fontSize: 12, color: '#A0A0A0' },
  sideLabel: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideLabelText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  speakingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(22,163,74,0.85)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  speakingText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  meterContainer: { marginBottom: 12 },
  meterBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#262626' },
  meterFillA: { backgroundColor: '#EF4444' },
  meterFillB: { backgroundColor: '#3B82F6' },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meterLabelA: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  meterSample: { fontSize: 11, color: '#6B7280' },
  meterLabelB: { fontSize: 11, fontWeight: '600', color: '#3B82F6' },

  timerContainer: { alignItems: 'center', marginBottom: 16 },
  roundInfo: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  timerBox: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  timerText: { fontSize: 28, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  phaseText: { fontSize: 13, color: '#A0A0A0', marginTop: 6 },

  startBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  reactionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  reactionBtn: { backgroundColor: '#262626', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  reactionEmoji: { fontSize: 20 },

  chatSection: { marginBottom: 12 },
  chatTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  chatEmpty: { textAlign: 'center', color: '#404040', paddingVertical: 20, fontSize: 13 },
  chatMessage: { flexDirection: 'row', marginBottom: 6, flexWrap: 'wrap' },
  chatUser: { fontSize: 13, fontWeight: '600', color: '#3B82F6', marginRight: 6 },
  chatContent: { fontSize: 13, color: '#D4D4D4', flex: 1 },

  chatInputRow: { flexDirection: 'row', gap: 8 },
  chatInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
  },
  sendBtn: {
    backgroundColor: '#262626',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendBtnText: { color: '#D4D4D4', fontSize: 13, fontWeight: '600' },

  votingPanel: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, marginBottom: 16 },
  votingTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 12 },
  votingSideLabel: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  votingDimRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  votingDimLabel: { fontSize: 12, color: '#A0A0A0', width: 80 },
  votingBtns: { flexDirection: 'row', gap: 4 },
  votingBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#262626', justifyContent: 'center', alignItems: 'center' },
  votingBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },

  votedBanner: { backgroundColor: 'rgba(22,163,74,0.15)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)', padding: 16, marginBottom: 16, alignItems: 'center' },
  votedText: { fontSize: 14, fontWeight: '600', color: '#4ADE80' },

  scoreRevealPanel: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, marginBottom: 16 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  scoreVal: { fontSize: 18, fontWeight: '600', color: '#A0A0A0', width: 50, textAlign: 'center', fontVariant: ['tabular-nums'] },
  scoreDimLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 },

  waitingRoomPanel: { marginBottom: 16 },
  waitingRoomDebaters: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  waitingRoomDebater: { flex: 1, alignItems: 'center', gap: 4 },
  vsText: { fontSize: 20, fontWeight: '800', color: '#404040' },
  presenceDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  presenceOnline: { backgroundColor: '#22C55E' },
  presenceOffline: { backgroundColor: '#6B7280' },
  presenceLabel: { fontSize: 11, color: '#6B7280' },
  waitingCreatorText: { fontSize: 14, color: '#A0A0A0', textAlign: 'center' },

  reportBtn: {
    backgroundColor: '#262626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reportBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0A0A0',
  },

  pauseOverlay: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  pauseIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(234,179,8,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pauseIconText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FBBF24',
  },
  pauseHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pauseSubtext: {
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  pauseReason: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  pauseReportBadge: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  pauseReportText: {
    fontSize: 13,
    color: '#D4D4D4',
  },
  pauseFooter: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});
