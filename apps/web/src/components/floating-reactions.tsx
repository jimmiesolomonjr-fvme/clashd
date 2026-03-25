'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { BroadcastMessage, ReactionMessage } from '@clashd/shared';

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number; // percentage 0-100
  createdAt: number;
}

const ANIMATION_DURATION_MS = 2500;
const MAX_VISIBLE = 30;

let nextId = 0;

interface FloatingReactionsProps {
  channel: RealtimeChannel | null;
}

export function FloatingReactions({ channel }: FloatingReactionsProps) {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const cleanupRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const addEmoji = useCallback((emoji: string) => {
    const newEmoji: FloatingEmoji = {
      id: nextId++,
      emoji,
      x: 10 + Math.random() * 80,
      createdAt: Date.now(),
    };

    setEmojis((prev) => {
      const updated = [...prev, newEmoji];
      // Cap at MAX_VISIBLE to prevent DOM overload
      if (updated.length > MAX_VISIBLE) {
        return updated.slice(-MAX_VISIBLE);
      }
      return updated;
    });
  }, []);

  // Listen to broadcast channel for reactions
  useEffect(() => {
    if (!channel) return;

    const handler = (payload: { payload: BroadcastMessage }) => {
      const msg = payload.payload;
      if (msg.type === 'reaction') {
        addEmoji((msg as ReactionMessage).emoji);
      }
    };

    // The channel is already subscribed; we add a listener
    channel.on('broadcast', { event: 'message' }, handler);

    return () => {
      // Supabase channels don't have a clean removeListener API,
      // but unsubscribing from the channel happens in the parent cleanup
    };
  }, [channel, addEmoji]);

  // Cleanup expired emojis every 500ms
  useEffect(() => {
    cleanupRef.current = setInterval(() => {
      const now = Date.now();
      setEmojis((prev) => prev.filter((e) => now - e.createdAt < ANIMATION_DURATION_MS));
    }, 500);
    return () => clearInterval(cleanupRef.current);
  }, []);

  if (emojis.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {emojis.map((e) => (
        <span
          key={e.id}
          className="absolute animate-float-up text-2xl"
          style={{ left: `${e.x}%`, bottom: 0 }}
        >
          {e.emoji}
        </span>
      ))}

      <style jsx>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            transform: translateY(-400px) scale(1.3);
            opacity: 0;
          }
        }
        .animate-float-up {
          animation: floatUp ${ANIMATION_DURATION_MS}ms ease-out forwards;
        }
      `}</style>
    </div>
  );
}
