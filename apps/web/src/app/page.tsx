'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getLiveDebates, getUpcomingDebates, getFollowingFeed } from '@clashd/supabase-client';

interface DebateProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface DebateRow {
  id: string;
  topic: string;
  status: string;
  audience_count: number;
  side_a_label: string;
  side_b_label: string;
  format: string;
  round_count: number;
  side_a: DebateProfile;
  side_b: DebateProfile;
}

function DebateCard({ debate }: { debate: DebateRow }) {
  const isLive = debate.status === 'live';

  return (
    <Link href={`/debate/${debate.id}`} className="group">
      <div className="card h-full transition-all duration-200 hover:border-neutral-600">
        <div className="mb-3 flex aspect-video items-center justify-center gap-5 rounded-lg bg-neutral-900">
          <div className="text-center">
            <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-clash-red/20">
              <span className="text-xs font-bold text-clash-red">
                {debate.side_a?.username?.[0]?.toUpperCase() ?? 'A'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{debate.side_a?.username ?? '...'}</p>
          </div>
          <span className="text-lg font-black text-neutral-700">VS</span>
          <div className="text-center">
            <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-clash-blue/20">
              <span className="text-xs font-bold text-clash-blue">
                {debate.side_b?.username?.[0]?.toUpperCase() ?? 'B'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{debate.side_b?.username ?? '...'}</p>
          </div>
        </div>

        <h3 className="mb-2 line-clamp-2 font-semibold group-hover:text-neutral-200">
          {debate.topic}
        </h3>

        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span>
            <span className="text-clash-red">{debate.side_a_label}</span>
            {' vs '}
            <span className="text-clash-blue">{debate.side_b_label}</span>
          </span>
          {isLive && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-clash-red" />
              {debate.audience_count} watching
            </span>
          )}
        </div>

        {debate.status === 'completed' && (
          <Link
            href={`/debate/${debate.id}/replay`}
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Watch Replay
          </Link>
        )}
      </div>
    </Link>
  );
}

function DebateSection({
  title,
  debates,
  loading,
  linkHref,
  liveDot,
}: {
  title: string;
  debates: DebateRow[];
  loading: boolean;
  linkHref?: string;
  liveDot?: boolean;
}) {
  if (loading) {
    return (
      <div className="py-8">
        <h2 className="mb-6 text-2xl font-bold">
          {liveDot && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-clash-red" />}
          {title}
        </h2>
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
        </div>
      </div>
    );
  }

  if (debates.length === 0) return null;

  return (
    <div className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {liveDot && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-clash-red" />}
          {title}
        </h2>
        {linkHref && (
          <Link href={linkHref} className="text-sm text-neutral-400 hover:text-white">
            View All
          </Link>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {debates.map((d) => (
          <DebateCard key={d.id} debate={d} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [live, setLive] = useState<DebateRow[]>([]);
  const [upcoming, setUpcoming] = useState<DebateRow[]>([]);
  const [following, setFollowing] = useState<DebateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const promises: Promise<any>[] = [
        getLiveDebates(supabase, 6),
        getUpcomingDebates(supabase, 6),
      ];
      if (user) {
        promises.push(getFollowingFeed(supabase, user.id, 6));
      }

      const results = await Promise.all(promises);
      if (cancelled) return;

      setLive((results[0]?.data as unknown as DebateRow[]) ?? []);
      setUpcoming((results[1]?.data as unknown as DebateRow[]) ?? []);
      if (results[2]) {
        setFollowing((results[2]?.data as unknown as DebateRow[]) ?? []);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, user]);

  const liveCount = live.length;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-clash-red/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-clash-blue/10 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl">
          {liveCount > 0 && (
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-dark px-4 py-2 text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clash-red opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-clash-red" />
              </span>
              <span className="text-neutral-300">
                {liveCount} debate{liveCount !== 1 ? 's' : ''} live now
              </span>
            </div>
          )}

          <h1 className="mb-6 text-5xl font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Where Arguments{' '}
            <span className="bg-gradient-to-r from-clash-red to-clash-blue bg-clip-text text-transparent">
              Become Art
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-neutral-400 sm:text-xl">
            The arena for live video debates. Pick a side, make your case, and
            let the audience decide who wins.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href={user ? '/debate/create' : '/login'} className="btn-red px-8 py-4 text-lg">
              Start a Debate
            </Link>
            <Link href="/discover" className="btn-outline px-8 py-4 text-lg">
              Watch Live
            </Link>
          </div>
        </div>
      </section>

      {/* Feeds */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <DebateSection
          title="Live Now"
          debates={live}
          loading={loading}
          linkHref="/discover"
          liveDot
        />

        {user && following.length > 0 && (
          <DebateSection
            title="From People You Follow"
            debates={following}
            loading={false}
          />
        )}

        <DebateSection
          title="Upcoming"
          debates={upcoming}
          loading={loading}
          linkHref="/discover"
        />
      </section>

      {/* How It Works */}
      <section className="border-t border-neutral-800 bg-dark">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-clash-red/10 text-2xl font-bold text-clash-red">
                1
              </div>
              <h3 className="mb-2 text-lg font-semibold">Pick a Topic</h3>
              <p className="text-neutral-400">
                Choose from trending topics or create your own debate challenge.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white">
                2
              </div>
              <h3 className="mb-2 text-lg font-semibold">Go Live</h3>
              <p className="text-neutral-400">
                Face off in a live video debate with timed rounds and audience interaction.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-clash-blue/10 text-2xl font-bold text-clash-blue">
                3
              </div>
              <h3 className="mb-2 text-lg font-semibold">Win the Crowd</h3>
              <p className="text-neutral-400">
                The audience votes in real-time. Build your record and climb the leaderboard.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
