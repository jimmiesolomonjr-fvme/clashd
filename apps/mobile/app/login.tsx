import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../context/auth-context';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp, signInWithOAuth } = useAuth();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    if (isSignUp && !username.trim()) {
      Alert.alert('Missing Fields', 'Please enter a username.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email.trim(), password, username.trim());
        if (error) {
          Alert.alert('Sign Up Failed', error.message);
        } else {
          router.replace('/');
        }
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          Alert.alert('Sign In Failed', error.message);
        } else {
          router.replace('/');
        }
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    const setLoading = provider === 'google' ? setIsGoogleLoading : setIsAppleLoading;
    setLoading(true);

    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        Alert.alert('OAuth Failed', error.message);
      }
      // On success, the auth state listener in the context will trigger
      // the AuthGate redirect automatically.
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: isSignUp ? 'Create Account' : 'Sign In',
          headerShown: false,
        }}
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>CLASHD</Text>
              <Text style={styles.subtitle}>
                {isSignUp ? 'Create your account' : 'Sign in to start debating'}
              </Text>
            </View>

            <View style={styles.form}>
              {isSignUp && (
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#6B7280"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#6B7280"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  isSignUp ? styles.signUpButton : styles.signInButton,
                  pressed && styles.buttonPressed,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.oauthButton,
                  pressed && styles.buttonPressed,
                  isGoogleLoading && styles.buttonDisabled,
                ]}
                onPress={() => handleOAuth('google')}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.oauthButtonText}>Continue with Google</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.oauthButton,
                  pressed && styles.buttonPressed,
                  isAppleLoading && styles.buttonDisabled,
                ]}
                onPress={() => handleOAuth('apple')}
                disabled={isAppleLoading}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.oauthButtonText}>Continue with Apple</Text>
                )}
              </Pressable>

              <Pressable style={styles.toggleButton} onPress={toggleMode}>
                <Text style={styles.toggleText}>
                  {isSignUp
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Create Account"}
                </Text>
              </Pressable>
            </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  button: {
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  signInButton: {
    backgroundColor: '#EF4444',
    marginTop: 8,
  },
  signUpButton: {
    backgroundColor: '#3B82F6',
    marginTop: 8,
  },
  oauthButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  oauthButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A2A',
  },
  dividerText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
