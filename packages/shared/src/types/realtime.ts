// Real-time channel message types

export type EmojiReaction = '🔥' | '👏' | '💀' | '🤔' | '😂' | '💯' | '👎' | '❤️';

export interface ReactionMessage {
  type: 'reaction';
  emoji: EmojiReaction;
  user_id: string;
  timestamp: number;
}

export interface AudienceMeterMessage {
  type: 'audience_meter';
  side_a_percentage: number;
  side_b_percentage: number;
  sample_size: number;
}

export interface MuteControlMessage {
  type: 'mute_control';
  target_user_id: string;
  muted: boolean;
  reason: 'turn_ended' | 'moderation' | 'manual';
}

export interface TimerSyncMessage {
  type: 'timer_sync';
  round_id: string;
  phase: string;
  remaining_seconds: number;
  server_timestamp: number;
}

export interface DebatePausedMessage {
  type: 'debate_paused';
  report_count: number;
  reason: string;
}

export type BroadcastMessage =
  | ReactionMessage
  | AudienceMeterMessage
  | MuteControlMessage
  | TimerSyncMessage
  | DebatePausedMessage;

export interface PresenceState {
  user_id: string;
  username: string;
  avatar_url: string | null;
  joined_at: number;
}

export interface DebateChannels {
  broadcast: string; // `debate:${id}` — reactions, meter, mute control
  state: string; // `debate-state:${id}` — postgres changes
  chat: string; // `debate-chat:${id}` — postgres changes for comments
  presence: string; // `debate-presence:${id}` — who's watching
}

export function getDebateChannels(debateId: string): DebateChannels {
  return {
    broadcast: `debate:${debateId}`,
    state: `debate-state:${debateId}`,
    chat: `debate-chat:${debateId}`,
    presence: `debate-presence:${debateId}`,
  };
}
