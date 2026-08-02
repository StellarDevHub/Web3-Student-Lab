'use client';

import {
  EncryptedP2PMessage,
  P2PPublicIdentity,
  decryptP2PMessage,
  encryptP2PMessage,
  fingerprintP2PIdentity,
  getOrCreateP2PIdentity,
  verifyP2PIdentity,
} from '@/lib/p2p-crypto';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { Copy, KeyRound, Lock, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface RoomPayload {
  id: string;
  senderKeyId: string;
  recipientKeyId: string;
  payload: EncryptedP2PMessage;
}

interface DecryptedRoomMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  plaintext: string;
  createdAt: number;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

function shortKey(keyId: string): string {
  return `${keyId.slice(0, 10)}...${keyId.slice(-8)}`;
}

function roomChannelName(roomId: string): string {
  return `p2p-chat:${roomId}`;
}

export function EncryptedRoomChat({ roomId }: { roomId: string }) {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const messagesRef = useRef<Y.Array<RoomPayload> | null>(null);
  const identitiesRef = useRef<Y.Map<P2PPublicIdentity> | null>(null);
  const localIdentityRef = useRef<P2PPublicIdentity | null>(null);

  const [localIdentity, setLocalIdentity] = useState<P2PPublicIdentity | null>(null);
  const [peers, setPeers] = useState<P2PPublicIdentity[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [messages, setMessages] = useState<DecryptedRoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(WS_URL, roomChannelName(roomId), doc);
    const identities = doc.getMap<P2PPublicIdentity>('publicIdentities');
    const encryptedMessages = doc.getArray<RoomPayload>('encryptedMessages');

    docRef.current = doc;
    providerRef.current = provider;
    identitiesRef.current = identities;
    messagesRef.current = encryptedMessages;

    const publishIdentity = async () => {
      const identity = await getOrCreateP2PIdentity();
      if (!mounted) return;
      localIdentityRef.current = identity;
      setLocalIdentity(identity);
      identities.set(identity.keyId, identity);
    };

    const syncPeers = async () => {
      const ownKeyId = localIdentityRef.current?.keyId;
      const validPeers: P2PPublicIdentity[] = [];

      for (const identity of Array.from(identities.values())) {
        if (identity.keyId === ownKeyId) continue;
        if (await verifyP2PIdentity(identity)) {
          validPeers.push(identity);
        }
      }

      if (!mounted) return;
      setPeers(validPeers);
      setSelectedPeerId((current) => current || validPeers[0]?.keyId || '');
    };

    const syncMessages = async () => {
      const ownIdentity = localIdentityRef.current;
      if (!ownIdentity) return;

      const identityById = new Map(Array.from(identities.values()).map((identity) => [identity.keyId, identity]));
      const decrypted: DecryptedRoomMessage[] = [];

      for (const item of encryptedMessages.toArray()) {
        const isInbound = item.recipientKeyId === ownIdentity.keyId;
        const isOutbound = item.senderKeyId === ownIdentity.keyId;
        if (!isInbound && !isOutbound) continue;

        const peerIdentity = identityById.get(isInbound ? item.senderKeyId : item.recipientKeyId);
        if (!peerIdentity) continue;

        try {
          decrypted.push({
            id: item.id,
            direction: isInbound ? 'inbound' : 'outbound',
            plaintext: await decryptP2PMessage(peerIdentity, item.payload),
            createdAt: item.payload.createdAt,
          });
        } catch {
          // Keep corrupted or mismatched payloads out of the visible transcript.
        }
      }

      if (mounted) {
        setMessages(decrypted.sort((left, right) => left.createdAt - right.createdAt));
      }
    };

    const syncAll = () => {
      syncPeers().then(syncMessages).catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to sync encrypted chat.');
      });
    };

    provider.on('status', ({ status: nextStatus }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(nextStatus);
    });
    identities.observe(syncAll);
    encryptedMessages.observe(syncAll);
    publishIdentity().then(syncAll).catch((err) => {
      if (mounted) setError(err instanceof Error ? err.message : 'Failed to initialize encrypted chat.');
    });

    return () => {
      mounted = false;
      identities.unobserve(syncAll);
      encryptedMessages.unobserve(syncAll);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId]);

  const selectedPeer = useMemo(
    () => peers.find((peer) => peer.keyId === selectedPeerId),
    [peers, selectedPeerId]
  );

  async function sendMessage() {
    if (!selectedPeer || !draft.trim() || !messagesRef.current || !localIdentity) return;

    setError(null);
    try {
      const encrypted = await encryptP2PMessage(selectedPeer, draft);
      messagesRef.current.push([
        {
          id: crypto.randomUUID(),
          senderKeyId: localIdentity.keyId,
          recipientKeyId: selectedPeer.keyId,
          payload: encrypted,
        },
      ]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encrypt message.');
    }
  }

  async function copyIdentity() {
    if (!localIdentity) return;
    await navigator.clipboard.writeText(JSON.stringify(localIdentity));
  }

  async function copyFingerprint() {
    if (!localIdentity) return;
    await navigator.clipboard.writeText(await fingerprintP2PIdentity(localIdentity));
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 lg:w-[380px]">
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Encrypted Chat
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {status === 'connected' ? 'Relay connected' : status}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={copyFingerprint}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Copy fingerprint"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={copyIdentity}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Copy public identity"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-gray-50 p-3 dark:bg-gray-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <Lock className="h-3.5 w-3.5" />
            Local key
          </div>
          <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">
            {localIdentity ? shortKey(localIdentity.keyId) : 'Initializing...'}
          </p>
        </div>
      </div>

      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Peer
          <select
            value={selectedPeerId}
            onChange={(event) => setSelectedPeerId(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
          >
            <option value="">No verified peer online</option>
            {peers.map((peer) => (
              <option key={peer.keyId} value={peer.keyId}>
                {shortKey(peer.keyId)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
            Encrypted messages for this peer will appear here.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.direction === 'outbound'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.plaintext}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          disabled={!selectedPeer}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
          placeholder={selectedPeer ? 'Encrypted message...' : 'Waiting for a peer'}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!selectedPeer || !draft.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          title="Encrypt and send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
