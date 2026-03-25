import { z } from 'zod';

export const debateFormatSchema = z.enum(['classic', 'rapid', 'extended', 'custom']);

export const createDebateSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters')
    .max(200, 'Topic must be under 200 characters'),
  description: z.string().max(1000).optional(),
  format: debateFormatSchema.default('classic'),
  side_a_label: z
    .string()
    .min(1)
    .max(50)
    .default('For'),
  side_b_label: z
    .string()
    .min(1)
    .max(50)
    .default('Against'),
  round_count: z.number().int().min(1).max(10).default(3),
  speaking_time_seconds: z.number().int().min(30).max(600).default(120),
  voting_time_seconds: z.number().int().min(5).max(60).default(10),
  is_public: z.boolean().default(true),
  scheduled_at: z.string().datetime().optional(),
  opponent_id: z.string().uuid().optional(),
});

export type CreateDebateInput = z.infer<typeof createDebateSchema>;

export const FORMAT_PRESETS: Record<
  string,
  { round_count: number; speaking_time_seconds: number; voting_time_seconds: number }
> = {
  classic: { round_count: 3, speaking_time_seconds: 120, voting_time_seconds: 10 },
  rapid: { round_count: 5, speaking_time_seconds: 60, voting_time_seconds: 10 },
  extended: { round_count: 3, speaking_time_seconds: 300, voting_time_seconds: 15 },
};
