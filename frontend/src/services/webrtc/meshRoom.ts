export interface SignalingTransport {
  send: (data: string) => void;
  addEventListener: (
    type: 'message' | 'open' | 'close' | 'error',
    listener: (event: { data?: string }) => void
  ) => void;
  removeEventListener: (
    type: 'message' | 'open' | 'close' | 'error',
    listener: (event: { data?: string }) => void
  ) => void;
  readyState?: number;
}

export type MeshSignalMessage =
  | { type: 'peer-join'; roomId: string; peerId: string; displayName?: string }
  | { type: 'peer-leave'; roomId: string; peerId: string }
  | {
      type: 'sdp-offer';
      roomId: string;
      fromPeerId: string;
      targetPeerId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'sdp-answer';
      roomId: string;
      fromPeerId: string;
      targetPeerId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'ice-candidate';
      roomId: string;
      fromPeerId: string;
      targetPeerId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'media-state';
      roomId: string;
      fromPeerId: string;
      audioMuted: boolean;
      videoOff: boolean;
      screenSharing: boolean;
    };

export interface MeshPeerState {
  peerId: string;
  displayName: string;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  connectionState: RTCPeerConnectionState;
}

export interface MeshRoomConfig {
  roomId: string;
  localPeerId: string;
  displayName?: string;
  signaling: SignalingTransport;
  maxPeers?: number;
  normalAudioBitrateBps?: number;
  throttledAudioBitrateBps?: number;
  rtcConfig?: RTCConfiguration;
  createPeerConnection?: (config?: RTCConfiguration) => RTCPeerConnection;
  onPeersUpdated?: (peers: MeshPeerState[]) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_MAX_PEERS = 4;
const DEFAULT_NORMAL_AUDIO_BITRATE_BPS = 48_000;
const DEFAULT_THROTTLED_AUDIO_BITRATE_BPS = 16_000;

export class WebRtcMeshRoom {
  private readonly roomId: string;
  private readonly localPeerId: string;
  private readonly displayName: string;
  private readonly signaling: SignalingTransport;
  private readonly maxPeers: number;
  private readonly normalAudioBitrateBps: number;
  private readonly throttledAudioBitrateBps: number;
  private readonly rtcConfig: RTCConfiguration;
  private readonly createPeerConnection: (config?: RTCConfiguration) => RTCPeerConnection;
  private readonly onPeersUpdated?: (peers: MeshPeerState[]) => void;
  private readonly onError?: (error: Error) => void;

  private peers = new Map<string, MeshPeerState>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private audioMuted = false;
  private videoOff = false;
  private screenSharing = false;
  private pushToTalkEnabled = false;
  private pushToTalkActive = false;
  private currentAudioBitrateBps: number;
  private isJoined = false;

  private readonly boundMessageHandler: (event: { data?: string }) => void;

  constructor(config: MeshRoomConfig) {
    this.roomId = config.roomId;
    this.localPeerId = config.localPeerId;
    this.displayName = config.displayName ?? config.localPeerId;
    this.signaling = config.signaling;
    this.maxPeers = Math.min(Math.max(config.maxPeers ?? DEFAULT_MAX_PEERS, 2), DEFAULT_MAX_PEERS);
    this.normalAudioBitrateBps = config.normalAudioBitrateBps ?? DEFAULT_NORMAL_AUDIO_BITRATE_BPS;
    this.throttledAudioBitrateBps =
      config.throttledAudioBitrateBps ?? DEFAULT_THROTTLED_AUDIO_BITRATE_BPS;
    this.currentAudioBitrateBps = this.normalAudioBitrateBps;
    this.rtcConfig = config.rtcConfig ?? {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };
    this.createPeerConnection =
      config.createPeerConnection ?? ((cfg) => new RTCPeerConnection(cfg));
    this.onPeersUpdated = config.onPeersUpdated;
    this.onError = config.onError;

    this.boundMessageHandler = (event) => {
      if (typeof event.data === 'string') {
        void this.handleSignalingPayload(event.data);
      }
    };
  }

  async join(initialStream?: MediaStream): Promise<void> {
    if (this.isJoined) return;
    if (initialStream) {
      this.localStream = initialStream;
    }
    this.signaling.addEventListener('message', this.boundMessageHandler);
    this.isJoined = true;
    this.sendSignal({
      type: 'peer-join',
      roomId: this.roomId,
      peerId: this.localPeerId,
      displayName: this.displayName,
    });
  }

