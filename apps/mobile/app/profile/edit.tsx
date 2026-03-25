import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { updateProfileSchema } from '@clashd/shared';
import { getProfile, updateProfile } from '@clashd/supabase-client';
import { useAuth } from '../../context/auth-context';
import { supabase } from '../../lib/supabase';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      setIsLoadingProfile(true);
      const { data, error } = await getProfile(supabase, user!.id);
      if (error) {
        Alert.alert('Error', 'Failed to load profile.');
      } else if (data) {
        setUsername(data.username ?? '');
        setDisplayName(data.display_name ?? '');
        setBio(data.bio ?? '');
      }
      setIsLoadingProfile(false);
    }

    loadProfile();
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) return;

    // Validate with the shared schema
    const parsed = updateProfileSchema.safeParse({
      username: username.trim() || undefined,
      display_name: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
    });

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      Alert.alert('Validation Error', firstError?.message ?? 'Invalid input.');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await updateProfile(supabase, user.id, {
        username: parsed.data.username,
        display_name: parsed.data.display_name,
        bio: parsed.data.bio,
      });

      if (error) {
        Alert.alert('Save Failed', error.message);
      } else {
        Alert.alert('Success', 'Profile updated.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [user, username, displayName, bio, router]);

  if (isLoadingProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Profile' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="username"
                placeholderTextColor="#6B7280"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
              <Text style={styles.hint}>
                3-30 characters. Letters, numbers, and underscores only.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your display name"
                placeholderTextColor="#6B7280"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={50}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder="Tell the audience about yourself..."
                placeholderTextColor="#6B7280"
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.hint}>{bio.length}/500</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.buttonPressed,
                isSaving && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 24,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  bioInput: {
    minHeight: 120,
    paddingTop: 14,
  },
  hint: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 4,
  },
  saveButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 56,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
