'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isFollowing as checkFollowing } from '@clashd/supabase-client';

export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) {
        setLoading(false);
        return;
      }
      const result = await checkFollowing(supabase, user.id, targetUserId);
      if (!cancelled) {
        setFollowing(result);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [targetUserId, supabase]);

  async function handleToggleFollow() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = '/login';
      return;
    }

    if (following) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      });
      setFollowing(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleToggleFollow}
      disabled={loading}
      className={`text-sm ${following ? 'btn-outline' : 'btn-blue'} disabled:opacity-50`}
    >
      {loading ? '...' : following ? 'Unfollow' : 'Follow'}
    </button>
  );
}
