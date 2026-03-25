import { z } from 'zod';

export const subscriptionTierSchema = z.enum(['free', 'clash_plus']);

export const manageSubscriptionSchema = z.object({
  action: z.enum(['activate', 'cancel']),
  tier: subscriptionTierSchema.default('clash_plus'),
});

export type ManageSubscriptionInput = z.infer<typeof manageSubscriptionSchema>;
