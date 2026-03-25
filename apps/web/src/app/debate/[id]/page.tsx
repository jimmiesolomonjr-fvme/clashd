'use client';

import { use, useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useDebate } from '@/hooks/use-debate';
import { useAgora, WebAgoraAdapter } from '@clashd/agora-client';
import { useTimerValue, formatTime } from '@clashd/ui';
import type { EmojiReaction, RoundPhase } from '@clashd/shared';
import { FloatingReactions } from '@/components/floating-reactions';
import { VotingPanel } from '@/components/voting-panel';
import { ScoreReveal } from '@/components/score-reveal';
import { WaitingRoom } from '@/components/waiting-room';
import { PauseOverlay } from '@/components/pause-overlay';
import { ReportButton } from '@/components/report-button';
import { PreRollAd } from '@/components/pre-roll-ad';
import { useSubscription } from '@/hooks/use-subscription';

const REACTIONS: EmojiReaction[] = ['🔥', '👏', '💀', '🤔', '😂', '💯', '👎', '❤️'];

function phaseLabel(phase: RoundPhase | null): string {
  switch (phase) {
    case 'countdown':
      return 'Starting...';
    case 'side_a_speaking':
      return 'Side A Speaking';
    case 'side_a_transition':
      return 'Transition';
    case 'side_b_speaking':
      return 'Side B Speaking';
    case 'side_b_transition':
      return 'Transition';
    case 'voting':
      return 'Vote Now!';
    case 'score_reveal':
      return 'Scores';
    case 'completed':
      return 'Round Complete';
    default:
      return '';
  }
}

interface DebatePageProps {
  params: Promise<{ id: string }>;
}

