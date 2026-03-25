'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  getDebate,
  getRounds,
  getDebateComments,
  getDebateSnapshots,
} from '@clashd/supabase-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  clash_rating?: number;
}

interface Debate {
  id: string;
  topic: string;
  description: string | null;
  status: string;
  format: string;
  side_a_user_id: string;
  side_b_user_id: string;
  side_a_label: string;
  side_b_label: string;
  winner_user_id: string | null;
  round_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  side_a: Profile;
  side_b: Profile;
}

interface Round {
  id: string;
  debate_id: string;
  round_number: number;
  round_type: string;
  phase: string;
  timer_started_at: string | null;
  side_a_score_argument: number | null;
  side_a_score_delivery: number | null;
  side_a_score_persuasion: number | null;
  side_b_score_argument: number | null;
  side_b_score_delivery: number | null;
  side_b_score_persuasion: number | null;
  created_at: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user: { id: string; username: string; avatar_url: string | null } | null;
}

interface Snapshot {
  id: string;
  debate_id: string;
  round_id: string | null;
  side_a_percentage: number;
  side_b_percentage: number;
  sample_size: number;
  captured_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string, baseStr: string | null): string {
  const base = baseStr ? new Date(baseStr).getTime() : 0;
  const target = new Date(dateStr).getTime();
  const diffMs = target - base;
  if (diffMs < 0) return '0:00';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function roundTypeLabel(type: string): string {
  switch (type) {
    case 'opening':
      return 'Opening';
    case 'standard':
      return 'Standard';
    case 'rebuttal':
      return 'Rebuttal';
    case 'closing':
      return 'Closing';
    case 'special':
      return 'Special';
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Score Timeline (SVG)
// ---------------------------------------------------------------------------

function ScoreTimeline({
  snapshots,
  rounds,
  debateStartedAt,
  debateCompletedAt,
  sideALabel,
  sideBLabel,
}: {
  snapshots: Snapshot[];
  rounds: Round[];
  debateStartedAt: string | null;
  debateCompletedAt: string | null;
  sideALabel: string;
  sideBLabel: string;
}) {
  if (snapshots.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-neutral-800 bg-dark">
        <p className="text-sm text-neutral-500">No audience data recorded</p>
      </div>
    );
  }

  const width = 700;
  const height = 260;
  const padding = { top: 30, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const startTime = debateStartedAt
    ? new Date(debateStartedAt).getTime()
    : new Date(snapshots[0].captured_at).getTime();
  const endTime = debateCompletedAt
    ? new Date(debateCompletedAt).getTime()
    : new Date(snapshots[snapshots.length - 1].captured_at).getTime();
  const timeRange = Math.max(endTime - startTime, 1);

  function xScale(dateStr: string): number {
    const t = new Date(dateStr).getTime();
    return padding.left + ((t - startTime) / timeRange) * chartW;
  }

  function yScale(pct: number): number {
    return padding.top + chartH - (pct / 100) * chartH;
  }

  // Build polyline points
  const sideAPoints = snapshots
    .map((s) => `${xScale(s.captured_at)},${yScale(s.side_a_percentage)}`)
    .join(' ');
  const sideBPoints = snapshots
    .map((s) => `${xScale(s.captured_at)},${yScale(s.side_b_percentage)}`)
    .join(' ');

  // Round boundaries (use created_at of each round as approximate start time)
  const roundBoundaries = rounds
    .filter((r) => r.timer_started_at)
    .map((r) => ({
      x: xScale(r.timer_started_at!),
      label: `R${r.round_number}`,
    }));

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis time labels (divide into ~5 increments)
  const xLabelCount = 5;
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i <= xLabelCount; i++) {
    const t = startTime + (timeRange * i) / xLabelCount;
    const diffSec = Math.floor((t - startTime) / 1000);
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    xLabels.push({
      x: padding.left + (chartW * i) / xLabelCount,
      label: `${m}:${s.toString().padStart(2, '0')}`,
    });
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-dark p-4">
      {/* Legend */}
      <div className="mb-3 flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-clash-red" />
          <span className="text-neutral-400">{sideALabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-clash-blue" />
          <span className="text-neutral-400">{sideBLabel}</span>
        </div>
        <span className="ml-auto text-neutral-600">Audience Sentiment Over Time</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yLabels.map((pct) => (
          <line
            key={pct}
            x1={padding.left}
            y1={yScale(pct)}
            x2={padding.left + chartW}
            y2={yScale(pct)}
            stroke="#333"
            strokeWidth="0.5"
          />
        ))}

        {/* Round boundary lines */}
        {roundBoundaries.map((rb, i) => (
          <g key={i}>
            <line
              x1={rb.x}
              y1={padding.top}
              x2={rb.x}
              y2={padding.top + chartH}
              stroke="#555"
              strokeWidth="0.8"
              strokeDasharray="4,4"
            />
            <text
              x={rb.x}
              y={padding.top - 8}
              textAnchor="middle"
              className="fill-neutral-500 text-[10px]"
            >
              {rb.label}
            </text>
          </g>
        ))}

        {/* 50% reference line */}
        <line
          x1={padding.left}
          y1={yScale(50)}
          x2={padding.left + chartW}
          y2={yScale(50)}
          stroke="#555"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Side A line */}
        <polyline
          points={sideAPoints}
          fill="none"
          stroke="#EF4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Side B line */}
        <polyline
          points={sideBPoints}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots — Side A */}
        {snapshots.map((s, i) => (
          <circle
            key={`a-${i}`}
            cx={xScale(s.captured_at)}
            cy={yScale(s.side_a_percentage)}
            r="3"
            fill="#EF4444"
          />
        ))}

        {/* Data point dots — Side B */}
        {snapshots.map((s, i) => (
          <circle
            key={`b-${i}`}
            cx={xScale(s.captured_at)}
            cy={yScale(s.side_b_percentage)}
            r="3"
            fill="#3B82F6"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((pct) => (
          <text
            key={pct}
            x={padding.left - 8}
            y={yScale(pct) + 4}
            textAnchor="end"
            className="fill-neutral-500 text-[10px]"
          >
            {pct}%
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((xl, i) => (
          <text
            key={i}
            x={xl.x}
            y={padding.top + chartH + 20}
            textAnchor="middle"
            className="fill-neutral-500 text-[10px]"
          >
            {xl.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Bar (horizontal comparison for one dimension)
// ---------------------------------------------------------------------------

function ScoreBar({
  label,
  scoreA,
  scoreB,
}: {
  label: string;
  scoreA: number;
  scoreB: number;
}) {
  const max = Math.max(scoreA, scoreB, 1);
  const widthA = (scoreA / 10) * 100; // Scores out of 10
  const widthB = (scoreB / 10) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span>
          {scoreA.toFixed(1)} vs {scoreB.toFixed(1)}
        </span>
      </div>
      <div className="flex gap-1">
        {/* Side A bar (grows right) */}
        <div className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-neutral-800">
          <div
            className="rounded-full bg-clash-red transition-all"
            style={{ width: `${widthA}%` }}
          />
        </div>
        {/* Side B bar (grows left) */}
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="rounded-full bg-clash-blue transition-all"
            style={{ width: `${widthB}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round Card
// ---------------------------------------------------------------------------

function RoundCard({
  round,
  sideALabel,
  sideBLabel,
}: {
  round: Round;
  sideALabel: string;
  sideBLabel: string;
}) {
  const aArg = round.side_a_score_argument ?? 0;
  const aDel = round.side_a_score_delivery ?? 0;
  const aPer = round.side_a_score_persuasion ?? 0;
  const bArg = round.side_b_score_argument ?? 0;
  const bDel = round.side_b_score_delivery ?? 0;
  const bPer = round.side_b_score_persuasion ?? 0;
  const aTotal = aArg + aDel + aPer;
  const bTotal = bArg + bDel + bPer;
  const aWins = aTotal > bTotal;
  const bWins = bTotal > aTotal;
  const tie = aTotal === bTotal;

  return (
    <div className="rounded-xl border border-neutral-800 bg-dark p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Round {round.round_number}</span>
          <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {roundTypeLabel(round.round_type)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm font-bold">
          <span className={aWins ? 'text-clash-red' : 'text-neutral-500'}>
            {aTotal.toFixed(1)}
          </span>
          <span className="text-xs text-neutral-600">vs</span>
          <span className={bWins ? 'text-clash-blue' : 'text-neutral-500'}>
            {bTotal.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-2">
        <ScoreBar label="Argument" scoreA={aArg} scoreB={bArg} />
        <ScoreBar label="Delivery" scoreA={aDel} scoreB={bDel} />
        <ScoreBar label="Persuasion" scoreA={aPer} scoreB={bPer} />
      </div>

      {/* Round winner indicator */}
      {!tie && (
        <div className="mt-3 text-center">
          <span
            className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
              aWins
                ? 'bg-clash-red/10 text-clash-red'
                : 'bg-clash-blue/10 text-clash-blue'
            }`}
          >
            {aWins ? sideALabel : sideBLabel} wins round
          </span>
        </div>
      )}
      {tie && (
        <div className="mt-3 text-center">
          <span className="inline-block rounded-full bg-neutral-800 px-3 py-0.5 text-xs font-medium text-neutral-400">
            Tie
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Replay
// ---------------------------------------------------------------------------

function ChatReplay({
  comments,
  debateStartedAt,
}: {
  comments: Comment[];
  debateStartedAt: string | null;
}) {
  return (
    <div className="flex max-h-[700px] flex-col rounded-xl border border-neutral-800 bg-dark">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Chat Replay
          <span className="ml-2 text-neutral-600">({comments.length})</span>
        </h2>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-600">No chat messages</p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-neutral-800/50"
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-xs text-neutral-600">
                  {formatRelativeTime(c.created_at, debateStartedAt)}
                </span>
                <span className="shrink-0 font-medium text-clash-blue">
                  {c.user?.username ?? 'anon'}
                </span>
                <span className="text-neutral-300">{c.content}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

export default function ReplayPage({ params }: ReplayPageProps) {
  const { id: debateId } = use(params);
  const supabase = createClient();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [debateRes, roundsRes, commentsRes, snapshotsRes] = await Promise.all([
        getDebate(supabase, debateId),
        getRounds(supabase, debateId),
        getDebateComments(supabase, debateId),
        getDebateSnapshots(supabase, debateId),
      ]);

      if (cancelled) return;

      if (debateRes.error || !debateRes.data) {
        setError('Debate not found.');
        setLoading(false);
        return;
      }

      setDebate(debateRes.data as unknown as Debate);
      setRounds((roundsRes.data as unknown as Round[]) ?? []);
      setComments((commentsRes.data as unknown as Comment[]) ?? []);
      setSnapshots((snapshotsRes.data as unknown as Snapshot[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debateId, supabase]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  // Error state
  if (error || !debate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400">{error ?? 'Debate not found.'}</p>
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          &larr; Back to Home
        </Link>
      </div>
    );
  }

  // Guard: only show for completed debates
  if (debate.status !== 'completed') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4">
        <div className="text-center">
          <p className="text-lg font-medium text-neutral-300">Replay not available</p>
          <p className="mt-1 text-sm text-neutral-500">
            This debate has not been completed yet.
          </p>
        </div>
        <Link
          href={`/debate/${debateId}`}
          className="text-sm text-clash-blue hover:underline"
        >
          &larr; Go to debate
        </Link>
      </div>
    );
  }

  const sideA = debate.side_a;
  const sideB = debate.side_b;
  const winnerIsSideA = debate.winner_user_id === debate.side_a_user_id;
  const winnerIsSideB = debate.winner_user_id === debate.side_b_user_id;

  const completedRounds = rounds.filter((r) => r.phase === 'completed');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Back navigation */}
      <Link
        href={`/debate/${debateId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        &larr; Back to debate
      </Link>

      {/* ----------------------------------------------------------------- */}
      {/* Header section                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-8">
        <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{debate.topic}</h1>
        {debate.description && (
          <p className="mb-4 text-sm text-neutral-400">{debate.description}</p>
        )}

        {/* VS banner */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-neutral-800 bg-dark p-6 sm:flex-row sm:justify-center sm:gap-10">
          {/* Side A */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-clash-red/20">
                <span className="text-lg font-bold text-clash-red">
                  {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
                </span>
              </div>
              {winnerIsSideA && (
                <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-black">
                  W
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold">{sideA?.username ?? 'Debater A'}</p>
              <p className="text-xs text-clash-red">{debate.side_a_label}</p>
              {winnerIsSideA && (
                <span className="mt-0.5 inline-block rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                  WINNER
                </span>
              )}
            </div>
          </div>

          <span className="text-xl font-black text-neutral-700">VS</span>

          {/* Side B */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-clash-blue/20">
                <span className="text-lg font-bold text-clash-blue">
                  {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
                </span>
              </div>
              {winnerIsSideB && (
                <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-black">
                  W
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold">{sideB?.username ?? 'Debater B'}</p>
              <p className="text-xs text-clash-blue">{debate.side_b_label}</p>
              {winnerIsSideB && (
                <span className="mt-0.5 inline-block rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                  WINNER
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Meta info */}
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-neutral-500">
          <span>{debate.format} format</span>
          <span>|</span>
          <span>{debate.round_count} rounds</span>
          <span>|</span>
          <span>
            Completed{' '}
            {debate.completed_at ? formatDate(debate.completed_at) : formatDate(debate.created_at)}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Two-column layout: Timeline + Scores | Chat                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Timeline + Round scores */}
        <div className="space-y-6 lg:col-span-2">
          {/* Score Timeline */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Audience Sentiment Timeline
            </h2>
            <ScoreTimeline
              snapshots={snapshots}
              rounds={rounds}
              debateStartedAt={debate.started_at}
              debateCompletedAt={debate.completed_at}
              sideALabel={debate.side_a_label}
              sideBLabel={debate.side_b_label}
            />
          </div>

          {/* Round-by-Round Scores */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Round-by-Round Scores
            </h2>
            {completedRounds.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-dark p-6 text-center">
                <p className="text-sm text-neutral-500">No round scores available</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {completedRounds.map((r) => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    sideALabel={debate.side_a_label}
                    sideBLabel={debate.side_b_label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Final tally */}
          {completedRounds.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-dark p-6">
              <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Final Score
              </h2>
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-xs text-neutral-500">{debate.side_a_label}</p>
                  <p className={`text-3xl font-bold ${winnerIsSideA ? 'text-clash-red' : 'text-neutral-500'}`}>
                    {completedRounds
                      .reduce(
                        (sum, r) =>
                          sum +
                          (r.side_a_score_argument ?? 0) +
                          (r.side_a_score_delivery ?? 0) +
                          (r.side_a_score_persuasion ?? 0),
                        0,
                      )
                      .toFixed(1)}
                  </p>
                  <p className="text-xs text-neutral-600">{sideA?.username}</p>
                </div>
                <span className="text-lg text-neutral-700">-</span>
                <div className="text-center">
                  <p className="text-xs text-neutral-500">{debate.side_b_label}</p>
                  <p className={`text-3xl font-bold ${winnerIsSideB ? 'text-clash-blue' : 'text-neutral-500'}`}>
                    {completedRounds
                      .reduce(
                        (sum, r) =>
                          sum +
                          (r.side_b_score_argument ?? 0) +
                          (r.side_b_score_delivery ?? 0) +
                          (r.side_b_score_persuasion ?? 0),
                        0,
                      )
                      .toFixed(1)}
                  </p>
                  <p className="text-xs text-neutral-600">{sideB?.username}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Chat replay */}
        <div>
          <ChatReplay comments={comments} debateStartedAt={debate.started_at} />
        </div>
      </div>
    </div>
  );
}
