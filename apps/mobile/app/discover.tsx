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
import { Stack, Link } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  getLiveDebates,
  getUpcomingDebates,
  getCompletedDebates,
} from '@clashd/supabase-client';

type Tab = 'live' | 'upcoming' | 'completed';

type DebateRow = any;

function DebateCard({ debate }: { debate: DebateRow }) {
  const sideA = debate.side_a;
  const sideB = debate.side_b;
  const isLive = debate.status === 'live';

  return (
    <Link href={`/debate/${debate.id}`} asChild>
      <TouchableOpacity style={styles.card}>
        {/* VS row */}
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

        <View style={styles.meta}>
          <Text style={styles.sides}>
            <Text style={{ color: '#EF4444' }}>{debate.side_a_label}</Text>
            {' vs '}
            <Text style={{ color: '#3B82F6' }}>{debate.side_b_label}</Text>
          </Text>
          {isLive && debate.audience_count > 0 && (
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.watchingText}>{debate.audience_count}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Link>
  );
}

export default function DiscoverScreen() {
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
        setDebates(result?.data ?? []);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'live', label: 'Live' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Recent' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Discover' }} />

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            {t.key === 'live' && <View style={styles.tabDot} />}
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : debates.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {tab === 'live'
              ? 'No live debates right now.'
              : tab === 'upcoming'
                ? 'No upcoming debates.'
                : 'No completed debates yet.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {debates.map((d: DebateRow) => (
            <DebateCard key={d.id} debate={d} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  scroll: { padding: 16, paddingBottom: 40 },

  tabRow: { flexDirection: 'row', margin: 16, gap: 4, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabActive: { backgroundColor: '#333' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#A0A0A0' },
  tabTextActive: { color: '#fff' },

  card: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, marginBottom: 12 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 },
  debaterCol: { alignItems: 'center', gap: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  username: { fontSize: 11, color: '#6B7280' },
  vsText: { fontSize: 16, fontWeight: '900', color: '#404040' },

  topic: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sides: { fontSize: 12, color: '#6B7280' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  watchingText: { fontSize: 12, color: '#6B7280' },

  emptyText: { color: '#6B7280', fontSize: 15, textAlign: 'center' },
});