export default function DebatePage({ params }: DebatePageProps) {
  const { id: debateId } = use(params);
  const { user, isLoading: authLoading } = useAuth();
  const { isPlus } = useSubscription();
  const supabase = createClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [commentInput, setCommentInput] = useState('');
  const [showAd, setShowAd] = useState(true);
  const handleAdComplete = useCallback(() => setShowAd(false), []);

  const {
    debate,
    currentRound,
    phase,
    debateStatus,
    isMyTurn,
    timerStartedAt,
    timerDurationSeconds,
    isMuted,
    shouldBeMuted,
    comments,
    audienceCount,
    audienceMeter,
    isDebater,
    isSpectator,
    actions,
    isPaused,
    pauseInfo,
    hasVoted,
    presentUserIds,
    broadcastChannel,
    loading,
    error,
    rounds,
  } = useDebate({
    debateId,
    userId: user?.id ?? '',
    supabase,
  });

  const { remainingSeconds } = useTimerValue(timerStartedAt, timerDurationSeconds);

  // Agora video — only connect when debate is live and we have an agora channel
  const agoraAdapter = useRef(new WebAgoraAdapter());
  const agoraEnabled = !!debate?.agora_channel_id && (debateStatus === 'live' || debateStatus === 'countdown');

  const {
    localVideoTrack,
    remoteUsers,
    isJoined: agoraJoined,
    error: agoraError,
  } = useAgora({
    adapter: agoraAdapter.current,
    appId: process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '',
    token: '', // Token would come from agora-token Edge Function
    channelId: debate?.agora_channel_id ?? '',
    uid: user ? parseInt(user.id.replace(/-/g, '').slice(0, 8), 16) : 0,
    role: isDebater ? 'host' : 'audience',
    enabled: agoraEnabled,
  });

  // Enforce mute state on local audio track
  useEffect(() => {
    if (isDebater && agoraJoined) {
      agoraAdapter.current.muteLocalAudio(isMuted).catch(() => {});
    }
  }, [isMuted, isDebater, agoraJoined]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  // Video element refs
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);

  // Play local video track
  useEffect(() => {
    if (localVideoTrack && localVideoRef.current) {
      localVideoTrack.play(localVideoRef.current);
      return () => localVideoTrack.stop();
    }
  }, [localVideoTrack]);

  // Play remote video track (first remote user = the other debater)
  useEffect(() => {
    const remoteUser = remoteUsers[0];
    if (remoteUser?.videoTrack && remoteVideoRef.current) {
      remoteUser.videoTrack.play(remoteVideoRef.current);
      return () => remoteUser.videoTrack?.stop();
    }
  }, [remoteUsers]);

  async function handleSendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentInput.trim()) return;
    await actions.sendComment(commentInput);
    setCommentInput('');
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400">{error}</p>
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          &larr; Back to Home
        </Link>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4">
        <p className="text-neutral-400">Debate not found.</p>
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          &larr; Back to Home
        </Link>
      </div>
    );
  }

  const sideA = debate.side_a;
  const sideB = debate.side_b;
  const isCreator = user?.id === debate.created_by;
  const isWaitingRoom = debateStatus === 'waiting_room';
  const isLive = debateStatus === 'live' || debateStatus === 'countdown';
  const isCompleted = debateStatus === 'completed';
  const roundNumber = currentRound?.round_number ?? 0;
  const totalRounds = debate.round_count;

  // Show dedicated waiting room view
  if (isWaitingRoom) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
        >
          &larr; Back
        </Link>
        <WaitingRoom
          debateId={debateId}
          topic={debate.topic}
          description={debate.description}
          sideALabel={debate.side_a_label}
          sideBLabel={debate.side_b_label}
          sideA={{ ...sideA, userId: debate.side_a_user_id }}
          sideB={{ ...sideB, userId: debate.side_b_user_id }}
          isCreator={isCreator}
          sideAPresent={presentUserIds.includes(debate.side_a_user_id)}
          sideBPresent={presentUserIds.includes(debate.side_b_user_id)}
          audienceCount={audienceCount}
          onStart={actions.startDebate}
        />
      </div>
    );
  }

  // Show pre-roll ad before live debate content (free users only)
  if (isLive && showAd) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <PreRollAd
          onComplete={handleAdComplete}
          isPlus={isPlus}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      {/* Back navigation */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        &larr; Back
      </Link>

      {/* Debate title bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{debate.topic}</h1>
          {debate.description && (
            <p className="mt-1 truncate text-sm text-neutral-500">{debate.description}</p>
          )}
        </div>
        <div className="ml-4 flex items-center gap-3">
          {isLive && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clash-red opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-clash-red" />
              </span>
              <span className="text-sm font-medium text-clash-red">LIVE</span>
            </div>
          )}
          {isCompleted && (
            <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">
              COMPLETED
            </span>
          )}
          <span className="text-xs text-neutral-500">{audienceCount} watching</span>
          {/* Report button — only visible for spectators (not debaters) */}
          {isSpectator && user && (
            <ReportButton onSubmit={actions.submitReport} />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main video area */}
        <div className="lg:col-span-2">
          {/* Split-screen video */}
          <div className="relative grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
            {/* Floating emoji reactions overlay */}
            <FloatingReactions channel={broadcastChannel} />
            {/* Pause overlay — shown when debate is paused for moderation */}
            {isPaused && (
              <PauseOverlay
                reportCount={pauseInfo?.reportCount}
                reason={pauseInfo?.reason}
              />
            )}
            {/* Side A (creator) */}
            <div className="relative flex aspect-video items-center justify-center bg-neutral-900">
              {isDebater && user?.id === debate.side_a_user_id ? (
                <div ref={localVideoRef} className="absolute inset-0" />
              ) : (
                <div ref={remoteVideoRef} className="absolute inset-0" />
              )}
              {/* Fallback avatar */}
              {!agoraJoined && (
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-clash-red/20">
                    <span className="text-lg font-bold text-clash-red">
                      {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400">{sideA?.username ?? 'Debater A'}</p>
                </div>
              )}
              <div className="absolute bottom-2 left-2 rounded-md bg-clash-red/90 px-2 py-0.5 text-xs font-semibold text-white">
                {debate.side_a_label}
              </div>
              {/* Speaking indicator */}
              {phase === 'side_a_speaking' && (
                <div className="absolute left-2 top-2 rounded-md bg-green-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                  SPEAKING
                </div>
              )}
              {/* Muted overlay for non-speaking debater */}
              {isLive && phase !== 'side_a_speaking' && phase !== 'voting' && phase !== 'score_reveal' && (
                <div className="absolute right-2 top-2 rounded-md bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-400">
                  MUTED
                </div>
              )}
            </div>

            {/* Side B (opponent) */}
            <div className="relative flex aspect-video items-center justify-center bg-neutral-900">
              {isDebater && user?.id === debate.side_b_user_id ? (
                <div ref={localVideoRef} className="absolute inset-0" />
              ) : remoteUsers.length > 0 ? (
                <div ref={remoteVideoRef} className="absolute inset-0" />
              ) : null}
              {!agoraJoined && (
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-clash-blue/20">
                    <span className="text-lg font-bold text-clash-blue">
                      {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400">{sideB?.username ?? 'Debater B'}</p>
                </div>
              )}
              <div className="absolute bottom-2 right-2 rounded-md bg-clash-blue/90 px-2 py-0.5 text-xs font-semibold text-white">
                {debate.side_b_label}
              </div>
              {phase === 'side_b_speaking' && (
                <div className="absolute right-2 top-2 rounded-md bg-green-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                  SPEAKING
                </div>
              )}
              {isLive && phase !== 'side_b_speaking' && phase !== 'voting' && phase !== 'score_reveal' && (
                <div className="absolute left-2 top-2 rounded-md bg-neutral-900/80 px-2 py-0.5 text-xs text-neutral-400">
                  MUTED
                </div>
              )}
            </div>
          </div>

          {/* Audience meter bar */}
          {audienceMeter && (
            <>
              <div className="mt-4 overflow-hidden rounded-full bg-neutral-800">
                <div className="flex h-3">
                  <div
                    className="bg-clash-red transition-all duration-500"
                    style={{ width: `${audienceMeter.sideAPercentage}%` }}
                  />
                  <div
                    className="bg-clash-blue transition-all duration-500"
                    style={{ width: `${audienceMeter.sideBPercentage}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="font-medium text-clash-red">
                  {audienceMeter.sideAPercentage}% {debate.side_a_label}
                </span>
                <span className="text-neutral-500">{audienceMeter.sampleSize} votes</span>
                <span className="font-medium text-clash-blue">
                  {audienceMeter.sideBPercentage}% {debate.side_b_label}
                </span>
              </div>
            </>
          )}

          {/* Timer and round info */}
          {isLive && currentRound && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <span className="text-sm text-neutral-500">
                Round {roundNumber} of {totalRounds}
              </span>
              <div className="rounded-lg border border-neutral-700 bg-dark px-4 py-2">
                <span className={`font-mono text-xl font-bold ${remainingSeconds <= 10 ? 'text-clash-red' : 'text-white'}`}>
                  {formatTime(remainingSeconds)}
                </span>
              </div>
              <span className="text-sm text-neutral-400">{phaseLabel(phase)}</span>
            </div>
          )}

          {/* Debater controls */}
          {isDebater && isMyTurn && (
            <div className="mt-3 text-center">
              <span className="inline-block rounded-full bg-green-900/50 px-4 py-1 text-sm font-medium text-green-400">
                Your turn to speak
              </span>
            </div>
          )}
          {isDebater && !isMyTurn && isLive && shouldBeMuted && (
            <div className="mt-3 text-center">
              <span className="inline-block rounded-full bg-neutral-800 px-4 py-1 text-sm text-neutral-400">
                Microphone muted — waiting for your turn
              </span>
            </div>
          )}

          {/* Agora error */}
          {agoraError && (
            <p className="mt-3 text-center text-sm text-red-400">{agoraError}</p>
          )}

          {/* Reactions bar */}
          {isLive && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => actions.sendReaction(emoji)}
                  className="rounded-lg bg-neutral-800 px-3 py-2 text-lg transition-colors hover:bg-neutral-700 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Voting panel — shown during voting phase for non-debaters */}
          {phase === 'voting' && !isDebater && user && (
            <div className="mt-4">
              <VotingPanel
                sideALabel={debate.side_a_label}
                sideBLabel={debate.side_b_label}
                onSubmit={actions.submitVote}
                hasVoted={hasVoted}
              />
            </div>
          )}

          {/* Score reveal — shown during score_reveal phase */}
          {phase === 'score_reveal' && currentRound && (
            <div className="mt-4">
              <ScoreReveal
                round={currentRound}
                sideALabel={debate.side_a_label}
                sideBLabel={debate.side_b_label}
              />
            </div>
          )}

          {/* Score display for completed rounds */}
          {isCompleted && debate.winner_user_id && (
            <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-center">
              <p className="mb-2 text-sm uppercase tracking-wider text-neutral-400">Winner</p>
              <p className="text-2xl font-bold">
                {debate.winner_user_id === debate.side_a_user_id
                  ? sideA?.username
                  : sideB?.username}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar: Chat */}
        <div className="flex flex-col gap-4">
          <div className="card flex max-h-[600px] flex-1 flex-col">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Live Chat
              <span className="ml-2 text-neutral-600">({comments.length})</span>
            </h2>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {comments.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-600">No messages yet</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-medium text-clash-blue">
                    {(c as any).user?.username ?? 'anon'}
                  </span>
                  <span className="ml-2 text-neutral-300">{c.content}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {user ? (
              <form onSubmit={handleSendComment} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Send a message..."
                  maxLength={500}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!commentInput.trim()}
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            ) : (
              <div className="mt-3 text-center">
                <Link href={`/login?redirectTo=/debate/${debateId}`} className="text-sm text-neutral-400 hover:text-white">
                  Sign in to chat
                </Link>
              </div>
            )}
          </div>

          {/* Round scores summary */}
          {rounds.filter((r) => r.phase === 'completed').length > 0 && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Round Scores
              </h2>
              <div className="space-y-2">
                {rounds
                  .filter((r) => r.phase === 'completed')
                  .map((r) => {
                    const aTotal =
                      (r.side_a_score_argument ?? 0) +
                      (r.side_a_score_delivery ?? 0) +
                      (r.side_a_score_persuasion ?? 0);
                    const bTotal =
                      (r.side_b_score_argument ?? 0) +
                      (r.side_b_score_delivery ?? 0) +
                      (r.side_b_score_persuasion ?? 0);
                    return (
                      <div key={r.id} className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">R{r.round_number}</span>
                        <span className={aTotal > bTotal ? 'font-bold text-clash-red' : 'text-neutral-400'}>
                          {aTotal.toFixed(1)}
                        </span>
                        <span className="text-neutral-600">vs</span>
                        <span className={bTotal > aTotal ? 'font-bold text-clash-blue' : 'text-neutral-400'}>
                          {bTotal.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
