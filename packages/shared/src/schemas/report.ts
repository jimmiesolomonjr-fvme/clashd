import { z } from 'zod';

export const createReportSchema = z.object({
  debate_id: z.string().uuid(),
  reason: z.enum(['hate_speech', 'harassment', 'spam', 'inappropriate', 'other']),
  details: z.string().max(1000).optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
