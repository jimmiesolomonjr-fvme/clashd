import type { Vote } from '../types/database';

export interface AggregatedScores {
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_a_total: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
  side_b_total: number;
  vote_count: number;
  winner: 'side_a' | 'side_b' | 'tie';
}

export function aggregateVotes(votes: Vote[]): AggregatedScores {
  if (votes.length === 0) {
    return {
      side_a_argument: 0,
      side_a_delivery: 0,
      side_a_persuasion: 0,
      side_a_total: 0,
      side_b_argument: 0,
      side_b_delivery: 0,
      side_b_persuasion: 0,
      side_b_total: 0,
      vote_count: 0,
      winner: 'tie',
    };
  }

  const count = votes.length;
  const sum = votes.reduce(
    (acc, vote) => ({
      side_a_argument: acc.side_a_argument + vote.side_a_argument,
      side_a_delivery: acc.side_a_delivery + vote.side_a_delivery,
      side_a_persuasion: acc.side_a_persuasion + vote.side_a_persuasion,
      side_b_argument: acc.side_b_argument + vote.side_b_argument,
      side_b_delivery: acc.side_b_delivery + vote.side_b_delivery,
      side_b_persuasion: acc.side_b_persuasion + vote.side_b_persuasion,
    }),
    {
      side_a_argument: 0,
      side_a_delivery: 0,
      side_a_persuasion: 0,
      side_b_argument: 0,
      side_b_delivery: 0,
      side_b_persuasion: 0,
    },
  );

  const avg = (n: number) => Math.round((n / count) * 10) / 10;

  const side_a_argument = avg(sum.side_a_argument);
  const side_a_delivery = avg(sum.side_a_delivery);
  const side_a_persuasion = avg(sum.side_a_persuasion);
  const side_a_total = Math.round((side_a_argument + side_a_delivery + side_a_persuasion) * 10) / 10;

  const side_b_argument = avg(sum.side_b_argument);
  const side_b_delivery = avg(sum.side_b_delivery);
  const side_b_persuasion = avg(sum.side_b_persuasion);
  const side_b_total = Math.round((side_b_argument + side_b_delivery + side_b_persuasion) * 10) / 10;

  let winner: 'side_a' | 'side_b' | 'tie';
  if (side_a_total > side_b_total) winner = 'side_a';
  else if (side_b_total > side_a_total) winner = 'side_b';
  else winner = 'tie';

  return {
    side_a_argument,
    side_a_delivery,
    side_a_persuasion,
    side_a_total,
    side_b_argument,
    side_b_delivery,
    side_b_persuasion,
    side_b_total,
    vote_count: count,
    winner,
  };
}

/** Calculate Clash Rating change (Elo-like) */
export function calculateRatingChange(
  winnerRating: number,
  loserRating: number,
  kFactor: number = 32,
): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const winnerDelta = Math.round(kFactor * (1 - expectedWinner));
  const loserDelta = Math.round(kFactor * (0 - expectedLoser));

  return { winnerDelta, loserDelta };
}
