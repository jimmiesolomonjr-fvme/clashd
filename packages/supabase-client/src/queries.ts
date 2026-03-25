import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;

// --- Profiles ---

export async function getProfile(client: Client, userId: string) {
  return client.from('profiles').select('*').eq('id', userId).single();
}

export async function getProfileByUsername(client: Client, username: string) {
  return client.from('profiles').select('*').eq('username', username).single();
}

export async function updateProfile(
  client: Client,
  userId: string,
  data: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
  },
) {
  return client.from('profiles').update(data).eq('id', userId).select().single();
}

// --- Debates ---

export async function getDebate(client: Client, debateId: string) {
  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(*),
      side_b:profiles!debates_side_b_user_id_fkey(*)
    `,
    )
    .eq('id', debateId)
    .single();
}

export async function getLiveDebates(client: Client, limit = 20) {
  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url, clash_rating),
      side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('status', 'live')
    .eq('is_public', true)
    .order('audience_count', { ascending: false })
    .limit(limit);
}

export async function getUpcomingDebates(client: Client, limit = 20) {
  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url),
      side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url)
    `,
    )
    .in('status', ['scheduled', 'waiting_room'])
    .eq('is_public', true)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
}

export async function getUserDebates(client: Client, userId: string) {
  return client
    .from('debates')
    .select('*')
    .or(`side_a_user_id.eq.${userId},side_b_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });
}

export async function getCompletedDebates(client: Client, limit = 20) {
  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url, clash_rating),
      side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('status', 'completed')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(limit);
}

export async function getFollowingFeed(client: Client, userId: string, limit = 20): Promise<{ data: any[] | null; error: any }> {
  // Get IDs of people this user follows
  const { data: follows } = await client
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (!follows || follows.length === 0) {
    return { data: [], error: null };
  }

  const ids = follows.map((f) => f.following_id);

  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url, clash_rating),
      side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('is_public', true)
    .in('status', ['live', 'waiting_room', 'scheduled', 'completed'])
    .or(ids.map((id) => `side_a_user_id.eq.${id},side_b_user_id.eq.${id}`).join(','))
    .order('created_at', { ascending: false })
    .limit(limit);
}

// --- Rounds ---

export async function getRounds(client: Client, debateId: string) {
  return client
    .from('rounds')
    .select('*')
    .eq('debate_id', debateId)
    .order('round_number', { ascending: true });
}

export async function getCurrentRound(client: Client, debateId: string) {
  return client
    .from('rounds')
    .select('*')
    .eq('debate_id', debateId)
    .neq('phase', 'completed')
    .order('round_number', { ascending: true })
    .limit(1)
    .single();
}

// --- Votes ---

export async function getRoundVotes(client: Client, roundId: string) {
  return client.from('votes').select('*').eq('round_id', roundId);
}

export async function getUserVote(client: Client, roundId: string, userId: string) {
  return client
    .from('votes')
    .select('*')
    .eq('round_id', roundId)
    .eq('user_id', userId)
    .maybeSingle();
}

// --- Comments ---

export async function getDebateComments(client: Client, debateId: string, limit = 100) {
  return client
    .from('comments')
    .select(
      `
      *,
      user:profiles!comments_user_id_fkey(id, username, avatar_url)
    `,
    )
    .eq('debate_id', debateId)
    .order('created_at', { ascending: true })
    .limit(limit);
}

// --- Challenges ---

export async function getPendingChallenges(client: Client, userId: string) {
  return client
    .from('challenges')
    .select(
      `
      *,
      challenger:profiles!challenges_challenger_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('challenged_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
}

export async function getSentChallenges(client: Client, userId: string) {
  return client
    .from('challenges')
    .select(
      `
      *,
      challenged:profiles!challenges_challenged_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('challenger_id', userId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });
}

export async function getChallengeById(client: Client, challengeId: string) {
  return client
    .from('challenges')
    .select(
      `
      *,
      challenger:profiles!challenges_challenger_id_fkey(id, username, display_name, avatar_url, clash_rating),
      challenged:profiles!challenges_challenged_id_fkey(id, username, display_name, avatar_url, clash_rating)
    `,
    )
    .eq('id', challengeId)
    .single();
}

export async function getWaitingRoomDebates(client: Client) {
  return client
    .from('debates')
    .select(
      `
      *,
      side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url),
      side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url)
    `,
    )
    .eq('status', 'waiting_room')
    .eq('is_public', true)
    .order('created_at', { ascending: false });
}

// --- Follows ---

export async function getFollowers(client: Client, userId: string) {
  return client
    .from('follows')
    .select('follower:profiles!follows_follower_id_fkey(id, username, avatar_url)')
    .eq('following_id', userId);
}

export async function getFollowing(client: Client, userId: string) {
  return client
    .from('follows')
    .select('following:profiles!follows_following_id_fkey(id, username, avatar_url)')
    .eq('follower_id', userId);
}

export async function isFollowing(client: Client, followerId: string, followingId: string) {
  const { data } = await client
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  return !!data;
}

// --- Bookmarks ---

export async function getUserBookmarks(client: Client, userId: string) {
  return client
    .from('bookmarks')
    .select(
      `
      *,
      debate:debates(
        *,
        side_a:profiles!debates_side_a_user_id_fkey(id, username, display_name, avatar_url),
        side_b:profiles!debates_side_b_user_id_fkey(id, username, display_name, avatar_url)
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function isBookmarked(client: Client, userId: string, debateId: string) {
  const { data } = await client
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .maybeSingle();
  return !!data;
}

export async function toggleBookmark(client: Client, userId: string, debateId: string) {
  const { data: existing } = await client
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .maybeSingle();

  if (existing) {
    return client.from('bookmarks').delete().eq('id', existing.id);
  }
  return client.from('bookmarks').insert({ user_id: userId, debate_id: debateId });
}

// --- Reports ---

export async function getDebateReports(client: Client, debateId: string) {
  return client
    .from('reports')
    .select(
      `
      *,
      reporter:profiles!reports_reporter_id_fkey(id, username, display_name, avatar_url)
    `,
    )
    .eq('debate_id', debateId)
    .order('created_at', { ascending: false });
}

export async function getPendingReports(client: Client, limit = 50) {
  return client
    .from('reports')
    .select(
      `
      *,
      reporter:profiles!reports_reporter_id_fkey(id, username, display_name, avatar_url),
      debate:debates(id, topic, status, side_a_user_id, side_b_user_id)
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function updateReportStatus(
  client: Client,
  reportId: string,
  status: 'reviewed' | 'dismissed' | 'action_taken',
) {
  return client
    .from('reports')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
    .select()
    .single();
}

// --- Subscriptions ---

export async function getActiveSubscription(client: Client, userId: string) {
  return client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function getUserSubscription(client: Client, userId: string) {
  return client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

// --- Audience Meter Snapshots (for replay) ---

export async function getDebateSnapshots(client: Client, debateId: string) {
  return client
    .from('audience_meter_snapshots')
    .select('*')
    .eq('debate_id', debateId)
    .order('captured_at', { ascending: true });
}
