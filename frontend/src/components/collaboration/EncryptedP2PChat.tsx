'use client';

import {
  EncryptedP2PMessage,
  P2PPublicIdentity,
  decryptP2PMessage,
  encryptP2PMessage,
  estimateEncryptedPayloadSize,
  getOrCreateP2PIdentity,
} from '@/lib/p2p-crypto';
import { Copy, KeyRound, Lock, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface LocalChatMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  plaintext: string;
  encrypted: EncryptedP2PMessage;
}

interface EncryptedP2PChatProps {
  peerIdentity?: P2PPublicIdentity;
  onSendEncrypted?: (payload: EncryptedP2PMessage) => void | Promise<void>;
  inboundPayloads?: EncryptedP2PMessage[];
}

function formatIdentity(identity?: P2PPublicIdentity): string {
  if (!identity) return 'Unavailable';
  return `${identity.keyId.slice(0, 12)}...${identity.keyId.slice(-8)}`;
}

export function EncryptedP2PChat({
  peerIdentity,
  onSendEncrypted,
  inboundPayloads = [],
}: EncryptedP2PChatProps) {
  const [localIdentity, setLocalIdentity] = useState<P2PPublicIdentity | null>(null);
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let mounted = true;

    getOrCreateP2PIdentity()
      .then((identity) => {
        if (mounted) setLocalIdentity(identity);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load P2P identity.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!peerIdentity || inboundPayloads.length === 0) return;

    let mounted = true;

    Promise.all(
      inboundPayloads.map(async (payload) => ({
        id: `${payload.keyId}:${payload.createdAt}`,
        direction: 'inbound' as const,
        plaintext: await decryptP2PMessage(peerIdentity, payload),
        encrypted: payload,
      }))
    )
      .then((decrypted) => {
        if (!mounted) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((message) => message.id));
          return [...prev, ...decrypted.filter((message) => !seen.has(message.id))];
        });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to decrypt message.');
      });

    return () => {
      mounted = false;
    };
  }, [peerIdentity, inboundPayloads]);

  const totalEncryptedBytes = useMemo(
    () => messages.reduce((total, message) => total + estimateEncryptedPayloadSize(message.encrypted), 0),
    [messages]
  );

  async function sendMessage() {
    if (!peerIdentity || !draft.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const encrypted = await encryptP2PMessage(peerIdentity, draft);
      await onSendEncrypted?.(encrypted);

      setMessages((prev) => [
        ...prev,
        {
          id: `${encrypted.keyId}:${encrypted.createdAt}`,
          direction: 'outbound',
          plaintext: draft,
          encrypted,
        },
      ]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encrypt message.');
    } finally {
      setIsSending(false);
    }
  }

  async function copyLocalIdentity() {
    if (!localIdentity) return;
    await navigator.clipboard.writeText(JSON.stringify(localIdentity));
  }

  return (
    <section className="rounded-lg border border-white/10 bg-zinc-950 text-white">
      <header className="flex flex-col gap-4 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black tracking-widest text-red-400">
            <ShieldCheck className="h-4 w-4" />
            E2EE P2P CHAT
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Messages are encrypted in the browser with a non-extractable key before transport.
          </p>
        </div>
        <button
          type="button"
          onClick={copyLocalIdentity}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          disabled={!localIdentity}
        >
          <Copy className="h-4 w-4" />
          Copy public key
        </button>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-500">
            <KeyRound className="h-4 w-4" />
            LOCAL IDENTITY
          </div>
          <div className="break-all font-mono text-xs text-zinc-200">{formatIdentity(localIdentity ?? undefined)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-500">
            <KeyRound className="h-4 w-4" />
            PEER IDENTITY
          </div>
          <div className="break-all font-mono text-xs text-zinc-200">{formatIdentity(peerIdentity)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-500">
            <Lock className="h-4 w-4" />
            ENCRYPTED TRAFFIC
          </div>
          <div className="font-mono text-xs text-zinc-200">{totalEncryptedBytes.toLocaleString()} bytes</div>
        </div>
      </div>

      {error && (
        <div className="mx-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="h-80 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            No encrypted messages in this conversation.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-lg border p-3 ${
                  message.direction === 'outbound'
                    ? 'border-red-500/30 bg-red-950/30'
                    : 'border-white/10 bg-zinc-900'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm text-zinc-100">{message.plaintext}</p>
                <p className="mt-2 truncate font-mono text-[11px] text-zinc-500">
                  {message.encrypted.ciphertext}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-3 border-t border-white/10 p-4">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          placeholder={peerIdentity ? 'Write encrypted message...' : 'Connect a peer identity first'}
          disabled={!peerIdentity || isSending}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!peerIdentity || !draft.trim() || isSending}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          title="Encrypt and send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

