import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfileByUsername, getUserDebates } from '@clashd/supabase-client';
import { FollowButton } from './follow-button';
import { EditProfileLink } from './edit-profile-link';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps): Promise<React.JSX.Element> {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await getProfileByUsername(supabase, username);
  if (error || !profile) notFound();

  const { data: currentUser } = await supabase.auth.getUser();
  const isOwnProfile = currentUser?.user?.id === profile.id;

  const { data: debates } = await getUserDebates(supabase, profile.id);
  const recentDebates = (debates ?? []).slice(0, 10);

  const winRate =
    profile.total_debates > 0
      ? Math.round((profile.total_wins / profile.total_debates) * 100)
      : 0;
  const losses = profile.total_debates - profile.total_wins;

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Profile Header */}
      <div className="card mb-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-clash-red to-clash-blue text-3xl font-bold uppercase text-white">
              {profile.username.charAt(0)}
            </div>
          )}

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold">
              {profile.display_name || `@${profile.username}`}
            </h1>
            {profile.display_name && (
              <p className="text-sm text-neutral-400">@{profile.username}</p>
            )}
            {profile.bio && <p className="mt-2 text-neutral-300">{profile.bio}</p>}
            <p className="mt-1 text-sm text-neutral-500">Debater since {joinDate}</p>

            {/* Clash Rating */}
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1">
              <span className="text-xs text-neutral-400">Clash Rating</span>
              <span className="text-sm font-bold text-white">{profile.clash_rating}</span>
            </div>

            {/* Stats row */}
            <div className="mt-4 flex justify-center gap-8 sm:justify-start">
              <div>
                <span className="block text-xl font-bold text-white">{profile.total_debates}</span>
                <span className="text-xs text-neutral-500">Debates</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-clash-red">{profile.total_wins}</span>
                <span className="text-xs text-neutral-500">Wins</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-clash-blue">{losses}</span>
                <span className="text-xs text-neutral-500">Losses</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-white">{winRate}%</span>
                <span className="text-xs text-neutral-500">Win Rate</span>
              </div>
            </div>
          </div>

          {isOwnProfile ? (
            <EditProfileLink />
          ) : (
            <FollowButton targetUserId={profile.id} />
          )}
        </div>
      </div>

      {/* Verification badge */}
      {profile.is_verified && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-green-900/30 px-3 py-1 text-xs text-green-400">
          <span>&#10003;</span> Verified
        </div>
      )}

      {/* Recent Debates */}
      <h2 className="mb-4 text-lg font-semibold">Recent Debates</h2>
      {recentDebates.length === 0 ? (
        <p className="text-neutral-500">No debates yet.</p>
      ) : (
        <div className="space-y-3">
          {recentDebates.map((debate) => {
            const isSideA = debate.side_a_user_id === profile.id;
            const won = debate.winner_user_id === profile.id;
            const lost = debate.winner_user_id && debate.winner_user_id !== profile.id;

            return (
              <Link key={debate.id} href={`/debate/${debate.id}`}>
                <div className="card flex items-center justify-between transition-colors hover:border-neutral-700">
                  <div>
                    <h3 className="font-medium text-white">{debate.topic}</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {isSideA ? debate.side_a_label : debate.side_b_label} &middot;{' '}
                      {new Date(debate.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {debate.status === 'completed' && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        won
                          ? 'bg-clash-red/10 text-clash-red'
                          : lost
                            ? 'bg-clash-blue/10 text-clash-blue'
                            : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {won ? 'WON' : lost ? 'LOST' : 'TIE'}
                    </span>
                  )}
                  {debate.status === 'live' && (
                    <span className="flex items-center gap-1 rounded-full bg-clash-red/10 px-3 py-1 text-xs font-semibold text-clash-red">
                      <span className="h-1.5 w-1.5 rounded-full bg-clash-red" />
                      LIVE
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