  leave(): void {
    if (!this.isJoined) return;
    this.sendSignal({
      type: 'peer-leave',
      roomId: this.roomId,
      peerId: this.localPeerId,
    });
    this.signaling.removeEventListener('message', this.boundMessageHandler);
    for (const peer of this.peers.values()) {
      peer.connection.close();
    }
    this.peers.clear();
    this.stopScreenShare();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.isJoined = false;
    this.emitPeersUpdated();
  }

  getPeers(): MeshPeerState[] {
    return Array.from(this.peers.values());
  }

  getPeerCount(): number {
    // Total room capacity includes local peer + remote peers (up to maxPeers)
    return this.peers.size + (this.isJoined ? 1 : 0);
  }

  getCurrentAudioBitrateBps(): number {
    return this.currentAudioBitrateBps;
  }

  isAudioMuted(): boolean {
    return this.audioMuted;
  }

  isVideoOff(): boolean {
    return this.videoOff;
  }

  isScreenSharing(): boolean {
    return this.screenSharing;
  }

  isPushToTalkMode(): boolean {
    return this.pushToTalkEnabled;
  }

  isPushToTalkPressed(): boolean {
    return this.pushToTalkActive;
  }

  setMicrophoneMuted(muted: boolean): void {
    this.audioMuted = muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    this.broadcastMediaState();
  }

  toggleMicrophone(): boolean {
    this.setMicrophoneMuted(!this.audioMuted);
    return this.audioMuted;
  }

  enablePushToTalk(enabled: boolean): void {
    this.pushToTalkEnabled = enabled;
    this.pushToTalkActive = false;
    if (enabled) {
      this.setMicrophoneMuted(true);
    }
  }

  setPushToTalkActive(active: boolean): void {
    if (!this.pushToTalkEnabled) return;
    this.pushToTalkActive = active;
    this.setMicrophoneMuted(!active);
  }

  setCameraOff(off: boolean): void {
    this.videoOff = off;
    if (this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.enabled = !off;
      }
    }
    this.broadcastMediaState();
  }

  toggleCamera(): boolean {
    this.setCameraOff(!this.videoOff);
    return this.videoOff;
  }

