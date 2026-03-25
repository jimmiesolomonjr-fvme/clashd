import type { AgoraPlatformAdapter } from './types';

/**
 * Controls muting based on debate turn state.
 * Server sends MUTE_CONTROL messages via Supabase Broadcast.
 * This controller applies them to the local Agora audio stream.
 */
export class MuteController {
  private adapter: AgoraPlatformAdapter;
  private currentUserId: string;
  private isMuted = false;

  constructor(adapter: AgoraPlatformAdapter, currentUserId: string) {
    this.adapter = adapter;
    this.currentUserId = currentUserId;
  }

  /** Handle a mute control message from the server */
  async handleMuteControl(targetUserId: string, muted: boolean): Promise<void> {
    if (targetUserId !== this.currentUserId) return;

    this.isMuted = muted;
    await this.adapter.muteLocalAudio(muted);
  }

  /** Force mute (e.g., when turn ends) */
  async forceMute(): Promise<void> {
    this.isMuted = true;
    await this.adapter.muteLocalAudio(true);
  }

  /** Force unmute (e.g., when turn starts) */
  async forceUnmute(): Promise<void> {
    this.isMuted = false;
    await this.adapter.muteLocalAudio(false);
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }
}
