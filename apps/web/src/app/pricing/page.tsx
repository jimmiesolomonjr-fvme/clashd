'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getActiveSubscription } from '@clashd/supabase-client';

type SubscriptionRow = {
  id: string;
  user_id: string;
  tier: 'free' | 'clash_plus';
  started_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const FREE_FEATURES = [
  'Watch live debates',
  'Vote on rounds',
  'Join chat',
  'Follow debaters',
];

const PLUS_FEATURES = [
  'Everything in Free',
  'Ad-free experience',
  'Extended debate formats',
  'Priority challenge queue',
  'Exclusive badges',
  'Replay access',
];

export default function PricingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClient();

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const isPlus = subscription?.is_active && subscription.tier === 'clash_plus';

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await getActiveSubscription(supabase, user.id);
    if (fetchError) {
      console.error('Failed to fetch subscription:', fetchError);
    }
    setSubscription(data as SubscriptionRow | null);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading) {
      fetchSubscription();
    }
  }, [authLoading, fetchSubscription]);

  async function handleSubscribe() {
    if (!user) {
      router.push('/login?redirectTo=/pricing');
      return;
    }

    setError(null);
    setActionLoading(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ action: 'activate', tier: 'clash_plus' }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to subscribe');
        return;
      }

      setSubscription(data.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setActionLoading(true);
    setShowCancelConfirm(false);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ action: 'cancel', tier: 'clash_plus' }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to cancel subscription');
        return;
      }

      setSubscription(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setActionLoading(false);
    }
  }

  const isInitialLoading = authLoading || loading;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Choose Your Plan
        </h1>
        <p className="mt-4 text-lg text-neutral-400">
          Unlock the full debate experience with Clash+
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Free Tier */}
        <div className="card flex flex-col border-neutral-700">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Free</h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-neutral-400">/month</span>
            </div>
          </div>

          <ul className="mb-8 flex-1 space-y-3">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-neutral-300">{feature}</span>
              </li>
            ))}
          </ul>

          {isInitialLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-neutral-800" />
          ) : !isPlus ? (
            <div className="rounded-lg border border-neutral-600 px-6 py-3 text-center font-semibold text-neutral-400">
              Current Plan
            </div>
          ) : (
            <div className="h-12" />
          )}
        </div>

        {/* Clash+ Tier */}
        <div className="relative flex flex-col overflow-hidden rounded-xl border border-clash-red/50 bg-dark p-6 shadow-[0_0_30px_-5px_rgba(239,68,68,0.15)]">
          {/* Highlight badge */}
          <div className="absolute right-4 top-4 rounded-full bg-clash-red/10 px-3 py-1 text-xs font-semibold text-clash-red">
            Popular
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              Clash<span className="text-clash-red">+</span>
            </h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$4.99</span>
              <span className="text-neutral-400">/month</span>
            </div>
          </div>

          <ul className="mb-8 flex-1 space-y-3">
            {PLUS_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-clash-red"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-neutral-300">{feature}</span>
              </li>
            ))}
          </ul>

          {isInitialLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-neutral-800" />
          ) : isPlus ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-clash-red/40 px-6 py-3 text-center font-semibold text-clash-red">
                Current Plan
              </div>

              {showCancelConfirm ? (
                <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
                  <p className="mb-3 text-sm text-neutral-300">
                    Are you sure you want to cancel? You&apos;ll lose access to
                    Clash+ features immediately.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      disabled={actionLoading}
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                    >
                      {actionLoading ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={actionLoading}
                      className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Keep Plan
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full rounded-lg border border-neutral-700 px-6 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-300"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={actionLoading}
              className="btn-red w-full py-3 text-base disabled:opacity-50"
            >
              {actionLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Processing...
                </span>
              ) : (
                'Subscribe'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-8 text-center text-sm text-neutral-500">
        No long-term contracts. Cancel anytime.
        {!user && (
          <span className="block mt-2">
            Already have an account?{' '}
            <button
              onClick={() => router.push('/login?redirectTo=/pricing')}
              className="text-clash-red hover:underline"
            >
              Sign in
            </button>{' '}
            to manage your subscription.
          </span>
        )}
      </p>
    </div>
  );
}
