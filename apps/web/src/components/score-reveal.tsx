'use client';

import { useState, useEffect } from 'react';

interface RoundScores {
  side_a_score_argument: number | null;
  side_a_score_delivery: number | null;
  side_a_score_persuasion: number | null;
  side_b_score_argument: number | null;
  side_b_score_delivery: number | null;
  side_b_score_persuasion: number | null;
  vote_count: number;
  round_number: number;
}

interface ScoreRevealProps {
  round: RoundScores;
  sideALabel: string;
  sideBLabel: string;
}

const DIMENSIONS = [
  { key: 'argument', label: 'Argument' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'persuasion', label: 'Persuasion' },
] as const;

function AnimatedScore({ target, delay, color }: { target: number; delay: number; color: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 800;
      const start = performance.now();

      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target * 10) / 10);
        if (progress < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    }, delay);

    return () => clearTimeout(timeout);
  }, [target, delay]);

  return (
    <span className="font-mono text-lg font-bold" style={{ color }}>
      {value.toFixed(1)}
    </span>
  );
}

function ScoreBar({
  aValue,
  bValue,
  label,
  index,
}: {
  aValue: number;
  bValue: number;
  label: string;
  index: number;
}) {
  const [visible, setVisible] = useState(false);
  const delay = index * 400;

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  const aPercent = ((aValue / 5) * 100).toFixed(0);
  const bPercent = ((bValue / 5) * 100).toFixed(0);
  const aWins = aValue > bValue;
  const bWins = bValue > aValue;

  return (
    <div
      className={`transition-all duration-500 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <div className="mb-1 text-center text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="flex items-center gap-3">
        {/* Side A score */}
        <div className="w-12 text-right">
          <AnimatedScore target={aValue} delay={delay} color={aWins ? '#EF4444' : '#A0A0A0'} />
        </div>

        {/* Bar */}
        <div className="flex flex-1 gap-0.5">
          <div className="flex h-6 flex-1 justify-end overflow-hidden rounded-l-full bg-neutral-800">
            <div
              className="h-full rounded-l-full bg-clash-red transition-all duration-1000"
              style={{
                width: visible ? `${aPercent}%` : '0%',
                transitionDelay: `${delay}ms`,
              }}
            />
          </div>
          <div className="flex h-6 flex-1 overflow-hidden rounded-r-full bg-neutral-800">
            <div
              className="h-full rounded-r-full bg-clash-blue transition-all duration-1000"
              style={{
                width: visible ? `${bPercent}%` : '0%',
                transitionDelay: `${delay}ms`,
              }}
            />
          </div>
        </div>

        {/* Side B score */}
        <div className="w-12">
          <AnimatedScore target={bValue} delay={delay} color={bWins ? '#3B82F6' : '#A0A0A0'} />
        </div>
      </div>
    </div>
  );
}

export function ScoreReveal({ round, sideALabel, sideBLabel }: ScoreRevealProps) {
  const [showTotal, setShowTotal] = useState(false);

  const aTotal =
    (round.side_a_score_argument ?? 0) +
    (round.side_a_score_delivery ?? 0) +
    (round.side_a_score_persuasion ?? 0);
  const bTotal =
    (round.side_b_score_argument ?? 0) +
    (round.side_b_score_delivery ?? 0) +
    (round.side_b_score_persuasion ?? 0);

  const winner = aTotal > bTotal ? 'a' : bTotal > aTotal ? 'b' : 'tie';

  useEffect(() => {
    const timeout = setTimeout(() => setShowTotal(true), DIMENSIONS.length * 400 + 600);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-5">
      <h3 className="mb-1 text-center text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Round {round.round_number} Scores
      </h3>
      <p className="mb-5 text-center text-xs text-neutral-600">{round.vote_count} votes</p>

      {/* Labels */}
      <div className="mb-3 flex items-center justify-between px-12">
        <span className="text-sm font-bold text-clash-red">{sideALabel}</span>
        <span className="text-sm font-bold text-clash-blue">{sideBLabel}</span>
      </div>

      {/* Dimension bars */}
      <div className="space-y-4">
        {DIMENSIONS.map((dim, i) => (
          <ScoreBar
            key={dim.key}
            label={dim.label}
            aValue={round[`side_a_score_${dim.key}` as keyof RoundScores] as number ?? 0}
            bValue={round[`side_b_score_${dim.key}` as keyof RoundScores] as number ?? 0}
            index={i}
          />
        ))}
      </div>

      {/* Total */}
      <div
        className={`mt-5 border-t border-neutral-800 pt-4 text-center transition-all duration-500 ${
          showTotal ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center justify-center gap-4">
          <div>
            <span className={`font-mono text-2xl font-black ${winner === 'a' ? 'text-clash-red' : 'text-neutral-500'}`}>
              {aTotal.toFixed(1)}
            </span>
          </div>
          <span className="text-neutral-600">vs</span>
          <div>
            <span className={`font-mono text-2xl font-black ${winner === 'b' ? 'text-clash-blue' : 'text-neutral-500'}`}>
              {bTotal.toFixed(1)}
            </span>
          </div>
        </div>
        {winner !== 'tie' && (
          <p className={`mt-2 text-sm font-medium ${winner === 'a' ? 'text-clash-red' : 'text-clash-blue'}`}>
            {winner === 'a' ? sideALabel : sideBLabel} wins this round!
          </p>
        )}
        {winner === 'tie' && <p className="mt-2 text-sm text-neutral-400">It&apos;s a tie!</p>}
      </div>
    </div>
  );
}
