'use client';

import { useState } from 'react';
import type { VoteScores } from '@/hooks/use-debate';

const DIMENSIONS = ['argument', 'delivery', 'persuasion'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const DIMENSION_LABELS: Record<Dimension, string> = {
  argument: 'Argument',
  delivery: 'Delivery',
  persuasion: 'Persuasion',
};

interface VotingPanelProps {
  sideALabel: string;
  sideBLabel: string;
  onSubmit: (scores: VoteScores) => Promise<void>;
  hasVoted: boolean;
}

function ScoreSelector({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: 'red' | 'blue';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="w-24 text-xs text-neutral-400">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-8 w-8 rounded-md text-xs font-bold transition-all ${
              n <= value
                ? color === 'red'
                  ? 'bg-clash-red text-white'
                  : 'bg-clash-blue text-white'
                : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VotingPanel({ sideALabel, sideBLabel, onSubmit, hasVoted }: VotingPanelProps) {
  const [scores, setScores] = useState({
    side_a_argument: 3,
    side_a_delivery: 3,
    side_a_persuasion: 3,
    side_b_argument: 3,
    side_b_delivery: 3,
    side_b_persuasion: 3,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(hasVoted);

  function updateScore(key: keyof typeof scores, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onSubmit(scores);
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-800 bg-green-900/20 p-4 text-center">
        <p className="text-sm font-medium text-green-400">Vote submitted!</p>
        <p className="mt-1 text-xs text-neutral-500">Scores will be revealed when voting ends.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Cast Your Vote
      </h3>

      {/* Side A */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-bold text-clash-red">{sideALabel}</p>
        <div className="space-y-2">
          {DIMENSIONS.map((dim) => (
            <ScoreSelector
              key={`a_${dim}`}
              label={DIMENSION_LABELS[dim]}
              value={scores[`side_a_${dim}`]}
              onChange={(v) => updateScore(`side_a_${dim}`, v)}
              color="red"
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-neutral-800" />

      {/* Side B */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-bold text-clash-blue">{sideBLabel}</p>
        <div className="space-y-2">
          {DIMENSIONS.map((dim) => (
            <ScoreSelector
              key={`b_${dim}`}
              label={DIMENSION_LABELS[dim]}
              value={scores[`side_b_${dim}`]}
              onChange={(v) => updateScore(`side_b_${dim}`, v)}
              color="blue"
            />
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="btn-red w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Submitting...
          </span>
        ) : (
          'Submit Vote'
        )}
      </button>
    </div>
  );
}
