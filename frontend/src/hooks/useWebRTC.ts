import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  completeAuthenticatedKeyAgreement,
  createLocalStellarEd25519Signer,
  createSignedEphemeralKeySession,
  decryptDataChannelPayload,
  decryptMediaFrame,
  encryptDataChannelPayload,
  encryptMediaFrame,
  PeerIdentityMismatchError,
  type EphemeralKeyAgreementSession,
  type SignedEphemeralKeyBundle,
  type StellarEd25519Signer,
  type VerifiedPeerKeyAgreement,
} from '@/lib/p2p-crypto';

const parseIceServers = (servers: string | undefined) =>
  (servers ?? 'stun:stun.l.google.com:19302')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean)
    .map((url) => (url.startsWith('stun:') || url.startsWith('turn:') ? url : `stun:${url}`));

const createIceServers = () => {
  return parseIceServers(process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS).map((urls) => ({ urls }));
};

interface InsertableStreamSender extends RTCRtpSender {
  createEncodedStreams?: () => {
    readable: ReadableStream<{ data: ArrayBuffer }>;
    writable: WritableStream<{ data: ArrayBuffer }>;
  };
}

interface InsertableStreamReceiver extends RTCRtpReceiver {
  createEncodedStreams?: () => {
    readable: ReadableStream<{ data: ArrayBuffer }>;
    writable: WritableStream<{ data: ArrayBuffer }>;
  };
}

function attachSenderFrameEncryption(sender: RTCRtpSender, mediaFrameKey: CryptoKey): void {
  const insertable = sender as InsertableStreamSender;
  if (typeof insertable.createEncodedStreams !== 'function') return;

  try {
    const { readable, writable } = insertable.createEncodedStreams();
    const transformer = new TransformStream<{ data: ArrayBuffer }, { data: ArrayBuffer }>({
      async transform(frame, controller) {
        try {
          frame.data = await encryptMediaFrame(mediaFrameKey, frame.data);
          controller.enqueue(frame);
        } catch {
          // Drop frames that fail encryption rather than leaking plaintext.
        }
      },
    });
    readable.pipeThrough(transformer).pipeTo(writable).catch(() => null);
  } catch {
    // Browser may not have encodedInsertableStreams enabled on this RTCPeerConnection.
  }
}

function attachReceiverFrameDecryption(receiver: RTCRtpReceiver, mediaFrameKey: CryptoKey): void {
  const insertable = receiver as InsertableStreamReceiver;
  if (typeof insertable.createEncodedStreams !== 'function') return;

  try {
    const { readable, writable } = insertable.createEncodedStreams();
    const transformer = new TransformStream<{ data: ArrayBuffer }, { data: ArrayBuffer }>({
      async transform(frame, controller) {
        try {
          frame.data = await decryptMediaFrame(mediaFrameKey, frame.data);
          controller.enqueue(frame);
        } catch {
          // Drop tampered or unencrypted frames.
        }
      },
    });
    readable.pipeThrough(transformer).pipeTo(writable).catch(() => null);
  } catch {
    // Browser may not have encodedInsertableStreams enabled on this RTCPeerConnection.
  }
}

interface UseWebRTCProps {
  roomId?: string;
  socketUrl?: string;
  /** Stellar Ed25519 signer used to authenticate ephemeral ECDH public keys. */
  signer?: StellarEd25519Signer;
  /** Optional pinned Stellar G... public key of the expected peer (mentor/student). */
  expectedPeerPublicKey?: string;
  /** Callback invoked when an encrypted data channel message is decrypted. */
  onDataChannelMessage?: (message: string) => void;
}

interface UseWebRTCResult {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  isCallActive: boolean;
  isE2EEVerified: boolean;
  localPublicKey: string | null;
  peerPublicKey: string | null;
  verifiedAgreement: VerifiedPeerKeyAgreement | null;
  identityWarning: string | null;
  error: string | null;
  joinRoom: (roomId: string) => Promise<void>;
  startCall: () => Promise<void>;
  shareScreen: () => Promise<void>;
  endCall: () => void;
  muteAudio: (muted: boolean) => void;
  toggleVideo: (enabled: boolean) => void;
  sendEncryptedData: (message: string) => Promise<void>;
}

