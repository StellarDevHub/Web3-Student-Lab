'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MeshPeerState,
  SignalingTransport,
  WebRtcMeshRoom,
} from '@/services/webrtc/meshRoom';

export interface UseWebRtcCallOptions {
  roomId: string;
  localPeerId: string;
  displayName?: string;
  signaling?: SignalingTransport | null;
  maxPeers?: number;
  collaborativeTrafficHigh?: boolean;
}

export interface UseWebRtcCallReturn {
  peers: MeshPeerState[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isJoined: boolean;
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  pushToTalkEnabled: boolean;
  pushToTalkActive: boolean;
  audioBitrateBps: number;
  error: string | null;
  joinCall: (initialStream?: MediaStream) => Promise<void>;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  setPushToTalkMode: (enabled: boolean) => void;
  setPushToTalkPressed: (pressed: boolean) => void;
  setCollaborativeTrafficHigh: (isHigh: boolean) => Promise<void>;
}

export function useWebRtcCall({
  roomId,
  localPeerId,
  displayName,
  signaling,
  maxPeers = 4,
  collaborativeTrafficHigh = false,
}: UseWebRtcCallOptions): UseWebRtcCallReturn {
  const roomRef = useRef<WebRtcMeshRoom | null>(null);
  const [peers, setPeers] = useState<MeshPeerState[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [audioBitrateBps, setAudioBitrateBps] = useState(48_000);
  const [error, setError] = useState<string | null>(null);

  const joinCall = useCallback(
    async (initialStream?: MediaStream) => {
      if (!signaling) {
        setError('Signaling transport is not available');
        return;
      }
      try {
        setError(null);
        const mediaStream =
          initialStream ??
          (await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: { ideal: 640 }, height: { ideal: 360 } },
          }));
        setLocalStream(mediaStream);

        const meshRoom = new WebRtcMeshRoom({
          roomId,
          localPeerId,
          displayName,
          signaling,
          maxPeers,
          onPeersUpdated: (updatedPeers) => setPeers([...updatedPeers]),
          onError: (err) => setError(err.message),
        });

        roomRef.current = meshRoom;
        await meshRoom.join(mediaStream);
        setIsJoined(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to join WebRTC call');
      }
    },
    [displayName, localPeerId, maxPeers, roomId, signaling]
  );

  const leaveCall = useCallback(() => {
    roomRef.current?.leave();
    roomRef.current = null;
    setPeers([]);
    setLocalStream(null);
    setScreenStream(null);
    setIsJoined(false);
    setScreenSharing(false);
    setPushToTalkActive(false);
  }, []);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = room.toggleMicrophone();
    setAudioMuted(nextMuted);
  }, []);

  const toggleCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const nextVideoOff = room.toggleCamera();
    setVideoOff(nextVideoOff);
  }, []);

  const startScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const stream = await room.startScreenShare();
    if (stream) {
      setScreenStream(stream);
      setScreenSharing(true);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    room.stopScreenShare();
    setScreenStream(null);
    setScreenSharing(false);
  }, []);

  const setPushToTalkMode = useCallback((enabled: boolean) => {
    const room = roomRef.current;
    setPushToTalkEnabled(enabled);
    setPushToTalkActive(false);
    if (room) {
      room.enablePushToTalk(enabled);
      setAudioMuted(room.isAudioMuted());
    }
  }, []);

  const setPushToTalkPressed = useCallback((pressed: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    room.setPushToTalkActive(pressed);
    setPushToTalkActive(room.isPushToTalkPressed());
    setAudioMuted(room.isAudioMuted());
  }, []);

  const setCollaborativeTrafficHighCallback = useCallback(async (isHigh: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    const bitrate = await room.setCollaborativeTrafficHigh(isHigh);
    setAudioBitrateBps(bitrate);
  }, []);

  useEffect(() => {
    if (roomRef.current) {
      void setCollaborativeTrafficHighCallback(collaborativeTrafficHigh);
    }
  }, [collaborativeTrafficHigh, setCollaborativeTrafficHighCallback]);

  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  return {
    peers,
    localStream,
    screenStream,
    isJoined,
    audioMuted,
    videoOff,
    screenSharing,
    pushToTalkEnabled,
    pushToTalkActive,
    audioBitrateBps,
    error,
    joinCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    setPushToTalkMode,
    setPushToTalkPressed,
    setCollaborativeTrafficHigh: setCollaborativeTrafficHighCallback,
  };
}
