import { z } from 'zod';

export const createChallengeSchema = z.object({
  challenged_id: z.string().uuid(),
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters')
    .max(200, 'Topic must be under 200 characters'),
  message: z.string().max(500).optional(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

export const respondChallengeSchema = z.object({
  challenge_id: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
});

export type RespondChallengeInput = z.infer<typeof respondChallengeSchema>;
