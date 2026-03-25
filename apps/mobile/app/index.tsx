import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../context/auth-context';
import { supabase } from '../lib/supabase';
import { getLiveDebates, getUpcomingDebates } from '@clashd/supabase-client';

type DebateRow = any;

function DebateCard({ debate }: { debate: DebateRow }) {
  const sideA = debate.side_a;
  const sideB = debate.side_b;

  return (
    <Link href={`/debate/${debate.id}`} asChild>
      <TouchableOpacity style={styles.card}>
        <View style={styles.vsRow}>
          <View style={styles.debaterCol}>
            <View style={[styles.avatar, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <Text style={[styles.avatarText, { color: '#EF4444' }]}>
                {sideA?.username?.[0]?.toUpperCase() ?? 'A'}
              </Text>
            </View>
            <Text style={styles.username}>{sideA?.username ?? '...'}</Text>
          </View>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.debaterCol}>
            <View style={[styles.avatar, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
              <Text style={[styles.avatarText, { color: '#3B82F6' }]}>
                {sideB?.username?.[0]?.toUpperCase() ?? 'B'}
              </Text>
            </View>
            <Text style={styles.username}>{sideB?.username ?? '...'}</Text>
          </View>
        </View>
        <Text style={styles.topic} numberOfLines={2}>{debate.topic}</Text>
        {debate.status === 'live' && debate.audience_count > 0 && (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.watchCount}>{debate.audience_count} watching</Text>
          </View>
        )}
      </TouchableOpacity>
    </Link>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const [live, setLive] = useState<DebateRow[]>([]);
  const [upcoming, setUpcoming] = useState<DebateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [liveRes, upRes] = await Promise.all([
        getLiveDebates(supabase, 6),
        getUpcomingDebates(supabase, 4),
      ]);
      if (cancelled) return;
      setLive(liveRes.data ?? []);
      setUpcoming(upRes.data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>CLASHD</Text>
          <Text style={styles.tagline}>Where Arguments Become Art</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => router.push(session ? '/debate/create' : '/login')}
          >
            <Text style={styles.btnText}>Start a Debate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.challengeBtn}
            onPress={() => router.push(session ? '/challenges' : '/login')}
          >
            <Text style={styles.btnText}>Challenges</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Live Now */}
            {live.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.liveDotLg} />
                    <Text style={styles.sectionTitle}>Live Now</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/discover')}>
                    <Text style={styles.seeAll}>See All</Text>
                  </TouchableOpacity>
                </View>
                {live.map((d: DebateRow) => (
                  <DebateCard key={d.id} debate={d} />
                ))}
              </View>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Upcoming</Text>
                  <TouchableOpacity onPress={() => router.push('/discover')}>
                    <Text style={styles.seeAll}>See All</Text>
                  </TouchableOpacity>
                </View>
                {upcoming.map((d: DebateRow) => (
                  <DebateCard key={d.id} debate={d} />
                ))}
              </View>
            )}

            {live.length === 0 && upcoming.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No debates happening right now.</Text>
                <Text style={styles.emptySubtext}>Be the first to start one!</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { padding: 16, paddingBottom: 40 },

  header: { alignItems: 'center', paddingVertical: 32 },
  brand: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 6 },
  tagline: { fontSize: 14, color: '#A0A0A0', letterSpacing: 2, marginTop: 8 },

  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  startBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  challengeBtn: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  seeAll: { fontSize: 13, color: '#A0A0A0' },

  card: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, marginBottom: 10 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 },
  debaterCol: { alignItems: 'center', gap: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800' },
  username: { fontSize: 11, color: '#6B7280' },
  vsText: { fontSize: 14, fontWeight: '900', color: '#404040' },
  topic: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  liveDotLg: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  watchCount: { fontSize: 12, color: '#6B7280' },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#6B7280' },
  emptySubtext: { fontSize: 14, color: '#404040', marginTop: 4 },
});
