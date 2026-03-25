import type {
  AgoraPlatformAdapter,
  AgoraRole,
  VideoTrack,
  AudioTrack,
  RemoteUser,
} from './types';

/**
 * Web implementation of AgoraPlatformAdapter using agora-rtc-sdk-ng.
 *
 * This adapter lazily imports the Agora Web SDK to keep it out of
 * server-side bundles. All methods are async and safe to call from
 * React hooks.
 */
export class WebAgoraAdapter implements AgoraPlatformAdapter {
  private client: any = null;
  private localVideoTrack: any = null;
  private localAudioTrack: any = null;
  private AgoraRTC: any = null;

  private userJoinedCb?: (user: RemoteUser) => void;
  private userLeftCb?: (uid: string | number) => void;
  private userPublishedCb?: (user: RemoteUser, mediaType: 'audio' | 'video') => void;
  private userUnpublishedCb?: (user: RemoteUser, mediaType: 'audio' | 'video') => void;

  async initialize(appId: string): Promise<void> {
    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    this.AgoraRTC = AgoraRTC;
    AgoraRTC.setLogLevel(3); // warnings only

    this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

    this.client.on('user-joined', (user: any) => {
      this.userJoinedCb?.(this.wrapRemoteUser(user));
    });

    this.client.on('user-left', (user: any) => {
      this.userLeftCb?.(user.uid);
    });

    this.client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
      await this.client.subscribe(user, mediaType);
      this.userPublishedCb?.(this.wrapRemoteUser(user), mediaType);
    });

    this.client.on('user-unpublished', (user: any, mediaType: 'audio' | 'video') => {
      this.userUnpublishedCb?.(this.wrapRemoteUser(user), mediaType);
    });
  }

  async joinChannel(token: string, channelId: string, uid: number, role: AgoraRole): Promise<void> {
    if (!this.client) throw new Error('Agora not initialized');
    await this.client.setClientRole(role === 'host' ? 'host' : 'audience');
    await this.client.join(undefined, channelId, token, uid);
  }

  async leaveChannel(): Promise<void> {
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack.close();
      this.localVideoTrack = null;
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack.close();
      this.localAudioTrack = null;
    }
    await this.client?.leave();
  }

  async createLocalVideoTrack(): Promise<VideoTrack> {
    if (!this.AgoraRTC) throw new Error('Agora not initialized');
    this.localVideoTrack = await this.AgoraRTC.createCameraVideoTrack();
    await this.client?.publish([this.localVideoTrack]);
    return this.wrapLocalVideoTrack(this.localVideoTrack);
  }

  async createLocalAudioTrack(): Promise<AudioTrack> {
    if (!this.AgoraRTC) throw new Error('Agora not initialized');
    this.localAudioTrack = await this.AgoraRTC.createMicrophoneAudioTrack();
    await this.client?.publish([this.localAudioTrack]);
    return this.wrapLocalAudioTrack(this.localAudioTrack);
  }

  async muteLocalAudio(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setMuted(muted);
    }
  }

  async muteLocalVideo(muted: boolean): Promise<void> {
    if (this.localVideoTrack) {
      await this.localVideoTrack.setMuted(muted);
    }
  }

  async setClientRole(role: AgoraRole): Promise<void> {
    await this.client?.setClientRole(role === 'host' ? 'host' : 'audience');
  }

  onUserJoined(callback: (user: RemoteUser) => void): void {
    this.userJoinedCb = callback;
  }

  onUserLeft(callback: (uid: string | number) => void): void {
    this.userLeftCb = callback;
  }

  onUserPublished(callback: (user: RemoteUser, mediaType: 'audio' | 'video') => void): void {
    this.userPublishedCb = callback;
  }

  onUserUnpublished(callback: (user: RemoteUser, mediaType: 'audio' | 'video') => void): void {
    this.userUnpublishedCb = callback;
  }

  async destroy(): Promise<void> {
    await this.leaveChannel();
    this.client = null;
    this.AgoraRTC = null;
  }

  private wrapRemoteUser(user: any): RemoteUser {
    return {
      uid: user.uid,
      videoTrack: user.videoTrack
        ? {
            play: (el: HTMLElement | string) => user.videoTrack.play(el),
            stop: () => user.videoTrack.stop(),
            setMuted: (m: boolean) => user.videoTrack.setMuted(m),
            isMuted: user.videoTrack.muted ?? false,
          }
        : undefined,
      audioTrack: user.audioTrack
        ? {
            play: () => user.audioTrack.play(),
            stop: () => user.audioTrack.stop(),
            setMuted: (m: boolean) => user.audioTrack.setMuted(m),
            isMuted: user.audioTrack.muted ?? false,
          }
        : undefined,
      hasVideo: !!user.videoTrack,
      hasAudio: !!user.audioTrack,
    };
  }

  private wrapLocalVideoTrack(track: any): VideoTrack {
    return {
      play: (el: HTMLElement | string) => track.play(el),
      stop: () => track.stop(),
      setMuted: (m: boolean) => track.setMuted(m),
      get isMuted() {
        return track.muted ?? false;
      },
    };
  }

  private wrapLocalAudioTrack(track: any): AudioTrack {
    return {
      play: () => track.play(),
      stop: () => track.stop(),
      setMuted: (m: boolean) => track.setMuted(m),
      get isMuted() {
        return track.muted ?? false;
      },
    };
  }
}
