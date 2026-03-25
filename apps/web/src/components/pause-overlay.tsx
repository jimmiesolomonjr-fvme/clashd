'use client';

interface PauseOverlayProps {
  reportCount?: number;
  reason?: string;
}

export function PauseOverlay({ reportCount, reason }: PauseOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md text-center">
        {/* Warning icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
          <svg
            className="h-8 w-8 text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="mb-2 text-2xl font-bold text-white">Debate Paused</h2>

        {/* Description */}
        <p className="mb-4 text-sm text-neutral-400">
          This debate has been paused for review due to community reports.
        </p>

        {/* Reason */}
        {reason && (
          <p className="mb-3 text-sm text-neutral-500">
            Reason: {reason}
          </p>
        )}

        {/* Report count */}
        {reportCount != null && reportCount > 0 && (
          <p className="mb-4 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300">
            Reports received: {reportCount}
          </p>
        )}

        {/* Footer */}
        <p className="text-xs text-neutral-500">
          A moderator will review shortly. Please stand by.
        </p>
      </div>
    </div>
  );
}
