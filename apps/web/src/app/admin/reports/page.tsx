'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getProfile, getPendingReports, updateReportStatus } from '@clashd/supabase-client';

// ---- Types ----------------------------------------------------------------

interface ReportRow {
  id: string;
  debate_id: string;
  reporter_id: string;
  reason: 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  created_at: string;
  reviewed_at: string | null;
  reporter: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  debate: {
    id: string;
    topic: string;
    status: string;
    side_a_user_id: string;
    side_b_user_id: string;
  } | null;
}

// ---- Helpers ---------------------------------------------------------------

const REASON_LABELS: Record<string, string> = {
  hate_speech: 'Hate Speech',
  harassment: 'Harassment',
  spam: 'Spam',
  inappropriate: 'Inappropriate Content',
  other: 'Other',
};

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ---- Reason badge ----------------------------------------------------------

function ReasonBadge({ reason }: { reason: string }) {
  const colors: Record<string, string> = {
    hate_speech: 'bg-red-900/40 text-red-400',
    harassment: 'bg-orange-900/40 text-orange-400',
    spam: 'bg-yellow-900/40 text-yellow-400',
    inappropriate: 'bg-purple-900/40 text-purple-400',
    other: 'bg-neutral-800 text-neutral-400',
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[reason] ?? colors.other}`}
    >
      {REASON_LABELS[reason] ?? reason}
    </span>
  );
}

// ---- Main page -------------------------------------------------------------

export default function AdminReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // null = still checking
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  // --- Auth + admin check ---------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login?redirectTo=/admin/reports');
      return;
    }

    let cancelled = false;

    async function checkAdmin() {
      const { data: profile } = await getProfile(supabase, user!.id);
      if (cancelled) return;

      if (!profile?.is_admin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // Fetch pending reports
      const { data } = await getPendingReports(supabase);
      if (!cancelled) {
        setReports((data as unknown as ReportRow[]) ?? []);
        setLoading(false);
      }
    }

    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router, supabase]);

  // --- Action handlers ------------------------------------------------------

  async function handleAction(
    reportId: string,
    status: 'dismissed' | 'action_taken',
  ) {
    setActionInFlight(reportId);

    // Optimistic: remove from list immediately
    setReports((prev) => prev.filter((r) => r.id !== reportId));

    const { error } = await updateReportStatus(supabase, reportId, status);

    if (error) {
      // Revert on failure — re-fetch to be safe
      const { data } = await getPendingReports(supabase);
      setReports((data as unknown as ReportRow[]) ?? []);
    }

    setActionInFlight(null);
  }

  // --- Loading state --------------------------------------------------------

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  // --- Access denied --------------------------------------------------------

  if (!isAdmin) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 px-8 py-10 text-center">
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="mt-2 text-sm text-neutral-400">
            You do not have permission to view this page.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // --- Reports list ---------------------------------------------------------

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Moderation Reports</h1>
        <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">
          {reports.length} pending
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
            <svg
              className="h-8 w-8 text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-neutral-300">
            No pending reports
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            All reports have been reviewed. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const reporter = report.reporter;
            const debate = report.debate;
            const isProcessing = actionInFlight === report.id;

            return (
              <div
                key={report.id}
                className={`rounded-xl border border-neutral-700 bg-neutral-900 p-5 transition-opacity ${
                  isProcessing ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {/* Top row: reporter info + timestamp */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {reporter?.avatar_url ? (
                      <img
                        src={reporter.avatar_url}
                        alt={reporter.username}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-xs font-bold uppercase text-neutral-300">
                        {reporter?.username?.charAt(0) ?? '?'}
                      </div>
                    )}
                    <div>
                      <span className="text-sm font-medium text-neutral-200">
                        {reporter?.display_name ?? `@${reporter?.username ?? 'unknown'}`}
                      </span>
                      {reporter?.display_name && (
                        <span className="ml-1.5 text-xs text-neutral-500">
                          @{reporter.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {timeAgo(report.created_at)}
                  </span>
                </div>

                {/* Debate topic */}
                {debate && (
                  <Link
                    href={`/debate/${debate.id}`}
                    className="mb-2 block text-sm font-semibold text-white hover:text-neutral-300"
                  >
                    {debate.topic}
                  </Link>
                )}

                {/* Reason + details */}
                <div className="mb-4">
                  <ReasonBadge reason={report.reason} />
                  {report.details && (
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                      {report.details}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-neutral-800 pt-3">
                  <button
                    onClick={() => handleAction(report.id, 'dismissed')}
                    disabled={isProcessing}
                    className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleAction(report.id, 'action_taken')}
                    disabled={isProcessing}
                    className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/30 hover:text-red-300 disabled:cursor-not-allowed"
                  >
                    Take Action
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
