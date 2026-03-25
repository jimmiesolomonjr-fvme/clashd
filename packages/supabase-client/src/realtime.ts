import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getDebateChannels, type BroadcastMessage, type PresenceState } from '@clashd/shared';

type Client = SupabaseClient<Database>;

export interface DebateRealtimeChannels {
  broadcast: RealtimeChannel;
  state: RealtimeChannel;
  chat: RealtimeChannel;
  presence: RealtimeChannel;
  cleanup: () => void;
}

export function subscribeToDebate(
  client: Client,
  debateId: string,
  handlers: {
    onBroadcast?: (message: BroadcastMessage) => void;
    onDebateChange?: (payload: { new: Database['public']['Tables']['debates']['Row'] }) => void;
    onRoundChange?: (payload: { new: Database['public']['Tables']['rounds']['Row'] }) => void;
    onNewComment?: (payload: { new: Database['public']['Tables']['comments']['Row'] }) => void;
    onPresenceSync?: (state: Record<string, PresenceState[]>) => void;
  },
): DebateRealtimeChannels {
  const channelNames = getDebateChannels(debateId);

  // Broadcast channel — reactions, mute control, audience meter
  const broadcast = client
    .channel(channelNames.broadcast)
    .on('broadcast', { event: 'message' }, (payload) => {
      handlers.onBroadcast?.(payload.payload as BroadcastMessage);
    })
    .subscribe();

  // State channel — debate and round postgres changes
  const state = client
    .channel(channelNames.state)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'debates', filter: `id=eq.${debateId}` },
      (payload) => {
        handlers.onDebateChange?.(
          payload as unknown as { new: Database['public']['Tables']['debates']['Row'] },
        );
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rounds', filter: `debate_id=eq.${debateId}` },
      (payload) => {
        handlers.onRoundChange?.(
          payload as unknown as { new: Database['public']['Tables']['rounds']['Row'] },
        );
      },
    )
    .subscribe();

  // Chat channel — live comments
  const chat = client
    .channel(channelNames.chat)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `debate_id=eq.${debateId}` },
      (payload) => {
        handlers.onNewComment?.(
          payload as unknown as { new: Database['public']['Tables']['comments']['Row'] },
        );
      },
    )
    .subscribe();

  // Presence channel — audience count
  const presence = client
    .channel(channelNames.presence)
    .on('presence', { event: 'sync' }, () => {
      const presenceState = presence.presenceState() as unknown as Record<string, PresenceState[]>;
      handlers.onPresenceSync?.(presenceState);
    })
    .subscribe();

  return {
    broadcast,
    state,
    chat,
    presence,
    cleanup: () => {
      client.removeChannel(broadcast);
      client.removeChannel(state);
      client.removeChannel(chat);
      client.removeChannel(presence);
    },
  };
}

export function sendReaction(channel: RealtimeChannel, emoji: string, userId: string) {
  return channel.send({
    type: 'broadcast',
    event: 'message',
    payload: { type: 'reaction', emoji, user_id: userId, timestamp: Date.now() },
  });
}

export function trackPresence(channel: RealtimeChannel, state: PresenceState) {
  return channel.track(state);
}
