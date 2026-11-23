'use client';

import { useEffect, useRef, useState } from 'react';

import {
  LAB_IFRAME_SANDBOX,
  MicroFrontendEnvelope,
  PublicWalletContext,
  buildEnvelope,
  createSessionToken,
  isAllowedLabOrigin,
  parseEnvelope,
  validateEnvelope,
} from '@/microfrontends/sandbox/protocol';

/**
 * A self-contained demo lab, served via `srcdoc` so this works with zero
 * external hosting. It only ever talks to the host through the postMessage
 * protocol, and actively demonstrates that it cannot read the parent's
 * cookies or localStorage — the isolation `sandbox="allow-scripts allow-forms"`
 * (no `allow-same-origin`) enforces at the platform level, not by convention.
 */
const DEMO_LAB_SRCDOC = String.raw`
<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;font-family:monospace;background:#020617;color:#e2e8f0;padding:16px;">
  <div id="root">booting…</div>
  <script>
    (function () {
      var root = document.getElementById('root');
      var token = null;
      var VERSION = 1;

      function send(type, payload) {
        parent.postMessage({ version: VERSION, type: type, token: token, payload: payload }, '*');
      }

      function isolationProof() {
        var cookieAccess = 'blocked';
        var storageAccess = 'blocked';
        try { cookieAccess = document.cookie.length >= 0 ? 'READABLE (' + document.cookie.length + ' chars)' : 'blocked'; } catch (e) { cookieAccess = 'blocked: ' + e.message; }
        try { storageAccess = window.localStorage ? 'READABLE' : 'blocked'; } catch (e) { storageAccess = 'blocked: ' + e.message; }
        return { cookieAccess: cookieAccess, storageAccess: storageAccess, origin: window.origin };
      }

      window.addEventListener('message', function (event) {
        var msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'host:handshake') {
          token = msg.payload.token;
          send('lab:request-wallet-context', {});
          return;
        }

        if (msg.type === 'host:wallet-context') {
          var proof = isolationProof();
          root.innerHTML =
            '<div style="color:#4ade80">lab connected — session token accepted</div>' +
            '<div style="margin-top:8px">wallet (read-only, via host): ' + JSON.stringify(msg.payload) + '</div>' +
            '<div style="margin-top:8px;color:#f59e0b">this frame\\'s own origin: ' + proof.origin + '</div>' +
            '<div>document.cookie: ' + proof.cookieAccess + '</div>' +
            '<div>window.localStorage: ' + proof.storageAccess + '</div>';
          send('lab:log', { message: 'rendered wallet context read-only' });
        }
      });

      send('lab:ready', {});
    })();
  </script>
</body>
</html>
`;

export interface SandboxedLabFrameProps {
  wallet: PublicWalletContext;
  /** Origins allowed to host a *real* remote lab. `'null'` covers this srcdoc demo. */
  allowedOrigins?: string[];
  /** A real third-party deployment URL. Omit to use the built-in srcdoc demo lab. */
  src?: string;
  title?: string;
}

type ConnectionState = 'connecting' | 'handshaking' | 'connected' | 'error';

/**
 * Mounts a third-party (or, by default, a bundled demo) lab inside a hardened
 * sandbox: a cross-origin-equivalent iframe with no `allow-same-origin`, a
 * per-mount session token issued only after the frame announces itself, and
 * a narrow read-only wallet projection instead of the real wallet context.
 */
export function SandboxedLabFrame({
  wallet,
  allowedOrigins = ['null'],
  src,
  title = 'Sandboxed lab',
}: SandboxedLabFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tokenRef.current = createSessionToken();
    setState('connecting');
    setError(null);
    setLog([]);

    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      if (!isAllowedLabOrigin(event.origin, allowedOrigins)) {
        setError(`Rejected message from untrusted origin "${event.origin}"`);
        return;
      }

      const envelope = parseEnvelope(event.data);

      if (envelope?.type === 'lab:ready') {
        // The lab has announced itself — now, and only now, does it get a
        // session token, over the same validated channel.
        setState('handshaking');
        const handshake = buildEnvelope('host:handshake', null, { token: tokenRef.current });
        iframe.contentWindow?.postMessage(handshake, event.origin === 'null' ? '*' : event.origin);
        return;
      }

      const result = validateEnvelope(envelope, tokenRef.current);
      if (!result.ok || !envelope) {
        setError(`Dropped an unauthenticated message: ${result.reason ?? 'unknown'}`);
        return;
      }

      if (envelope.type === 'lab:request-wallet-context') {
        setState('connected');
        const response = buildEnvelope('host:wallet-context', tokenRef.current, wallet);
        iframe.contentWindow?.postMessage(response, event.origin === 'null' ? '*' : event.origin);
        return;
      }

      if (envelope.type === 'lab:log') {
        const payload = envelope.payload as { message?: string };
        setLog((prev) => [...prev, payload.message ?? JSON.stringify(payload)]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wallet is read fresh via closure; re-running per-render would reset the session token.
  }, [allowedOrigins]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">{title}</p>
        <span
          className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            state === 'connected'
              ? 'bg-emerald-500/20 text-emerald-400'
              : state === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          {state}
        </span>
      </div>

      <iframe
        ref={iframeRef}
        title={title}
        sandbox={LAB_IFRAME_SANDBOX}
        {...(src ? { src } : { srcDoc: DEMO_LAB_SRCDOC })}
        className="h-56 w-full rounded-xl border border-white/10 bg-slate-950"
      />

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      {log.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
          {log.map((entry, i) => (
            <li key={i}>· {entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
