'use client';

import { useEffect, useState } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import type { VerifiedPeerKeyAgreement } from '@/lib/p2p-crypto';

interface CallRoomProps {
  onRoomChange?: (roomId: string) => void;
  onAgreementChange?: (agreement: VerifiedPeerKeyAgreement | null) => void;
  onIdentityWarningChange?: (warning: string | null) => void;
  onLocalPublicKeyChange?: (publicKey: string | null) => void;
}

function truncateStellarKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}

export default function CallRoom({
  onRoomChange,
  onAgreementChange,
  onIdentityWarningChange,
  onLocalPublicKeyChange,
}: CallRoomProps = {}) {
  const [roomId, setRoomId] = useState('study-lab-room');
  const [expectedPeerPublicKey, setExpectedPeerPublicKey] = useState('');
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const {
    localStream,
    remoteStream,
    isConnected,
    isCallActive,
    isE2EEVerified,
    localPublicKey,
    peerPublicKey,
    verifiedAgreement,
    identityWarning,
    error,
    joinRoom,
    startCall,
    shareScreen,
    endCall,
    muteAudio,
    toggleVideo,
  } = useWebRTC({
    roomId,
    expectedPeerPublicKey: expectedPeerPublicKey.trim() || undefined,
  });

  useEffect(() => {
    onRoomChange?.(roomId);
  }, [roomId, onRoomChange]);

  useEffect(() => {
    onAgreementChange?.(verifiedAgreement);
  }, [verifiedAgreement, onAgreementChange]);

  useEffect(() => {
    onIdentityWarningChange?.(identityWarning);
  }, [identityWarning, onIdentityWarningChange]);

  useEffect(() => {
    onLocalPublicKeyChange?.(localPublicKey);
  }, [localPublicKey, onLocalPublicKeyChange]);

  return (
    <section className="space-y-6 p-6 rounded-xl bg-slate-950/80 text-slate-100 shadow-lg">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-300">
            Call room
            <input
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-300">
            Expected peer Stellar Ed25519 key (optional pin)
            <input
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500"
              placeholder="G... (pin mentor/student wallet key)"
              value={expectedPeerPublicKey}
              onChange={(event) => setExpectedPeerPublicKey(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
          <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
          <span className="text-slate-600">·</span>
          <span>Call: {isCallActive ? 'Active' : 'Idle'}</span>
          <span className="text-slate-600">·</span>
          <span
            className={
              isE2EEVerified
                ? 'font-semibold text-emerald-400'
                : 'font-medium text-amber-400'
            }
          >
            {isE2EEVerified
              ? `E2EE Verified (Peer: ${peerPublicKey ? truncateStellarKey(peerPublicKey) : 'verified'})`
              : 'E2EE Handshake Pending (Ed25519 + ECDH)'}
          </span>
          {localPublicKey ? (
            <>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-400" title={localPublicKey}>
                Your Ed25519 Key: {truncateStellarKey(localPublicKey)}
              </span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded bg-cyan-500 px-4 py-2 text-slate-950 hover:bg-cyan-400"
            type="button"
            onClick={() => joinRoom(roomId)}
          >
            Join room
          </button>
          <button
            className="rounded bg-lime-500 px-4 py-2 text-slate-950 hover:bg-lime-400"
            type="button"
            onClick={startCall}
          >
            Start call
          </button>
          <button
            className="rounded bg-orange-500 px-4 py-2 text-slate-950 hover:bg-orange-400"
            type="button"
            onClick={shareScreen}
          >
            Share screen
          </button>
          <button
            className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-400"
            type="button"
            onClick={endCall}
          >
            End call
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-slate-100 hover:bg-slate-600"
            type="button"
            onClick={() => {
              setMuted((value) => {
                muteAudio(!value);
                return !value;
              });
            }}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-slate-100 hover:bg-slate-600"
            type="button"
            onClick={() => {
              setVideoEnabled((value) => {
                toggleVideo(!value);
                return !value;
              });
            }}
          >
            {videoEnabled ? 'Stop video' : 'Start video'}
          </button>
        </div>

        {identityWarning ? (
          <div
            role="alert"
            className="rounded border border-amber-500 bg-amber-500/10 p-3 text-sm text-amber-200"
          >
            <strong className="font-semibold">Identity Mismatch Warning:</strong> {identityWarning}
          </div>
        ) : null}

        {error && error !== identityWarning ? (
          <p className="rounded border border-rose-500 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Local preview</h2>
          {localStream ? (
            <video
              className="h-80 w-full rounded-xl bg-black object-cover"
              ref={(video) => {
                if (video && localStream) {
                  video.srcObject = localStream;
                  video.play().catch(() => null);
                }
              }}
              muted
              playsInline
              autoPlay
            />
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
              Local video disabled
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Remote preview</h2>
          {remoteStream ? (
            <video
              className="h-80 w-full rounded-xl bg-black object-cover"
              ref={(video) => {
                if (video && remoteStream) {
                  video.srcObject = remoteStream;
                  video.play().catch(() => null);
                }
              }}
              playsInline
              autoPlay
            />
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
              Remote peer not available yet
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