export const useWebRTC = ({
  roomId,
  socketUrl,
  signer,
  expectedPeerPublicKey,
  onDataChannelMessage,
}: UseWebRTCProps = {}): UseWebRTCResult => {
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const keySessionRef = useRef<EphemeralKeyAgreementSession | null>(null);
  const agreementRef = useRef<VerifiedPeerKeyAgreement | null>(null);
  const fallbackSignerRef = useRef<StellarEd25519Signer | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [verifiedAgreement, setVerifiedAgreement] = useState<VerifiedPeerKeyAgreement | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(roomId ?? null);

  const activeSigner = useMemo(() => {
    if (signer) return signer;
    if (!fallbackSignerRef.current) {
      fallbackSignerRef.current = createLocalStellarEd25519Signer();
    }
    return fallbackSignerRef.current;
  }, [signer]);

  const rtcConfig = useMemo(
    () =>
      ({
        iceServers: createIceServers(),
        encodedInsertableStreams: true,
      }) as RTCConfiguration,
    []
  );

  const ensureKeySession = useCallback(
    async (room: string): Promise<EphemeralKeyAgreementSession> => {
      if (
        keySessionRef.current &&
        keySessionRef.current.roomId === room &&
        keySessionRef.current.localStellarPublicKey === activeSigner.publicKey
      ) {
        return keySessionRef.current;
      }

      const session = await createSignedEphemeralKeySession(room, activeSigner);
      keySessionRef.current = session;
      return session;
    },
    [activeSigner]
  );

  const verifyPeerBundleOrReject = useCallback(
    async (
      peerBundle: SignedEphemeralKeyBundle | undefined,
      room: string
    ): Promise<VerifiedPeerKeyAgreement | null> => {
      if (!peerBundle) {
        const warning =
          'Unauthenticated peer rejected: missing Ed25519-signed ephemeral ECDH key bundle.';
        setIdentityWarning(warning);
        setError(warning);
        setVerifiedAgreement(null);
        agreementRef.current = null;
        return null;
      }

      try {
        const session = await ensureKeySession(room);
        const agreement = await completeAuthenticatedKeyAgreement(
          session,
          peerBundle,
          expectedPeerPublicKey?.trim() || undefined
        );
        agreementRef.current = agreement;
        setVerifiedAgreement(agreement);
        setIdentityWarning(null);
        setError(null);
        return agreement;
      } catch (err) {
        const warning =
          err instanceof PeerIdentityMismatchError
            ? `Identity mismatch warning (${err.code}): ${err.message}`
            : 'Unauthenticated peer rejected: cryptographic key verification failed.';
        setIdentityWarning(warning);
        setError(warning);
        setVerifiedAgreement(null);
        agreementRef.current = null;
        pcRef.current?.close();
        pcRef.current = null;
        setIsCallActive(false);
        return null;
      }
    },
    [ensureKeySession, expectedPeerPublicKey]
  );

  const wireDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.onmessage = async (event) => {
        const agreement = agreementRef.current;
        if (!agreement || typeof event.data !== 'string') return;
        try {
          const decrypted = await decryptDataChannelPayload(agreement.dataChannelKey, event.data);
          const text = new TextDecoder().decode(decrypted);
          onDataChannelMessage?.(text);
        } catch {
          setIdentityWarning(
            'Rejected tampered or unencrypted WebRTC data channel message from peer.'
          );
        }
      };
    },
    [onDataChannelMessage]
  );

  const createPeerConnection = async () => {
    if (!window || pcRef.current) {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ondatachannel = (event) => {
      wireDataChannel(event.channel);
    };

    pc.ontrack = (event) => {
      if (agreementRef.current && event.receiver) {
        attachReceiverFrameDecryption(event.receiver, agreementRef.current.mediaFrameKey);
      }
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
      const sender = pc.addTrack(track, stream);
      if (agreementRef.current) {
        attachSenderFrameEncryption(sender, agreementRef.current.mediaFrameKey);
      }
    });
  };

  const emitOffer = async (pc: RTCPeerConnection, targetClientId?: string) => {
    try {
      if (!currentRoom) {
        setError('Room must be joined before starting a call');
        return;
      }
      const session = await ensureKeySession(currentRoom);
      if (!dataChannelRef.current) {
        const channel = pc.createDataChannel('lab-e2ee-sync');
        wireDataChannel(channel);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc:offer', {
        room: currentRoom,
        targetClientId,
        sdp: offer.sdp,
        type: offer.type,
        keyBundle: session.localBundle,
      });
    } catch (err) {
      setError('Failed to create offer');
      console.error(err);
    }
  };

  const handleIncomingOffer = async (payload: any) => {
    try {
      const targetRoom = payload.room ?? currentRoom;
      if (!targetRoom) return;

      // Verify peer's Ed25519-signed ephemeral ECDH key BEFORE establishing WebRTC connection.
      const agreement = await verifyPeerBundleOrReject(payload.keyBundle, targetRoom);
      if (!agreement) {
        return;
      }

      const session = await ensureKeySession(targetRoom);
      const pc = (await createPeerConnection()) as RTCPeerConnection;
      await attachStreamToConnection(pc);
      await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('webrtc:answer', {
        room: targetRoom,
        targetClientId: payload.fromClientId,
        sdp: answer.sdp,
        type: answer.type,
        keyBundle: session.localBundle,
      });
    } catch (err) {
      setError('Failed to handle incoming offer');
      console.error(err);
    }
  };

  const handleIncomingAnswer = async (payload: any) => {
    try {
      const pc = pcRef.current;
      const targetRoom = payload.room ?? currentRoom;
      if (!pc || !targetRoom) return;

      // Verify peer's Ed25519-signed ephemeral ECDH key BEFORE completing WebRTC connection.
      const agreement = await verifyPeerBundleOrReject(payload.keyBundle, targetRoom);
      if (!agreement) {
        return;
      }

      pc.getSenders().forEach((sender) => {
        attachSenderFrameEncryption(sender, agreement.mediaFrameKey);
      });
      pc.getReceivers().forEach((receiver) => {
        attachReceiverFrameDecryption(receiver, agreement.mediaFrameKey);
      });

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
    setIdentityWarning(null);
    const session = await ensureKeySession(roomIdentifier);
    if (!socketRef.current) return;
    socketRef.current.emit('webrtc:join', roomIdentifier);
    socketRef.current.emit('webrtc:key-bundle', {
      room: roomIdentifier,
      keyBundle: session.localBundle,
    });
  };

  const startCall = async () => {
    if (typeof window === 'undefined') return;
    if (!currentRoom) {
      setError('Room must be joined before starting a call');
      return;
    }
    await ensureKeySession(currentRoom);
    const pc = (await createPeerConnection()) as RTCPeerConnection;
    await attachStreamToConnection(pc);
    await emitOffer(pc);
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const pc = (await createPeerConnection()) as RTCPeerConnection;
      screenStream.getVideoTracks().forEach((track) => {
        const sender = pc.addTrack(track, screenStream);
        if (agreementRef.current) {
          attachSenderFrameEncryption(sender, agreementRef.current.mediaFrameKey);
        }
      });
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

  const sendEncryptedData = useCallback(async (message: string) => {
    const channel = dataChannelRef.current;
    const agreement = agreementRef.current;
    if (!channel || channel.readyState !== 'open' || !agreement) {
      throw new Error('Encrypted WebRTC data channel is not ready.');
    }
    const encrypted = await encryptDataChannelPayload(agreement.dataChannelKey, message);
    channel.send(encrypted);
  }, []);

  const endCall = () => {
    setIsCallActive(false);
    setVerifiedAgreement(null);
    agreementRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
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

    socket.on('webrtc:key-bundle', async (payload: any) => {
      const targetRoom = payload?.room ?? currentRoom;
      if (!targetRoom) return;
      await verifyPeerBundleOrReject(payload?.keyBundle, targetRoom);
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
      socket.off('webrtc:key-bundle');
      socket.off('webrtc:participant_joined');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.disconnect();
    };
  }, [socketUrl, currentRoom, rtcConfig, verifyPeerBundleOrReject]);

  return {
    localStream,
    remoteStream,
    isConnected,
    isCallActive,
    isE2EEVerified: Boolean(verifiedAgreement),
    localPublicKey: activeSigner.publicKey,
    peerPublicKey: verifiedAgreement?.peerStellarPublicKey ?? null,
    verifiedAgreement,
    identityWarning,
    error,
    joinRoom,
    startCall,
    shareScreen,
    endCall,
    muteAudio,
    toggleVideo,
    sendEncryptedData,
  };
};
