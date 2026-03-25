'use client';

import { useState } from 'react';

interface DebaterInfo {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  userId: string;
}

interface WaitingRoomProps {
  debateId: string;
  topic: string;
  description?: string | null;
  sideALabel: string;
  sideBLabel: string;
  sideA: DebaterInfo;
  sideB: DebaterInfo;
  isCreator: boolean;
  sideAPresent: boolean;
  sideBPresent: boolean;
  audienceCount: number;
  onStart: () => Promise<void>;
}

function DebaterCard({
  debater,
  sideLabel,
  isPresent,
  color,
}: {
  debater: DebaterInfo;
  sideLabel: string;
  isPresent: boolean;
  color: 'red' | 'blue';
}) {
  const initials = (debater.display_name ?? debater.username ?? '?')[0].toUpperCase();
  const bgColor = color === 'red' ? 'bg-clash-red/20' : 'bg-clash-blue/20';
  const textColor = color === 'red' ? 'text-clash-red' : 'text-clash-blue';

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-6">
      <div className="relative">
        {debater.avatar_url ? (
          <img
            src={debater.avatar_url}
            alt={debater.username ?? 'Debater'}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${bgColor}`}>
            <span className={`text-xl font-bold ${textColor}`}>{initials}</span>
          </div>
        )}
        {/* Online indicator */}
        <span
          className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-neutral-900 ${
            isPresent ? 'bg-green-500' : 'bg-neutral-600'
          }`}
        />
      </div>
      <div className="text-center">
        <p className="font-semibold">{debater.display_name ?? debater.username ?? 'Unknown'}</p>
        <p className="text-xs text-neutral-500">@{debater.username ?? '...'}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${bgColor} ${textColor}`}>
        {sideLabel}
      </span>
      <span className={`text-xs ${isPresent ? 'text-green-400' : 'text-neutral-500'}`}>
        {isPresent ? 'In room' : 'Not here yet'}
      </span>
    </div>
  );
}

export function WaitingRoom({
  debateId,
  topic,
  description,
  sideALabel,
  sideBLabel,
  sideA,
  sideB,
  isCreator,
  sideAPresent,
  sideBPresent,
  audienceCount,
  onStart,
}: WaitingRoomProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const bothPresent = sideAPresent && sideBPresent;

  async function handleStart() {
    setIsStarting(true);
    try {
      await onStart();
    } finally {
      setIsStarting(false);
    }
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/debate/${debateId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-8">
      {/* Header */}
      <div className="text-center">
        <span className="mb-3 inline-block rounded-full bg-yellow-900/50 px-4 py-1.5 text-sm font-medium text-yellow-400">
          WAITING ROOM
        </span>
        <h2 className="mt-3 text-2xl font-bold">{topic}</h2>
        {description && (
          <p className="mt-2 text-sm text-neutral-400">{description}</p>
        )}
      </div>

      {/* Debater cards */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <DebaterCard debater={sideA} sideLabel={sideALabel} isPresent={sideAPresent} color="red" />
        </div>
        <span className="text-2xl font-bold text-neutral-600">VS</span>
        <div className="flex-1">
          <DebaterCard debater={sideB} sideLabel={sideBLabel} isPresent={sideBPresent} color="blue" />
        </div>
      </div>

      {/* Audience count */}
      <div className="text-center text-sm text-neutral-500">
        {audienceCount} {audienceCount === 1 ? 'person' : 'people'} watching
      </div>

      {/* Start button (creator only) */}
      {isCreator && (
        <div className="text-center">
          <button
            onClick={handleStart}
            disabled={!bothPresent || isStarting}
            className="btn-red px-10 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Starting...
              </span>
            ) : (
              'Start Debate'
            )}
          </button>
          {!bothPresent && (
            <p className="mt-2 text-xs text-neutral-500">
              Waiting for both debaters to join before starting.
            </p>
          )}
        </div>
      )}

      {!isCreator && (
        <div className="text-center">
          <p className="text-sm text-neutral-400">
            Waiting for the debate creator to start...
          </p>
        </div>
      )}

      {/* Share link */}
      <div className="text-center">
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>
    </div>
  );
}
