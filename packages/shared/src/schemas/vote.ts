import { z } from 'zod';

const scoreField = z.number().int().min(1).max(5);

export const submitVoteSchema = z.object({
  round_id: z.string().uuid(),
  side_a_argument: scoreField,
  side_a_delivery: scoreField,
  side_a_persuasion: scoreField,
  side_b_argument: scoreField,
  side_b_delivery: scoreField,
  side_b_persuasion: scoreField,
});

export type SubmitVoteInput = z.infer<typeof submitVoteSchema>;
