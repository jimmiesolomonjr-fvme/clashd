import React from 'react';
import type { AggregatedScores } from '@clashd/shared';

export interface ScoreBarProps {
  label: string;
  sideAValue: number;
  sideBValue: number;
  max?: number;
}

export interface ScoreSummaryProps {
  scores: AggregatedScores;
  sideALabel: string;
  sideBLabel: string;
}

/** Calculate percentage for score bar */
export function scorePercentage(value: number, max: number = 5): number {
  return Math.round((value / max) * 100);
}
