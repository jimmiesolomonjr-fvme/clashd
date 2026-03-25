import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useAuth } from '../../context/auth-context';
import { supabase } from '../../lib/supabase';
import { FORMAT_PRESETS, createDebateSchema } from '@clashd/shared';
import type { DebateFormat } from '@clashd/shared';

const FORMAT_OPTIONS: { value: DebateFormat; label: string; desc: string }[] = [
  { value: 'classic', label: 'Classic', desc: '3 rounds, 2 min' },
  { value: 'rapid', label: 'Rapid', desc: '5 rounds, 1 min' },
  { value: 'extended', label: 'Extended', desc: '3 rounds, 5 min' },
  { value: 'custom', label: 'Custom', desc: 'Your rules' },
];

export default function CreateDebateScreen() {
  const { user, session } = useAuth();

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<DebateFormat>('classic');
  const [sideALabel, setSideALabel] = useState('For');
  const [sideBLabel, setSideBLabel] = useState('Against');
  const [opponentUsername, setOpponentUsername] = useState('');
  const [roundCount, setRoundCount] = useState(3);
  const [speakingTime, setSpeakingTime] = useState(120);
  const [votingTime, setVotingTime] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFormatChange(f: DebateFormat) {
    setFormat(f);
    const preset = FORMAT_PRESETS[f];
    if (preset) {
      setRoundCount(preset.round_count);
      setSpeakingTime(preset.speaking_time_seconds);
      setVotingTime(preset.voting_time_seconds);
    }
  }

  async function handleSubmit() {
    if (!user || !session) {
      Alert.alert('Error', 'You must be signed in.');
      return;
    }

    const parsed = createDebateSchema.safeParse({
      topic,
      description: description || undefined,
      format,
      side_a_label: sideALabel,
      side_b_label: sideBLabel,
      round_count: roundCount,
      speaking_time_seconds: speakingTime,
      voting_time_seconds: votingTime,
      is_public: true,
    });

    if (!parsed.success) {
      Alert.alert('Validation Error', parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    if (!opponentUsername.trim()) {
      Alert.alert('Error', "Enter your opponent's username.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: opponent, error: lookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', opponentUsername.trim())
        .single();

      if (lookupError || !opponent) {
        Alert.alert('Error', `User "${opponentUsername}" not found.`);
        setIsSubmitting(false);
        return;
      }

      if (opponent.id === user.id) {
        Alert.alert('Error', 'You cannot debate yourself.');
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-debate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({
            ...parsed.data,
            opponent_id: opponent.id,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to create debate' }));
        Alert.alert('Error', body.error ?? 'Failed to create debate');
        setIsSubmitting(false);
        return;
      }

      const { debate } = await res.json();
      router.replace(`/debate/${debate.id}`);
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Create Debate' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Topic */}
        <Text style={styles.label}>Topic *</Text>
        <TextInput
          style={styles.input}
          value={topic}
          onChangeText={setTopic}
          placeholder="e.g. Should AI be regulated?"
          placeholderTextColor="#6B7280"
          maxLength={200}
        />
        <Text style={styles.charCount}>{topic.length}/200</Text>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional context..."
          placeholderTextColor="#6B7280"
          maxLength={1000}
          multiline
        />

        {/* Opponent */}
        <Text style={styles.label}>Opponent Username *</Text>
        <TextInput
          style={styles.input}
          value={opponentUsername}
          onChangeText={setOpponentUsername}
          placeholder="Enter their username"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
        />

        {/* Side Labels */}
        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={[styles.label, { color: '#EF4444' }]}>Your Side</Text>
            <TextInput
              style={styles.input}
              value={sideALabel}
              onChangeText={setSideALabel}
              maxLength={50}
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={[styles.label, { color: '#3B82F6' }]}>Opponent Side</Text>
            <TextInput
              style={styles.input}
              value={sideBLabel}
              onChangeText={setSideBLabel}
              maxLength={50}
            />
          </View>
        </View>

        {/* Format */}
        <Text style={styles.label}>Format</Text>
        <View style={styles.formatGrid}>
          {FORMAT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.formatCard,
                format === opt.value && styles.formatCardActive,
              ]}
              onPress={() => handleFormatChange(opt.value)}
            >
              <Text
                style={[
                  styles.formatLabel,
                  format === opt.value && styles.formatLabelActive,
                ]}
              >
                {opt.label}
              </Text>
              <Text style={styles.formatDesc}>{opt.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Create Debate</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4D4D4',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
  },
  charCount: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  formatCard: {
    width: '47%',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 12,
  },
  formatCardActive: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  formatLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  formatLabelActive: {
    color: '#fff',
  },
  formatDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
