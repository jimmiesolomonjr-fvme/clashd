'use client';

import { useState, useEffect, useCallback } from 'react';

interface PreRollAdProps {
  onComplete: () => void;
  isPlus: boolean;
}

const COUNTDOWN_SECONDS = 5;

/**
 * A placeholder pre-roll ad shown before a live debate starts.
 *
 * - Displays a full-width dark card with "Advertisement" label and placeholder content.
 * - Counts down from 5 seconds, then reveals a "Skip" button.
 * - If the viewer is a Clash+ subscriber (`isPlus`), the ad is skipped
 *   immediately by calling `onComplete()` on mount.
 */
export function PreRollAd({ onComplete, isPlus }: PreRollAdProps) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const canSkip = remaining <= 0;

  // Clash+ users bypass the ad entirely
  useEffect(() => {
    if (isPlus) {
      onComplete();
    }
  }, [isPlus, onComplete]);

  // Countdown timer
  useEffect(() => {
    if (isPlus) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlus]);

  // Auto-complete when countdown reaches zero
  const handleSkip = useCallback(() => {
    if (canSkip) {
      onComplete();
    }
  }, [canSkip, onComplete]);

  // Don't render anything for Clash+ users
  if (isPlus) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Advertisement
          </span>
          <div>
            {canSkip ? (
              <button
                onClick={handleSkip}
                className="rounded-md bg-neutral-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-600"
              >
                Skip
              </button>
            ) : (
              <span className="text-xs text-neutral-500">
                Skip in {remaining}s
              </span>
            )}
          </div>
        </div>

        {/* Ad placeholder content */}
        <div className="flex aspect-video items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-dashed border-neutral-700 px-12 py-8">
              <p className="text-lg font-medium text-neutral-600">Your ad here</p>
            </div>
            <p className="text-xs text-neutral-600">
              Support Clashd &mdash;{' '}
              <a href="/pricing" className="text-neutral-400 underline hover:text-white">
                upgrade to Clash+
              </a>{' '}
              to remove ads
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
