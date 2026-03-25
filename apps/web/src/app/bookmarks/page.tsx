'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getUserBookmarks, toggleBookmark } from '@clashd/supabase-client';

interface BookmarkRow {
  id: string;
  debate_id: string;
  created_at: string;
  debate: {
    id: string;
    topic: string;
    status: string;
    audience_count: number;
    side_a_label: string;
    side_b_label: string;
    format: string;
    round_count: number;
    side_a: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
    side_b: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  };
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'live':
      return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-clash-red">
          <span className="h-2 w-2 rounded-full bg-clash-red" />
          LIVE
        </span>
      );
    case 'waiting_room':
      return <span className="text-xs font-medium text-yellow-400">WAITING</span>;
    case 'completed':
      return <span className="text-xs font-medium text-neutral-500">COMPLETED</span>;
    default:
      return <span className="text-xs font-medium text-neutral-500">{status.toUpperCase()}</span>;
  }
}

export default function BookmarksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectTo=/bookmarks');
      return;
    }
    if (!user) return;

    let cancelled = false;
    async function load() {
      const { data } = await getUserBookmarks(supabase, user!.id);
      if (!cancelled) {
        setBookmarks((data as unknown as BookmarkRow[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, authLoading, router, supabase]);

  async function handleRemoveBookmark(debateId: string) {
    if (!user) return;
    await toggleBookmark(supabase, user.id, debateId);
    setBookmarks((prev) => prev.filter((b) => b.debate_id !== debateId));
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Bookmarks</h1>

      {bookmarks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-neutral-400">No bookmarked debates yet.</p>
          <Link href="/discover" className="mt-4 inline-block text-sm text-clash-red hover:underline">
            Discover debates to bookmark
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((b) => {
            const d = b.debate;
            return (
              <div
                key={b.id}
                className="flex items-center gap-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4"
              >
                <Link href={`/debate/${d.id}`} className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <StatusBadge status={d.status} />
                    <span className="text-xs text-neutral-500">{d.format} · {d.round_count} rounds</span>
                  </div>
                  <h3 className="truncate font-semibold hover:text-neutral-200">
                    {d.topic}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    <span className="text-clash-red">{d.side_a?.username ?? '...'}</span>
                    {' vs '}
                    <span className="text-clash-blue">{d.side_b?.username ?? '...'}</span>
                  </p>
                </Link>
                <button
                  onClick={() => handleRemoveBookmark(d.id)}
                  className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
