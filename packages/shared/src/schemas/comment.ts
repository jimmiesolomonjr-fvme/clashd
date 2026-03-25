import { z } from 'zod';

export const createCommentSchema = z.object({
  debate_id: z.string().uuid(),
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(500, 'Comment must be under 500 characters'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
