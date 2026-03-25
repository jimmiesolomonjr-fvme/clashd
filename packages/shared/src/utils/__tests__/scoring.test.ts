import { describe, it, expect } from 'vitest';
import { aggregateVotes, calculateRatingChange } from '../scoring';
import type { Vote } from '../../types/database';

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: 'vote-1',
    round_id: 'round-1',
    user_id: 'user-1',
    side_a_argument: 3,
    side_a_delivery: 3,
    side_a_persuasion: 3,
    side_b_argument: 3,
    side_b_delivery: 3,
    side_b_persuasion: 3,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('aggregateVotes', () => {
  it('returns zeros for empty votes', () => {
    const result = aggregateVotes([]);
    expect(result.vote_count).toBe(0);
    expect(result.side_a_total).toBe(0);
    expect(result.winner).toBe('tie');
  });

  it('aggregates a single vote correctly', () => {
    const vote = makeVote({
      side_a_argument: 5,
      side_a_delivery: 4,
      side_a_persuasion: 3,
      side_b_argument: 2,
      side_b_delivery: 3,
      side_b_persuasion: 1,
    });
    const result = aggregateVotes([vote]);
    expect(result.side_a_total).toBe(12);
    expect(result.side_b_total).toBe(6);
    expect(result.winner).toBe('side_a');
    expect(result.vote_count).toBe(1);
  });

  it('averages multiple votes', () => {
    const votes = [
      makeVote({
        side_a_argument: 5,
        side_a_delivery: 5,
        side_a_persuasion: 5,
        side_b_argument: 1,
        side_b_delivery: 1,
        side_b_persuasion: 1,
      }),
      makeVote({
        side_a_argument: 1,
        side_a_delivery: 1,
        side_a_persuasion: 1,
        side_b_argument: 5,
        side_b_delivery: 5,
        side_b_persuasion: 5,
      }),
    ];
    const result = aggregateVotes(votes);
    expect(result.side_a_argument).toBe(3);
    expect(result.side_b_argument).toBe(3);
    expect(result.winner).toBe('tie');
  });

  it('detects side_b winner', () => {
    const votes = [
      makeVote({
        side_a_argument: 1,
        side_a_delivery: 1,
        side_a_persuasion: 1,
        side_b_argument: 5,
        side_b_delivery: 5,
        side_b_persuasion: 5,
      }),
    ];
    const result = aggregateVotes(votes);
    expect(result.winner).toBe('side_b');
  });
});

describe('calculateRatingChange', () => {
  it('gives positive delta to winner and negative to loser', () => {
    const { winnerDelta, loserDelta } = calculateRatingChange(1000, 1000);
    expect(winnerDelta).toBeGreaterThan(0);
    expect(loserDelta).toBeLessThan(0);
  });

  it('gives equal deltas for equal ratings', () => {
    const { winnerDelta, loserDelta } = calculateRatingChange(1000, 1000);
    expect(winnerDelta).toBe(16); // K/2 for 50% expected
    expect(loserDelta).toBe(-16);
  });

  it('gives larger delta when underdog wins', () => {
    const { winnerDelta: underdogDelta } = calculateRatingChange(800, 1200);
    const { winnerDelta: favoriteDelta } = calculateRatingChange(1200, 800);
    expect(underdogDelta).toBeGreaterThan(favoriteDelta);
  });
});
