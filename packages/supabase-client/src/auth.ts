import type { SupabaseClient, Session, User, AuthError } from '@supabase/supabase-js';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;

type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError };

// --- Email Auth ---

export async function signUpWithEmail(
  client: Client,
  email: string,
  password: string,
  metadata?: { username?: string; display_name?: string },
): Promise<AuthResult<{ user: User | null; session: Session | null }>> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) return { data: null, error };
  return { data: { user: data.user, session: data.session }, error: null };
}

export async function signInWithEmail(
  client: Client,
  email: string,
  password: string,
): Promise<AuthResult<{ user: User; session: Session }>> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { data: null, error };
  return { data: { user: data.user, session: data.session }, error: null };
}

// --- OAuth ---

export type OAuthProvider = 'google' | 'apple';

export async function signInWithOAuth(
  client: Client,
  provider: OAuthProvider,
  redirectTo?: string,
) {
  return client.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
}

// --- Session ---

export async function getSession(client: Client) {
  return client.auth.getSession();
}

export async function getUser(client: Client) {
  return client.auth.getUser();
}

export async function signOut(client: Client) {
  return client.auth.signOut();
}

export async function refreshSession(client: Client) {
  return client.auth.refreshSession();
}

// --- Password Reset ---

export async function resetPasswordForEmail(client: Client, email: string, redirectTo?: string) {
  return client.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(client: Client, newPassword: string) {
  return client.auth.updateUser({ password: newPassword });
}

// --- Auth State Listener ---

export function onAuthStateChange(
  client: Client,
  callback: (event: string, session: Session | null) => void,
) {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(callback);
  return subscription;
}
