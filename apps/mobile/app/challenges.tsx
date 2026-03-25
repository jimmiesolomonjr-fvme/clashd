import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../context/auth-context';
import { supabase } from '../lib/supabase';
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
  onGoToDebate,
}: {
  challenge: ChallengeRow;
  type: Tab;
  onRespond?: (id: string, action: 'accept' | 'decline') => Promise<void>;
  onGoToDebate?: (debateId: string) => void;
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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.profileCircle}>
          <Text style={styles.profileInitial}>
            {profile?.username?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{profile?.display_name ?? profile?.username}</Text>
          <Text style={styles.profileMeta}>
            @{profile?.username} · {profile?.clash_rating ?? 1000} CR
          </Text>
        </View>
        {type === 'sent' && (
          <View style={[
            styles.statusBadge,
            challenge.status === 'accepted' ? styles.acceptedBadge : styles.pendingBadge,
          ]}>
            <Text style={[
              styles.statusBadgeText,
              challenge.status === 'accepted' ? styles.acceptedText : styles.pendingText,
            ]}>
              {challenge.status}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.topic}>{challenge.topic}</Text>
      {challenge.message ? (
        <Text style={styles.message}>{challenge.message}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.timeLeft}>{timeUntil(challenge.expires_at)}</Text>
        {challenge.status === 'accepted' && challenge.debate_id && onGoToDebate && (
          <TouchableOpacity onPress={() => onGoToDebate(challenge.debate_id!)}>
            <Text style={styles.goToDebate}>Go to debate →</Text>
          </TouchableOpacity>
        )}
      </View>

      {type === 'received' && challenge.status === 'pending' && onRespond && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => handleRespond('accept')}
            disabled={responding !== null}
          >
            {responding === 'accept' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleRespond('decline')}
            disabled={responding !== null}
          >
            {responding === 'decline' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.declineBtnText}>Decline</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const { user, session } = useAuth();
  const router = useRouter();
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
  }, [user]);

  useEffect(() => {
    if (user) loadChallenges();
  }, [user, loadChallenges]);

  async function handleRespond(challengeId: string, action: 'accept' | 'decline') {
    if (!session) return;
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/respond-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ challenge_id: challengeId, action }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      Alert.alert('Error', (err as any).error ?? 'Failed to respond');
      return;
    }

    const result = await res.json();

    if (action === 'accept' && result.debate?.id) {
      router.push(`/debate/${result.debate.id}`);
      return;
    }

    await loadChallenges();
  }

  const challenges = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Challenges' }} />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Received ({received.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sent' && styles.tabActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
            Sent ({sent.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {challenges.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {tab === 'received'
                  ? 'No pending challenges.'
                  : 'No sent challenges yet.'}
              </Text>
            </View>
          ) : (
            challenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                type={tab}
                onRespond={tab === 'received' ? handleRespond : undefined}
                onGoToDebate={(debateId) => router.push(`/debate/${debateId}`)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },

  tabRow: { flexDirection: 'row', margin: 16, gap: 4, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#333' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#A0A0A0' },
  tabTextActive: { color: '#fff' },

  card: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  profileCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#262626', justifyContent: 'center', alignItems: 'center' },
  profileInitial: { fontSize: 14, fontWeight: '700', color: '#A0A0A0' },
  profileName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  profileMeta: { fontSize: 11, color: '#6B7280' },

  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pendingBadge: { backgroundColor: 'rgba(234,179,8,0.2)' },
  acceptedBadge: { backgroundColor: 'rgba(22,163,74,0.2)' },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  pendingText: { color: '#FBBF24' },
  acceptedText: { color: '#4ADE80' },

  topic: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  message: { fontSize: 13, color: '#A0A0A0', marginBottom: 8 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeLeft: { fontSize: 12, color: '#6B7280' },
  goToDebate: { fontSize: 12, fontWeight: '600', color: '#3B82F6' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acceptBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  declineBtn: { flex: 1, backgroundColor: '#262626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { color: '#D4D4D4', fontSize: 14, fontWeight: '600' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontSize: 14 },
});
