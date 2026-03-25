'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { updateProfileSchema } from '@clashd/shared';

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUsername(profile.username);
        setDisplayName(profile.display_name || '');
        setBio(profile.bio || '');
        setAvatarUrl(profile.avatar_url || '');
      }
      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const parsed = updateProfileSchema.safeParse({
      username: username || undefined,
      display_name: displayName || undefined,
      bio: bio || undefined,
      avatar_url: avatarUrl || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username: username,
        display_name: displayName || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
      })
      .eq('id', user.id);

    setSaving(false);

    if (updateError) {
      if (updateError.code === '23505') {
        setError('This username is already taken.');
      } else {
        setError(updateError.message);
      }
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push(`/profile/${username}`), 1000);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-neutral-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold">Edit Profile</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-3 text-sm text-green-400">
            Profile updated! Redirecting...
          </div>
        )}

        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="your_username"
            required
          />
          <p className="mt-1 text-xs text-neutral-500">Letters, numbers, and underscores only</p>
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="mb-1.5 block text-sm font-medium text-neutral-300"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="Your Name"
          />
        </div>

        <div>
          <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="Tell others about yourself..."
          />
          <p className="mt-1 text-xs text-neutral-500">{bio.length}/500</p>
        </div>

        <div>
          <label htmlFor="avatarUrl" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Avatar URL
          </label>
          <input
            id="avatarUrl"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="https://..."
          />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-red flex-1 py-3 text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-outline flex-1 py-3 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
