'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';

export function NavAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-20 animate-pulse rounded-lg bg-neutral-800" />
      </div>
    );
  }

  if (user) {
    const username = user.user_metadata?.username;
    const initial = (username ?? user.email ?? '?').charAt(0).toUpperCase();

    return (
      <div className="flex items-center gap-3">
        <Link href="/debate/create" className="btn-red text-sm">
          Start Debate
        </Link>
        <Link
          href={username ? `/profile/${username}` : '/profile/edit'}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-clash-red to-clash-blue text-sm font-bold text-white transition-opacity hover:opacity-80"
        >
          {initial}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/login" className="btn-outline text-sm">
        Sign In
      </Link>
      <Link href="/login" className="btn-red text-sm">
        Start Debating
      </Link>
    </div>
  );
}
