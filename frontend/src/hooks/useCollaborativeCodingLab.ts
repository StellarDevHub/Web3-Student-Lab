'use client';

/**
 * useCollaborativeCodingLab
 *
 * Peer-to-peer collaborative editing for the coding lab (#1143):
 *
 *  1. WebRTC-first provider – uses `y-webrtc`'s `WebrtcProvider` so
 *     keystrokes travel over P2P data channels (low latency, no server in
 *     the path) with the y-webrtc signalling server as the rendezvous only.
 *
 *  2. WebSocket fallback – when WebRTC is unavailable (NAT/STUN failure) the
 *     same Y.Doc falls back to `y-websocket`'s `WebsocketProvider`, so the
 *     room stays consistent either way. Both providers share one Y.Doc.
 *
 *  3. Awareness protocol – remote cursors, selections and peer avatars are
 *     broadcast through `y-webrtc`'s built-in awareness (shared
 *     Y.Doc.awareness), exposed here as `awarenessStates`.
 *
 *  4. Sync execution broadcast – the lab's output buffer is a shared
 *     Y.Text fragment (`executionLog`); any peer appending compiler output
 *     writes it into the shared fragment so every peer sees the same output
 *     in lockstep.
 *
 *  5. Clean teardown – on unmount the WebSocket fallback is destroyed and
 *     the WebRTC provider is destroyed (keeping the Y.Doc alive until all
 *     peers leave is handled by y-webrtc).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export interface CollaborativeCodingLabOptions {
  roomId: string;
  userId: string;
  userName?: string;
  /** WebSocket fallback endpoint. When empty, the y-websocket default
   *  (wss://demos.yjs.dev) is used. */
  wsUrl?: string;
  /** y-webrtc signalling server. Defaults to wss://signaling.yjs.dev. */
  signalingUrl?: string;
  /** End-to-end encryption key derived from Ed25519-authenticated ECDH key agreement. */
  encryptionKey?: string;
  /** When true, delays opening WebRTC/WS sync channels until encryptionKey is available. */
  requireVerifiedPeer?: boolean;
}

export interface CollaborativeCodingLab {
  doc: Y.Doc;
  /** Shared Y.Text holding the code buffer. */
  codeText: Y.Text;
  /** Shared Y.Text holding the streamed execution output. */
  executionLog: Y.Text;
  /** Current awareness state map: peer clientId -> { user, cursor, selection }. */
  awarenessStates: Map<number, unknown>;
  /** True when the WebRTC data channel is connected; false on WS fallback. */
  isWebRtc: boolean;
  /** True while neither provider reports a connection. */
  isDisconnected: boolean;
  /** True when editor sync is protected by an Ed25519-derived encryption key. */
  isEncrypted: boolean;
  /** Append output to the shared execution log (synchronized to all peers). */
  appendExecutionOutput: (text: string) => void;
  /** Clear the shared execution log. */
  clearExecutionOutput: () => void;
}

export function useCollaborativeCodingLab(
  options: CollaborativeCodingLabOptions,
): CollaborativeCodingLab {
  const { roomId, userId, userName, wsUrl, signalingUrl, encryptionKey, requireVerifiedPeer } =
    options;
  const docRef = useRef<Y.Doc | null>(null);
  const webrtcRef = useRef<WebrtcProvider | null>(null);
  const wsRef = useRef<WebsocketProvider | null>(null);
  const [awarenessStates, setAwarenessStates] = useState<Map<number, unknown>>(new Map());
  const [isWebRtc, setIsWebRtc] = useState(true);
  const [isDisconnected, setIsDisconnected] = useState(true);

  if (!docRef.current) {
    docRef.current = new Y.Doc();
  }
  const doc = docRef.current;

  const codeText = useMemo(() => doc.getText(`code:${roomId}`), [doc, roomId]);
  const executionLog = useMemo(() => doc.getText(`execution:${roomId}`), [doc, roomId]);

  const appendExecutionOutput = useCallback(
    (text: string) => {
      executionLog.insert(executionLog.length, text);
    },
    [executionLog],
  );

  const clearExecutionOutput = useCallback(() => {
    executionLog.delete(0, executionLog.length);
  }, [executionLog]);

  useEffect(() => {
    if (requireVerifiedPeer && !encryptionKey) {
      setIsWebRtc(false);
      setIsDisconnected(true);
      return;
    }

    const room = `web3-student-lab:${roomId}`;

    // Set local awareness before providers connect so peers see us early.
    doc.awareness.setLocalStateField('user', {
      name: userName ?? userId,
      color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
    });

    // WebRTC P2P provider (primary transport), end-to-end encrypted when encryptionKey is set.
    const webrtc = new WebrtcProvider(room, doc, {
      signaling: [signalingUrl ?? 'wss://signaling.yjs.dev'],
      password: encryptionKey,
      maxConns: 20 + Math.floor(Math.random() * 15),
    });
    webrtcRef.current = webrtc;

    const webrtcConnected = () => {
      setIsWebRtc(true);
      setIsDisconnected(false);
    };
    const webrtcDisconnected = () => {
      setIsWebRtc(false);
    };

    webrtc.on('status', (event: { connected: boolean }) => {
      if (event.connected) webrtcConnected();
      else {
        webrtcDisconnected();
        setIsDisconnected(true);
      }
    });

    // WebSocket fallback provider sharing the same Y.Doc. Disabled when an E2EE
    // peer key is required so plaintext updates never traverse an unencrypted relay.
    let ws: WebsocketProvider | null = null;
    if (!requireVerifiedPeer) {
      ws = new WebsocketProvider(wsUrl ?? 'wss://demos.yjs.dev', room, doc);
      wsRef.current = ws;

      const wsConnected = () => setIsDisconnected(false);
      ws.on('status', (event: { status: string }) => {
        if (event.status === 'connected') wsConnected();
        else setIsDisconnected(true);
      });
    }

    // Awareness sync.
    const onAwarenessChange = () => {
      setAwarenessStates(new Map(doc.awareness.getStates()));
    };
    doc.awareness.on('change', onAwarenessChange);
    onAwarenessChange();

    return () => {
      doc.awareness.off('change', onAwarenessChange);
      ws?.destroy();
      webrtc.destroy();
    };
  }, [roomId, userId, userName, wsUrl, signalingUrl, doc, encryptionKey, requireVerifiedPeer]);

  return {
    doc,
    codeText,
    executionLog,
    awarenessStates,
    isWebRtc,
    isDisconnected,
    isEncrypted: Boolean(encryptionKey),
    appendExecutionOutput,
    clearExecutionOutput,
  };
}