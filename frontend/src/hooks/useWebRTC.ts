import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const parseIceServers = (servers: string | undefined) =>
  (servers ?? 'stun:stun.l.google.com:19302')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean)
    .map((url) => (url.startsWith('stun:') || url.startsWith('turn:') ? url : `stun:${url}`));

const createIceServers = () => {
  return parseIceServers(process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS).map((urls) => ({ urls }));
};

interface UseWebRTCProps {
  roomId?: string;
  socketUrl?: string;
}

interface UseWebRTCResult {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  isCallActive: boolean;
  error: string | null;
  joinRoom: (roomId: string) => Promise<void>;
  startCall: () => Promise<void>;
  shareScreen: () => Promise<void>;
  endCall: () => void;
  muteAudio: (muted: boolean) => void;
  toggleVideo: (enabled: boolean) => void;
}

export const useWebRTC = ({ roomId, socketUrl }: UseWebRTCProps = {}): UseWebRTCResult => {
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(roomId ?? null);

  const rtcConfig = useMemo(
    () => ({ iceServers: createIceServers() }),
    []
  );

  const createPeerConnection = async () => {
    if (!window || pcRef.current) {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams?.[0] && remote.addTrack(event.streams[0].getTracks()[0]);
      if (event.streams?.[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) return;
      const payload = {
        room: currentRoom,
        candidate: event.candidate,
      };
      socketRef.current.emit('webrtc:ice-candidate', payload);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsCallActive(true);
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setIsCallActive(false);
      }
    };

    return pc;
  };

  const startLocalMedia = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const constraints: MediaStreamConstraints = {
      audio: true,
      video: true,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const attachStreamToConnection = async (pc: RTCPeerConnection) => {
    const stream = await startLocalMedia();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  };

  const emitOffer = async (pc: RTCPeerConnection, targetClientId?: string) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc:offer', {
        room: currentRoom,
        targetClientId,
        sdp: offer.sdp,
        type: offer.type,
      });
    } catch (err) {
      setError('Failed to create offer');
      console.error(err);
    }
  };

  const handleIncomingOffer = async (payload: any) => {
    try {
      const pc = (await createPeerConnection()) as RTCPeerConnection;
      await attachStreamToConnection(pc);
      await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('webrtc:answer', {
        targetClientId: payload.fromClientId,
        sdp: answer.sdp,
        type: answer.type,
      });
    } catch (err) {
      setError('Failed to handle incoming offer');
      console.error(err);
    }
  };

  const handleIncomingAnswer = async (payload: any) => {
    try {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      setIsCallActive(true);
    } catch (err) {
      setError('Failed to process remote answer');
      console.error(err);
    }
  };

  const handleIncomingIceCandidate = async (payload: any) => {
    try {
      const pc = pcRef.current;
      if (!pc || !payload?.candidate) return;
      await pc.addIceCandidate(payload.candidate);
    } catch (err) {
      console.error('Failed to add remote ICE candidate', err);
    }
  };

  const joinRoom = async (roomIdentifier: string) => {
    if (typeof window === 'undefined') return;
    setCurrentRoom(roomIdentifier);
    if (!socketRef.current) return;
    socketRef.current.emit('webrtc:join', roomIdentifier);
  };

  const startCall = async () => {
    if (typeof window === 'undefined') return;
    const pc = (await createPeerConnection()) as RTCPeerConnection;
    await attachStreamToConnection(pc);
    if (!currentRoom) {
      setError('Room must be joined before starting a call');
      return;
    }
    await emitOffer(pc);
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const pc = (await createPeerConnection()) as RTCPeerConnection;
      screenStream.getVideoTracks().forEach((track) => pc.addTrack(track, screenStream));
      setLocalStream((prev) => {
        if (!prev) return screenStream;
        screenStream.getTracks().forEach((track) => prev.addTrack(track));
        return prev;
      });
      if (pc.connectionState !== 'connected') {
        await emitOffer(pc);
      }
    } catch (err) {
      setError('Screen share request failed');
      console.error(err);
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  };

  const muteAudio = (muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  };

  const toggleVideo = (enabled: boolean) => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socketUrlResolved = socketUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    socketRef.current = io(socketUrlResolved, {
      transports: ['websocket', 'polling'],
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsCallActive(false);
    });

    socket.on('connect_error', (connectError) => {
      setError(connectError.message);
    });

    socket.on('webrtc:participant_joined', async (payload: any) => {
      if (!payload?.clientId || payload.clientId === socket.id) return;
      const pc = (await createPeerConnection()) as RTCPeerConnection;
      await attachStreamToConnection(pc);
      await emitOffer(pc, payload.clientId);
    });

    socket.on('webrtc:offer', handleIncomingOffer);
    socket.on('webrtc:answer', handleIncomingAnswer);
    socket.on('webrtc:ice-candidate', handleIncomingIceCandidate);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('webrtc:participant_joined');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.disconnect();
    };
  }, [socketUrl, currentRoom, rtcConfig]);

  return {
    localStream,
    remoteStream,
    isConnected,
    isCallActive,
    error,
    joinRoom,
    startCall,
    shareScreen,
    endCall,
    muteAudio,
    toggleVideo,
  };
};
