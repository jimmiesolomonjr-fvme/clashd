'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AgoraPlatformAdapter,
  AgoraRole,
  VideoTrack,
  AudioTrack,
  RemoteUser,
} from '../types';

export interface UseAgoraOptions {
  adapter: AgoraPlatformAdapter;
  appId: string;
  token: string;
  channelId: string;
  uid: number;
  role: AgoraRole;
  enabled?: boolean;
}

export interface UseAgoraReturn {
  localVideoTrack: VideoTrack | null;
  localAudioTrack: AudioTrack | null;
  remoteUsers: RemoteUser[];
  isJoined: boolean;
  isConnecting: boolean;
  error: string | null;
  muteAudio: (muted: boolean) => Promise<void>;
  muteVideo: (muted: boolean) => Promise<void>;
}

export function useAgora({
  adapter,
  appId,
  token,
  channelId,
  uid,
  role,
  enabled = true,
}: UseAgoraOptions): UseAgoraReturn {
  const [localVideoTrack, setLocalVideoTrack] = useState<VideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<AudioTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adapterRef = useRef(adapter);
  const joinedRef = useRef(false);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    if (!enabled || !token || !channelId) return;

    let cancelled = false;

    async function connect() {
      setIsConnecting(true);
      setError(null);

      try {
        const a = adapterRef.current;

        await a.initialize(appId);

        a.onUserJoined((user) => {
          if (!cancelled) {
            setRemoteUsers((prev) => {
              if (prev.some((u) => u.uid === user.uid)) return prev;
              return [...prev, user];
            });
          }
        });

        a.onUserLeft((leftUid) => {
          if (!cancelled) {
            setRemoteUsers((prev) => prev.filter((u) => u.uid !== leftUid));
          }
        });

        a.onUserPublished((user) => {
          if (!cancelled) {
            setRemoteUsers((prev) => prev.map((u) => (u.uid === user.uid ? user : u)));
          }
        });

        a.onUserUnpublished((user) => {
          if (!cancelled) {
            setRemoteUsers((prev) => prev.map((u) => (u.uid === user.uid ? user : u)));
          }
        });

        await a.joinChannel(token, channelId, uid, role);
        joinedRef.current = true;

        if (cancelled) return;
        setIsJoined(true);

        if (role === 'host') {
          const video = await a.createLocalVideoTrack();
          if (!cancelled) setLocalVideoTrack(video);

          const audio = await a.createLocalAudioTrack();
          if (!cancelled) setLocalAudioTrack(audio);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to connect to video');
        }
      } finally {
        if (!cancelled) setIsConnecting(false);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (joinedRef.current) {
        adapterRef.current.destroy().catch(() => {});
        joinedRef.current = false;
      }
      setIsJoined(false);
      setLocalVideoTrack(null);
      setLocalAudioTrack(null);
      setRemoteUsers([]);
    };
  }, [enabled, token, channelId, uid, role, appId]);

  const muteAudio = useCallback(
    async (muted: boolean) => {
      await adapterRef.current.muteLocalAudio(muted);
    },
    [],
  );

  const muteVideo = useCallback(
    async (muted: boolean) => {
      await adapterRef.current.muteLocalVideo(muted);
    },
    [],
  );

  return {
    localVideoTrack,
    localAudioTrack,
    remoteUsers,
    isJoined,
    isConnecting,
    error,
    muteAudio,
    muteVideo,
  };
}
