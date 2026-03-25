import React from 'react';

export interface TimerDisplayProps {
  remainingSeconds: number;
  totalSeconds: number;
  isActive: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Shared timer display component (render adapter per platform) */
export function useTimerValue(
  timerStartedAt: number | null,
  timerDurationSeconds: number,
): { remainingSeconds: number; isExpired: boolean } {
  const [remaining, setRemaining] = React.useState(timerDurationSeconds);

  React.useEffect(() => {
    if (!timerStartedAt) {
      setRemaining(timerDurationSeconds);
      return;
    }

    const update = () => {
      const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);
      const left = Math.max(0, timerDurationSeconds - elapsed);
      setRemaining(left);
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [timerStartedAt, timerDurationSeconds]);

  return { remainingSeconds: remaining, isExpired: remaining <= 0 };
}
