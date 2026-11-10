import { describe, expect, it, vi } from 'vitest';
import {
  MeshSignalMessage,
  SignalingTransport,
  WebRtcMeshRoom,
} from '@/services/webrtc/meshRoom';

class MockSignalingBus {
  private listeners = new Set<(event: { data?: string }) => void>();
  public sentMessages: MeshSignalMessage[] = [];

  createTransport(): SignalingTransport {
    return {
      send: (data: string) => {
        this.sentMessages.push(JSON.parse(data) as MeshSignalMessage);
        for (const listener of this.listeners) {
          listener({ data });
        }
      },
      addEventListener: (_type, listener) => {
        this.listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        this.listeners.delete(listener);
      },
    };
  }
}

function createFakeMediaStream() {
  const audioTrack = {
    kind: 'audio',
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;

  const videoTrack = {
    kind: 'video',
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [audioTrack, videoTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
  } as unknown as MediaStream;
}

function createMockPeerConnection() {
  const audioSenderParams = { encodings: [{ maxBitrate: 48_000 }] };
  const audioSender = {
    track: { kind: 'audio' } as MediaStreamTrack,
    getParameters: vi.fn(() => audioSenderParams),
    setParameters: vi.fn(async (params) => {
      audioSenderParams.encodings = params.encodings;
    }),
    replaceTrack: vi.fn(async () => undefined),
  };
  const videoSender = {
    track: { kind: 'video' } as MediaStreamTrack,
    getParameters: vi.fn(() => ({ encodings: [{}] })),
    setParameters: vi.fn(async () => undefined),
    replaceTrack: vi.fn(async (newTrack: MediaStreamTrack) => {
      videoSender.track = newTrack;
    }),
  };

  const pc = {
    connectionState: 'connected' as RTCPeerConnectionState,
    onicecandidate: null as ((ev: { candidate: RTCIceCandidateInit | null }) => void) | null,
    ontrack: null as ((ev: { streams: MediaStream[]; track?: MediaStreamTrack }) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    addTrack: vi.fn(),
    getSenders: vi.fn(() => [audioSender, videoSender]),
    createOffer: vi.fn(async () => ({ type: 'offer' as RTCSdpType, sdp: 'mock-offer-sdp' })),
    createAnswer: vi.fn(async () => ({ type: 'answer' as RTCSdpType, sdp: 'mock-answer-sdp' })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    addIceCandidate: vi.fn(async () => undefined),
    close: vi.fn(),
    _audioSender: audioSender,
    _videoSender: videoSender,
  };

  return pc;
}

describe('WebRtcMeshRoom', () => {
  it('establishes a 2-4 peer mesh session and enforces the 4-peer ceiling', async () => {
    const bus = new MockSignalingBus();
    const errors: string[] = [];

    const roomA = new WebRtcMeshRoom({
      roomId: 'lab-room-1',
      localPeerId: 'peer-1',
      signaling: bus.createTransport(),
      maxPeers: 4,
      createPeerConnection: () => createMockPeerConnection() as unknown as RTCPeerConnection,
      onError: (err) => errors.push(err.message),
    });

    await roomA.join(createFakeMediaStream());

    // Simulate 3 remote peers joining (total 4 peers in room)
    await roomA.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-1', peerId: 'peer-2' })
    );
    await roomA.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-1', peerId: 'peer-3' })
    );
    await roomA.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-1', peerId: 'peer-4' })
    );

    expect(roomA.getPeerCount()).toBe(4);
    expect(roomA.getPeers().map((p) => p.peerId)).toEqual(['peer-2', 'peer-3', 'peer-4']);

    // 5th peer should be rejected
    await roomA.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-1', peerId: 'peer-5' })
    );
    expect(roomA.getPeerCount()).toBe(4);
    expect(errors).toContain('Mesh room capacity reached (maximum 4 peers allowed)');

    roomA.leave();
  });

  it('supports microphone mute, push-to-talk (PTT), camera toggle, and screen share track replacement', async () => {
    const bus = new MockSignalingBus();
    const mockPc = createMockPeerConnection();

    const room = new WebRtcMeshRoom({
      roomId: 'lab-room-ptt',
      localPeerId: 'mentor-1',
      signaling: bus.createTransport(),
      createPeerConnection: () => mockPc as unknown as RTCPeerConnection,
    });

    const stream = createFakeMediaStream();
    await room.join(stream);
    await room.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-ptt', peerId: 'student-1' })
    );

    // Microphone mute toggle
    expect(room.toggleMicrophone()).toBe(true);
    expect(stream.getAudioTracks()[0].enabled).toBe(false);

    // Push-to-talk mode mutes mic until held
    room.enablePushToTalk(true);
    expect(room.isAudioMuted()).toBe(true);
    room.setPushToTalkActive(true);
    expect(room.isAudioMuted()).toBe(false);
    room.setPushToTalkActive(false);
    expect(room.isAudioMuted()).toBe(true);

    // Camera toggle
    expect(room.toggleCamera()).toBe(true);
    expect(stream.getVideoTracks()[0].enabled).toBe(false);

    // Screen share replaces outgoing video track and restores camera on stop
    const screenVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
      onended: null,
    } as unknown as MediaStreamTrack;
    const displayStream = {
      getTracks: () => [screenVideoTrack],
      getVideoTracks: () => [screenVideoTrack],
    } as unknown as MediaStream;

    await room.startScreenShare(displayStream);
    expect(room.isScreenSharing()).toBe(true);
    expect(mockPc._videoSender.replaceTrack).toHaveBeenCalledWith(screenVideoTrack);

    room.stopScreenShare();
    expect(room.isScreenSharing()).toBe(false);
    expect(mockPc._videoSender.replaceTrack).toHaveBeenCalledWith(stream.getVideoTracks()[0]);
  });

  it('dynamically throttles outgoing audio bitrate when collaborative editor WebSocket traffic is high', async () => {
    const bus = new MockSignalingBus();
    const mockPc = createMockPeerConnection();

    const room = new WebRtcMeshRoom({
      roomId: 'lab-room-bw',
      localPeerId: 'peer-a',
      signaling: bus.createTransport(),
      normalAudioBitrateBps: 48_000,
      throttledAudioBitrateBps: 16_000,
      createPeerConnection: () => mockPc as unknown as RTCPeerConnection,
    });

    await room.join(createFakeMediaStream());
    await room.handleSignalingPayload(
      JSON.stringify({ type: 'peer-join', roomId: 'lab-room-bw', peerId: 'peer-b' })
    );

    const throttled = await room.setCollaborativeTrafficHigh(true);
    expect(throttled).toBe(16_000);
    expect(mockPc._audioSender.setParameters).toHaveBeenCalledWith({
      encodings: [{ maxBitrate: 16_000 }],
    });

    const restored = await room.setCollaborativeTrafficHigh(false);
    expect(restored).toBe(48_000);
    expect(mockPc._audioSender.setParameters).toHaveBeenCalledWith({
      encodings: [{ maxBitrate: 48_000 }],
    });
  });
});
