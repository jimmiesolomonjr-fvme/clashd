'use client';

import { useState, useCallback } from 'react';
import type { ReportReason } from '@clashd/shared';

// ---------------------------------------------------------------------------
// Human-readable labels for each report reason
// ---------------------------------------------------------------------------

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'harassment', label: 'Harassment or Bullying' },
  { value: 'spam', label: 'Spam or Scam' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'other', label: 'Other' },
];

const MAX_DETAILS_LENGTH = 500;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportButtonProps {
  onSubmit: (reason: ReportReason, details?: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportButton({ onSubmit }: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setSelectedReason(null);
    setDetails('');
    setSubmitError(null);
  }, []);

  const handleOpen = useCallback(() => {
    resetForm();
    setIsOpen(true);
  }, [resetForm]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(selectedReason, details.trim() || undefined);
      setIsOpen(false);
      resetForm();

      // Show success toast
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedReason, details, isSubmitting, onSubmit, resetForm]);

  return (
    <>
      {/* Report trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
        title="Report this debate"
      >
        {/* Flag icon (SVG) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439l-1.475.31V2.75Z" />
        </svg>
        Report
      </button>

      {/* Success toast */}
      {showSuccess && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg border border-green-800 bg-green-900/90 px-4 py-2.5 text-sm font-medium text-green-300 shadow-lg backdrop-blur-sm">
            Report submitted. Thank you for helping keep Clashd safe.
          </div>
        </div>
      )}

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 id="report-dialog-title" className="text-lg font-bold text-white">
                Report this Debate
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Reason selection */}
            <p className="mb-3 text-sm text-neutral-400">
              Why are you reporting this debate?
            </p>
            <div className="mb-4 space-y-2">
              {REPORT_REASONS.map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    selectedReason === value
                      ? 'border-clash-red/60 bg-clash-red/10 text-white'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={selectedReason === value}
                    onChange={() => setSelectedReason(value)}
                    className="sr-only"
                  />
                  {/* Custom radio indicator */}
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      selectedReason === value
                        ? 'border-clash-red bg-clash-red'
                        : 'border-neutral-500'
                    }`}
                  >
                    {selectedReason === value && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>

            {/* Optional details textarea */}
            <div className="mb-5">
              <label htmlFor="report-details" className="mb-1.5 block text-sm text-neutral-400">
                Additional details{' '}
                <span className="text-neutral-600">(optional)</span>
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS_LENGTH))}
                placeholder="Describe what happened..."
                maxLength={MAX_DETAILS_LENGTH}
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-neutral-600">
                {details.length}/{MAX_DETAILS_LENGTH}
              </p>
            </div>

            {/* Error message */}
            {submitError && (
              <p className="mb-4 text-sm text-red-400">{submitError}</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedReason || isSubmitting}
                className="rounded-lg bg-clash-red px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Submitting...
                  </span>
                ) : (
                  'Submit Report'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
