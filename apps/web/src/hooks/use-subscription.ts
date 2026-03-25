'use client';

import { useAuth } from '@/context/auth-context';
import type { SubscriptionTier } from '@clashd/shared';

interface UseSubscriptionReturn {
  isPlus: boolean;
  tier: SubscriptionTier;
  loading: boolean;
}

/**
 * Returns the current user's subscription status.
 * Reads directly from the profile already loaded in the auth context —
 * no extra database call required.
 */
export function useSubscription(): UseSubscriptionReturn {
  const { profile, isLoading } = useAuth();

  const tier: SubscriptionTier = profile?.subscription_tier ?? 'free';

  return {
    isPlus: tier === 'clash_plus',
    tier,
    loading: isLoading,
  };
}
