'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getPendingChallenges, getSentChallenges } from '@clashd/supabase-client';

type Tab = 'received' | 'sent';

interface ChallengeProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  clash_rating: number;
}

interface ChallengeRow {
  id: string;
  topic: string;
  message: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  debate_id: string | null;
  challenger?: ChallengeProfile;
  challenged?: ChallengeProfile;
}

function getSupabaseFunctionsUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${base}/functions/v1`;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function ChallengeCard({
  challenge,
  type,
  onRespond,
}: {
  challenge: ChallengeRow;
  type: Tab;
  onRespond?: (challengeId: string, action: 'accept' | 'decline') => Promise<void>;
}) {
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);
  const profile = type === 'received' ? challenge.challenger : challenge.challenged;

  async function handleRespond(action: 'accept' | 'decline') {
    if (!onRespond) return;
    setResponding(action);
    try {
      await onRespond(challenge.id, action);
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* User info */}
          <div className="mb-2 flex items-center gap-2">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-sm font-bold text-neutral-400">
                {profile?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{profile?.display_name ?? profile?.username}</p>
              <p className="text-xs text-neutral-500">
                @{profile?.username} · {profile?.clash_rating ?? 1000} CR
              </p>
            </div>
          </div>

          {/* Topic */}
          <p className="mb-1 font-semibold">{challenge.topic}</p>
          {challenge.message && (
            <p className="mb-2 text-sm text-neutral-400">{challenge.message}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>{timeUntil(challenge.expires_at)}</span>
            {challenge.status === 'accepted' && challenge.debate_id && (
              <Link
                href={`/debate/${challenge.debate_id}`}
                className="font-medium text-clash-blue hover:underline"
              >
                Go to debate &rarr;
              </Link>
            )}
            {challenge.status === 'accepted' && !challenge.debate_id && (
              <span className="text-green-400">Accepted</span>
            )}
          </div>
        </div>

        {/* Actions (received only, pending only) */}
        {type === 'received' && challenge.status === 'pending' && onRespond && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleRespond('accept')}
              disabled={responding !== null}
              className="rounded-lg bg-green-700 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              {responding === 'accept' ? '...' : 'Accept'}
            </button>
            <button
              onClick={() => handleRespond('decline')}
              disabled={responding !== null}
              className="rounded-lg bg-neutral-800 px-4 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {responding === 'decline' ? '...' : 'Decline'}
            </button>
          </div>
        )}

        {/* Status badge for sent */}
        {type === 'sent' && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              challenge.status === 'pending'
                ? 'bg-yellow-900/50 text-yellow-400'
                : challenge.status === 'accepted'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {challenge.status}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('received');
  const [received, setReceived] = useState<ChallengeRow[]>([]);
  const [sent, setSent] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChallenges = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [recResult, sentResult] = await Promise.all([
      getPendingChallenges(supabase, user.id),
      getSentChallenges(supabase, user.id),
    ]);
    setReceived((recResult.data as unknown as ChallengeRow[]) ?? []);
    setSent((sentResult.data as unknown as ChallengeRow[]) ?? []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectTo=/challenges');
      return;
    }
    if (user) loadChallenges();
  }, [user, authLoading, router, loadChallenges]);

  async function handleRespond(challengeId: string, action: 'accept' | 'decline') {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${getSupabaseFunctionsUrl()}/respond-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ challenge_id: challengeId, action }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert((err as any).error ?? 'Failed to respond');
      return;
    }

    const result = await res.json();

    // If accepted, redirect to the debate waiting room
    if (action === 'accept' && result.debate?.id) {
      router.push(`/debate/${result.debate.id}`);
      return;
    }

    // Reload challenges
    await loadChallenges();
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  const challenges = tab === 'received' ? received : sent;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Challenges</h1>
        <Link
          href="/debate/create"
          className="btn-red px-4 py-2 text-sm"
        >
          New Challenge
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-neutral-900 p-1">
        <button
          onClick={() => setTab('received')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'received' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Received ({received.length})
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'sent' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Sent ({sent.length})
        </button>
      </div>

      {/* Challenge list */}
      <div className="space-y-3">
        {challenges.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-neutral-400">
              {tab === 'received'
                ? 'No pending challenges. When someone challenges you, it will appear here.'
                : 'No sent challenges yet.'}
            </p>
          </div>
        )}
        {challenges.map((c) => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            type={tab}
            onRespond={tab === 'received' ? handleRespond : undefined}
          />
        ))}
      </div>
    </div>
  );
}