  async startScreenShare(displayStream?: MediaStream): Promise<MediaStream | null> {
    try {
      const stream =
        displayStream ??
        (await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        }));
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        return null;
      }
      this.screenStream = stream;
      this.screenSharing = true;

      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      await this.replaceOutgoingVideoTrack(screenTrack);
      this.broadcastMediaState();
      return stream;
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error('Failed to start screen share'));
      return null;
    }
  }

  stopScreenShare(): void {
    if (!this.screenSharing && !this.screenStream) return;
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }
    this.screenSharing = false;
    const cameraTrack = this.localStream?.getVideoTracks()[0] ?? null;
    if (cameraTrack) {
      void this.replaceOutgoingVideoTrack(cameraTrack);
    }
    this.broadcastMediaState();
  }

  /**
   * Dynamically throttles outgoing audio bitrate across all mesh peer connections
   * when collaborative editor WebSocket traffic is high.
   */
  async setCollaborativeTrafficHigh(isHighTraffic: boolean): Promise<number> {
    const targetBitrate = isHighTraffic
      ? this.throttledAudioBitrateBps
      : this.normalAudioBitrateBps;
    this.currentAudioBitrateBps = targetBitrate;

    for (const peer of this.peers.values()) {
      const senders = peer.connection.getSenders?.() ?? [];
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'audio' && sender.getParameters && sender.setParameters) {
          const params = sender.getParameters() || { encodings: [{}] };
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = targetBitrate;
          await sender.setParameters(params);
        }
      }
    }

    return targetBitrate;
  }

  async handleSignalingPayload(rawPayload: string): Promise<void> {
    let message: MeshSignalMessage;
    try {
      message = JSON.parse(rawPayload) as MeshSignalMessage;
    } catch {
      return;
    }

    if (!message || message.roomId !== this.roomId) return;

    switch (message.type) {
      case 'peer-join': {
        if (message.peerId === this.localPeerId) return;
        await this.initiatePeerOffer(message.peerId, message.displayName);
        break;
      }
      case 'peer-leave': {
        this.removePeer(message.peerId);
        break;
      }
      case 'sdp-offer': {
        if (message.targetPeerId !== this.localPeerId) return;
        await this.handleOffer(message.fromPeerId, message.sdp);
        break;
      }
      case 'sdp-answer': {
        if (message.targetPeerId !== this.localPeerId) return;
        await this.handleAnswer(message.fromPeerId, message.sdp);
        break;
      }
      case 'ice-candidate': {
        if (message.targetPeerId !== this.localPeerId) return;
        await this.handleIceCandidate(message.fromPeerId, message.candidate);
        break;
      }
      case 'media-state': {
        if (message.fromPeerId === this.localPeerId) return;
        const peer = this.peers.get(message.fromPeerId);
        if (peer) {
          peer.audioMuted = message.audioMuted;
          peer.videoOff = message.videoOff;
          peer.screenSharing = message.screenSharing;
          this.emitPeersUpdated();
        }
        break;
      }
    }
  }

  private canAcceptPeer(peerId: string): boolean {
    if (this.peers.has(peerId)) return true;
    // Enforce 2-4 peer mesh limit (1 local + up to maxPeers-1 remote peers)
    return this.peers.size < this.maxPeers - 1;
  }

  private getOrCreatePeer(peerId: string, displayName?: string): MeshPeerState | null {
    const existing = this.peers.get(peerId);
    if (existing) {
      if (displayName) existing.displayName = displayName;
      return existing;
    }

    if (!this.canAcceptPeer(peerId)) {
      this.onError?.(
        new Error(`Mesh room capacity reached (maximum ${this.maxPeers} peers allowed)`)
      );
      return null;
    }

    const pc = this.createPeerConnection(this.rtcConfig);
    const peerState: MeshPeerState = {
      peerId,
      displayName: displayName ?? peerId,
      connection: pc,
      stream: null,
      audioMuted: false,
      videoOff: false,
      screenSharing: false,
      connectionState: pc.connectionState ?? 'new',
    };

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateInit =
          typeof event.candidate.toJSON === 'function'
            ? event.candidate.toJSON()
            : (event.candidate as RTCIceCandidateInit);
        this.sendSignal({
          type: 'ice-candidate',
          roomId: this.roomId,
          fromPeerId: this.localPeerId,
          targetPeerId: peerId,
          candidate: candidateInit,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        peerState.stream = remoteStream;
      } else if (event.track) {
        const fallbackStream = peerState.stream ?? new MediaStream();
        fallbackStream.addTrack(event.track);
        peerState.stream = fallbackStream;
      }
      this.emitPeersUpdated();
    };

    pc.onconnectionstatechange = () => {
      peerState.connectionState = pc.connectionState;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(peerId);
      } else {
        this.emitPeersUpdated();
      }
    };

    this.peers.set(peerId, peerState);
    this.emitPeersUpdated();
    return peerState;
  }

  private async initiatePeerOffer(remotePeerId: string, displayName?: string): Promise<void> {
    const peer = this.getOrCreatePeer(remotePeerId, displayName);
    if (!peer) return;

    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.sendSignal({
      type: 'sdp-offer',
      roomId: this.roomId,
      fromPeerId: this.localPeerId,
      targetPeerId: remotePeerId,
      sdp: offer,
    });
  }

  private async handleOffer(
    fromPeerId: string,
    sdp: RTCSessionDescriptionInit
  ): Promise<void> {
    const peer = this.getOrCreatePeer(fromPeerId);
    if (!peer) return;

    await peer.connection.setRemoteDescription(sdp);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    this.sendSignal({
      type: 'sdp-answer',
      roomId: this.roomId,
      fromPeerId: this.localPeerId,
      targetPeerId: fromPeerId,
      sdp: answer,
    });
  }

  private async handleAnswer(
    fromPeerId: string,
    sdp: RTCSessionDescriptionInit
  ): Promise<void> {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;
    await peer.connection.setRemoteDescription(sdp);
  }

  private async handleIceCandidate(
    fromPeerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;
    await peer.connection.addIceCandidate(candidate);
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.connection.close();
    this.peers.delete(peerId);
    this.emitPeersUpdated();
  }

  private async replaceOutgoingVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    for (const peer of this.peers.values()) {
      const senders = peer.connection.getSenders?.() ?? [];
      const videoSender = senders.find((sender) => sender.track?.kind === 'video');
      if (videoSender && videoSender.replaceTrack) {
        await videoSender.replaceTrack(newTrack);
      }
    }
  }

  private broadcastMediaState(): void {
    if (!this.isJoined) return;
    this.sendSignal({
      type: 'media-state',
      roomId: this.roomId,
      fromPeerId: this.localPeerId,
      audioMuted: this.audioMuted,
      videoOff: this.videoOff,
      screenSharing: this.screenSharing,
    });
  }

  private sendSignal(message: MeshSignalMessage): void {
    this.signaling.send(JSON.stringify(message));
  }

  private emitPeersUpdated(): void {
    this.onPeersUpdated?.(this.getPeers());
  }
}
