/** Platform-agnostic interface for Agora RTC */

export type AgoraRole = 'host' | 'audience';

export interface AgoraTokenRequest {
  channelId: string;
  userId: string;
  role: AgoraRole;
}

export interface AgoraTokenResponse {
  token: string;
  uid: number;
  channelId: string;
  expiresAt: number;
}

export interface VideoTrack {
  play: (element: HTMLElement | string) => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: boolean;
}

export interface AudioTrack {
  play: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: boolean;
}

export interface RemoteUser {
  uid: string | number;
  videoTrack?: VideoTrack;
  audioTrack?: AudioTrack;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** Platform adapter — each platform (web/mobile) implements this */
export interface AgoraPlatformAdapter {
  initialize(appId: string): Promise<void>;
  joinChannel(token: string, channelId: string, uid: number, role: AgoraRole): Promise<void>;
  leaveChannel(): Promise<void>;
  createLocalVideoTrack(): Promise<VideoTrack>;
  createLocalAudioTrack(): Promise<AudioTrack>;
  muteLocalAudio(muted: boolean): Promise<void>;
  muteLocalVideo(muted: boolean): Promise<void>;
  setClientRole(role: AgoraRole): Promise<void>;
  onUserJoined(callback: (user: RemoteUser) => void): void;
  onUserLeft(callback: (uid: string | number) => void): void;
  onUserPublished(callback: (user: RemoteUser, mediaType: 'audio' | 'video') => void): void;
  onUserUnpublished(callback: (user: RemoteUser, mediaType: 'audio' | 'video') => void): void;
  destroy(): Promise<void>;
}
