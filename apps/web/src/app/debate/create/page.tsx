'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { createClient } from '@/lib/supabase/client';
import { FORMAT_PRESETS, createDebateSchema } from '@clashd/shared';
import type { DebateFormat } from '@clashd/shared';

const FORMAT_OPTIONS: { value: DebateFormat; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: '3 rounds, 2 min each' },
  { value: 'rapid', label: 'Rapid Fire', description: '5 rounds, 1 min each' },
  { value: 'extended', label: 'Extended', description: '3 rounds, 5 min each' },
  { value: 'custom', label: 'Custom', description: 'Set your own rules' },
];

export default function CreateDebatePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClient();

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<DebateFormat>('classic');
  const [sideALabel, setSideALabel] = useState('For');
  const [sideBLabel, setSideBLabel] = useState('Against');
  const [roundCount, setRoundCount] = useState(3);
  const [speakingTime, setSpeakingTime] = useState(120);
  const [votingTime, setVotingTime] = useState(10);
  const [isPublic, setIsPublic] = useState(true);
  const [opponentUsername, setOpponentUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFormatChange(newFormat: DebateFormat) {
    setFormat(newFormat);
    const preset = FORMAT_PRESETS[newFormat];
    if (preset) {
      setRoundCount(preset.round_count);
      setSpeakingTime(preset.speaking_time_seconds);
      setVotingTime(preset.voting_time_seconds);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('You must be signed in to create a debate.');
      return;
    }

    // Client-side validation
    const parsed = createDebateSchema.safeParse({
      topic,
      description: description || undefined,
      format,
      side_a_label: sideALabel,
      side_b_label: sideBLabel,
      round_count: roundCount,
      speaking_time_seconds: speakingTime,
      voting_time_seconds: votingTime,
      is_public: isPublic,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    // Look up opponent by username
    if (!opponentUsername.trim()) {
      setError('Enter your opponent\'s username.');
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
        setError(`User "${opponentUsername}" not found.`);
        setIsSubmitting(false);
        return;
      }

      if (opponent.id === user.id) {
        setError('You cannot debate yourself.');
        setIsSubmitting(false);
        return;
      }

      // Call create-debate Edge Function
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-debate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({
            topic: parsed.data.topic,
            description: parsed.data.description,
            format: parsed.data.format,
            side_a_label: parsed.data.side_a_label,
            side_b_label: parsed.data.side_b_label,
            round_count: parsed.data.round_count,
            speaking_time_seconds: parsed.data.speaking_time_seconds,
            voting_time_seconds: parsed.data.voting_time_seconds,
            is_public: parsed.data.is_public,
            opponent_id: opponent.id,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to create debate' }));
        setError(body.error ?? 'Failed to create debate');
        setIsSubmitting(false);
        return;
      }

      const { debate } = await res.json();
      router.push(`/debate/${debate.id}`);
    } catch {
      setError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-500 border-t-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">Sign in to create a debate</h1>
        <Link href="/login?redirectTo=/debate/create" className="btn-red px-6 py-3">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        &larr; Back
      </Link>

      <h1 className="mb-2 text-2xl font-bold">Create a Debate</h1>
      <p className="mb-8 text-neutral-400">Set up the topic, format, and invite your opponent.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Topic */}
        <div>
          <label htmlFor="topic" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Topic *
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Should AI be regulated by governments?"
            required
            minLength={5}
            maxLength={200}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <p className="mt-1 text-xs text-neutral-500">{topic.length}/200</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Description <span className="text-neutral-500">(optional)</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context or rules for the debate..."
            maxLength={1000}
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>

        {/* Opponent */}
        <div>
          <label htmlFor="opponent" className="mb-1.5 block text-sm font-medium text-neutral-300">
            Opponent Username *
          </label>
          <input
            id="opponent"
            type="text"
            value={opponentUsername}
            onChange={(e) => setOpponentUsername(e.target.value)}
            placeholder="Enter their username"
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>

        {/* Side Labels */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sideA" className="mb-1.5 block text-sm font-medium text-clash-red">
              Your Side Label
            </label>
            <input
              id="sideA"
              type="text"
              value={sideALabel}
              onChange={(e) => setSideALabel(e.target.value)}
              maxLength={50}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>
          <div>
            <label htmlFor="sideB" className="mb-1.5 block text-sm font-medium text-clash-blue">
              Opponent&apos;s Side Label
            </label>
            <input
              id="sideB"
              type="text"
              value={sideBLabel}
              onChange={(e) => setSideBLabel(e.target.value)}
              maxLength={50}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>
        </div>

        {/* Format */}
        <div>
          <label className="mb-3 block text-sm font-medium text-neutral-300">Format</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleFormatChange(opt.value)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  format === opt.value
                    ? 'border-white bg-white/10 text-white'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600'
                }`}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom settings (only shown for custom format) */}
        {format === 'custom' && (
          <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <h3 className="text-sm font-medium text-neutral-300">Custom Settings</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="rounds" className="mb-1.5 block text-xs text-neutral-400">
                  Rounds (1-10)
                </label>
                <input
                  id="rounds"
                  type="number"
                  min={1}
                  max={10}
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="speakTime" className="mb-1.5 block text-xs text-neutral-400">
                  Speaking (sec)
                </label>
                <input
                  id="speakTime"
                  type="number"
                  min={30}
                  max={600}
                  step={10}
                  value={speakingTime}
                  onChange={(e) => setSpeakingTime(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="voteTime" className="mb-1.5 block text-xs text-neutral-400">
                  Voting (sec)
                </label>
                <input
                  id="voteTime"
                  type="number"
                  min={5}
                  max={60}
                  step={5}
                  value={votingTime}
                  onChange={(e) => setVotingTime(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Public toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-300">Public Debate</p>
            <p className="text-xs text-neutral-500">Anyone can watch and vote</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isPublic ? 'bg-clash-red' : 'bg-neutral-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPublic ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-red w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating Debate...
            </span>
          ) : (
            'Create Debate'
          )}
        </button>
      </form>
    </div>
  );
}
