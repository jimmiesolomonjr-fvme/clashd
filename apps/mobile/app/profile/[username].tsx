import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getProfileByUsername, getUserDebates, isFollowing } from '@clashd/supabase-client';
import { useAuth } from '../../context/auth-context';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [debates, setDebates] = useState<any[]>([]);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwnProfile = user?.id === profile?.id;

  useEffect(() => {
    if (!username) return;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      const { data: profileData, error: profileError } = await getProfileByUsername(
        supabase,
        username!,
      );

      if (profileError || !profileData) {
        setError('Profile not found.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: debatesData } = await getUserDebates(supabase, profileData.id);
      setDebates((debatesData ?? []).slice(0, 10));

      if (user && user.id !== profileData.id) {
        const result = await isFollowing(supabase, user.id, profileData.id);
        setFollowing(result);
      }

      setLoading(false);
    }

    loadProfile();
  }, [username, user]);

  async function handleToggleFollow() {
    if (!user || !profile) return;
    setFollowLoading(true);

    if (following) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', profile.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: profile.id,
      });
      setFollowing(true);
    }
    setFollowLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: `@${username}` }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error ?? 'Profile not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

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
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>
                {profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={styles.displayName}>
            {profile.display_name || `@${profile.username}`}
          </Text>
          {profile.display_name && (
            <Text style={styles.usernameSubtitle}>@{profile.username}</Text>
          )}
          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          <Text style={styles.joinDate}>Debater since {joinDate}</Text>

          {/* Clash Rating */}
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingLabel}>Clash Rating</Text>
            <Text style={styles.ratingValue}>{profile.clash_rating}</Text>
          </View>

          {/* Action Button */}
          {isOwnProfile ? (
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
              onPress={() => router.push('/profile/edit')}
            >
              <Text style={styles.outlineButtonText}>Edit Profile</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                following ? styles.outlineButton : styles.followButton,
                pressed && styles.buttonPressed,
                followLoading && styles.buttonDisabled,
              ]}
              onPress={handleToggleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={following ? styles.outlineButtonText : styles.followButtonText}>
                  {following ? 'Unfollow' : 'Follow'}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.total_debates}</Text>
            <Text style={styles.statLabel}>Debates</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{profile.total_wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>{losses}</Text>
            <Text style={styles.statLabel}>Losses</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{winRate}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>

        {/* Verification */}
        {profile.is_verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>&#10003; Verified</Text>
          </View>
        )}

        {/* Recent Debates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Debates</Text>
          {debates.length === 0 ? (
            <Text style={styles.emptyText}>No debates yet.</Text>
          ) : (
            debates.map((debate) => {
              const isSideA = debate.side_a_user_id === profile.id;
              const won = debate.winner_user_id === profile.id;
              const lost = debate.winner_user_id && debate.winner_user_id !== profile.id;

              return (
                <Pressable
                  key={debate.id}
                  style={({ pressed }) => [styles.debateCard, pressed && styles.cardPressed]}
                  onPress={() => router.push(`/debate/${debate.id}`)}
                >
                  <View style={styles.debateInfo}>
                    <Text style={styles.debateTopic} numberOfLines={1}>
                      {debate.topic}
                    </Text>
                    <Text style={styles.debateMeta}>
                      {isSideA ? debate.side_a_label : debate.side_b_label} &middot;{' '}
                      {new Date(debate.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {debate.status === 'completed' && (
                    <View
                      style={[
                        styles.resultBadge,
                        won && styles.wonBadge,
                        lost && styles.lostBadge,
                        !won && !lost && styles.tieBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.resultText,
                          won && styles.wonText,
                          lost && styles.lostText,
                          !won && !lost && styles.tieText,
                        ]}
                      >
                        {won ? 'WON' : lost ? 'LOST' : 'TIE'}
                      </Text>
                    </View>
                  )}
                  {debate.status === 'live' && (
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#A0A0A0',
    fontSize: 16,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  usernameSubtitle: {
    fontSize: 14,
    color: '#A0A0A0',
    marginTop: 2,
  },
  bio: {
    fontSize: 14,
    color: '#D4D4D4',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  joinDate: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  ratingLabel: {
    fontSize: 12,
    color: '#A0A0A0',
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 16,
    minWidth: 120,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  followButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 16,
    minWidth: 120,
    alignItems: 'center',
  },
  followButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    marginHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  verifiedBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 12,
  },
  verifiedText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  debateCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPressed: {
    borderColor: '#3A3A3A',
  },
  debateInfo: {
    flex: 1,
    marginRight: 12,
  },
  debateTopic: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  debateMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  wonBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  lostBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  tieBadge: {
    backgroundColor: '#1A1A1A',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '700',
  },
  wonText: {
    color: '#EF4444',
  },
  lostText: {
    color: '#3B82F6',
  },
  tieText: {
    color: '#A0A0A0',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
});
