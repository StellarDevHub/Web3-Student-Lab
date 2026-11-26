'use client';

import { useState } from 'react';
import CallRoom from '@/components/webrtc/CallRoom';
import { CollaborativeCodingLab } from '@/components/collaboration/CollaborativeCodingLab';
import { ExperimentalBanner } from '@/components/ui/ExperimentalBanner';
import type { VerifiedPeerKeyAgreement } from '@/lib/p2p-crypto';

export default function WebRTCPage() {
  const [roomId, setRoomId] = useState('study-lab-room');
  const [localPublicKey, setLocalPublicKey] = useState<string | null>(null);
  const [verifiedAgreement, setVerifiedAgreement] = useState<VerifiedPeerKeyAgreement | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold">WebRTC Lab Room</h1>
          <p className="max-w-2xl text-slate-300">
            Connect directly from the lab environment using Ed25519-authenticated, end-to-end
            encrypted peer-to-peer audio/video, screen sharing, and collaborative coding.
          </p>
        </header>

        <ExperimentalBanner
          featureName="WebRTC Lab"
          description="Peer-to-peer lab connectivity via WebRTC is protected by ephemeral ECDH key agreement signed with Stellar Ed25519 keys. Chrome and Edge are recommended. Audio/video permissions are required."
        />

        <CallRoom
          onRoomChange={setRoomId}
          onAgreementChange={setVerifiedAgreement}
          onIdentityWarningChange={setIdentityWarning}
          onLocalPublicKeyChange={setLocalPublicKey}
        />

        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-100">
              Encrypted Collaborative Coding Channel
            </h2>
            <p className="text-sm text-slate-400">
              Editor synchronization opens only after both peers verify each other&apos;s Stellar
              Ed25519-signed ephemeral ECDH keys.
            </p>
          </div>
          <CollaborativeCodingLab
            roomId={roomId}
            userId={localPublicKey ?? 'local-peer'}
            userName={localPublicKey ? `${localPublicKey.slice(0, 6)}...` : 'Local Peer'}
            encryptionKey={verifiedAgreement?.editorSyncSecret}
            peerStellarPublicKey={verifiedAgreement?.peerStellarPublicKey ?? null}
            identityWarning={identityWarning}
            requireVerifiedPeer
          />
        </section>
      </div>
    </main>
  );
}
