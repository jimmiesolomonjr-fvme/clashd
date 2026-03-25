'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  getLiveDebates,
  getUpcomingDebates,
  getCompletedDebates,
} from '@clashd/supabase-client';

type Tab = 'live' | 'upcoming' | 'completed';

interface DebateProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  clash_rating?: number;
}

interface DebateRow {
  id: string;
  topic: string;
  description: string | null;
  status: string;
  audience_count: number;
  side_a_label: string;
  side_b_label: string;
  format: string;
  round_count: number;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  side_a: DebateProfile;
  side_b: DebateProfile;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'live':
      return (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clash-red opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-clash-red" />
          </span>
          <span className="text-xs font-semibold text-clash-red">LIVE</span>
        </span>
      );
    case 'waiting_room':
      return <span className="text-xs font-medium text-yellow-400">WAITING</span>;
    case 'scheduled':
      return <span className="text-xs font-medium text-neutral-400">SCHEDULED</span>;
    case 'completed':
      return <span className="text-xs font-medium text-neutral-500">COMPLETED</span>;
    default:
      return null;
  }
}

function DebateCard({ debate }: { debate: DebateRow }) {
  const sideA = debate.side_a;
  const sideB = debate.side_b;

  return (
    <Link href={`/debate/${debate.id}`} className="group">
      <div className="card h-full transition-all duration-200 hover:border-neutral-600">
        {/* VS preview */}
        <div className="mb-4 flex aspect-video items-center justify-center gap-6 rounded-lg bg-neutral-900">
          <div className="text-center">
            <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-clash-red/20">
              <span className="text-xs font-bold text-clash-red">
                {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{sideA?.username ?? '...'}</p>
          </div>
          <span className="text-lg font-black text-neutral-700">VS</span>
          <div className="text-center">
            <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-clash-blue/20">
              <span className="text-xs font-bold text-clash-blue">
                {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{sideB?.username ?? '...'}</p>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <StatusBadge status={debate.status} />
          <span className="text-xs text-neutral-500">
            {debate.audience_count > 0 ? `${debate.audience_count} watching` : debate.format}
          </span>
        </div>

        <h3 className="line-clamp-2 font-semibold group-hover:text-neutral-200">
          {debate.topic}
        </h3>

        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
          <span className="text-clash-red">{debate.side_a_label}</span>
          <span>vs</span>
          <span className="text-clash-blue">{debate.side_b_label}</span>
          <span className="ml-auto">{debate.round_count} rounds</span>
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

export default function DiscoverPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('live');
  const [debates, setDebates] = useState<DebateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let result;

      switch (tab) {
        case 'live':
          result = await getLiveDebates(supabase);
          break;
        case 'upcoming':
          result = await getUpcomingDebates(supabase);
          break;
        case 'completed':
          result = await getCompletedDebates(supabase);
          break;
      }

      if (!cancelled) {
        setDebates((result?.data as unknown as DebateRow[]) ?? []);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab, supabase]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'live', label: 'Live Now' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Recent' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Discover</h1>
          <p className="mt-1 text-neutral-400">
            Find live debates to watch or jump into the arena.
          </p>
        </div>
        <Link href="/debate/create" className="btn-red px-5 py-2.5 text-sm">
          Start a Debate
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-neutral-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {t.key === 'live' && (
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-clash-red" />
            )}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
        </div>
      ) : debates.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg text-neutral-500">
            {tab === 'live'
              ? 'No live debates right now.'
              : tab === 'upcoming'
                ? 'No upcoming debates scheduled.'
                : 'No completed debates yet.'}
          </p>
          <Link href="/debate/create" className="mt-4 inline-block text-sm text-clash-red hover:underline">
            Be the first to start one
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {debates.map((d) => (
            <DebateCard key={d.id} debate={d} />
          ))}
        </div>
      )}
    </div>
  );
}
