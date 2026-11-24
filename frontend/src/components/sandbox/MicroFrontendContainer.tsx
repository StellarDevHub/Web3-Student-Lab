'use client';

import { HostRpcBridge, RpcHandlerError, validateManifest } from '@/services/sandbox/rpcBridge';
import type {
  ExerciseEvaluationParams,
  MicroFrontendManifest,
  MicroFrontendPermission,
  ProgressReportParams,
  SecurityViolation,
  SignTransactionParams,
  SignTransactionResult,
  StellarNetwork,
} from '@/types/microFrontend';
import { AlertTriangle, PenTool, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Sandboxed container for third-party course widgets (FE-047).
 *
 * Isolation comes from three layers:
 *  1. The widget must live on a registry-allowlisted origin that differs from
 *     the host, so `sandbox="allow-scripts allow-same-origin"` gives it its
 *     *own* origin — the browser blocks any access to the host DOM, cookies,
 *     and storage. Same-origin widgets are refused outright.
 *  2. Permissions Policy denies powerful features and `referrerPolicy`
 *     hides the lesson URL.
 *  3. All communication goes through {@link HostRpcBridge}: typed, tokenised,
 *     permission-gated, rate limited. Signing requests require an explicit
 *     student approval in host UI; the widget only ever receives signed XDR.
 */

export const MICRO_FRONTEND_SANDBOX = 'allow-scripts allow-same-origin';

const IFRAME_PERMISSIONS_POLICY = [
  "camera 'none'",
  "microphone 'none'",
  "geolocation 'none'",
  "payment 'none'",
  "usb 'none'",
  "serial 'none'",
  "hid 'none'",
  "display-capture 'none'",
  "clipboard-read 'none'",
].join('; ');

export interface MicroFrontendContainerProps {
  manifest: MicroFrontendManifest;
  /** Registry allowlist of origins approved to serve widgets. */
  allowedOrigins: string[];
  /** Permissions the host grants; defaults to everything the manifest requests. */
  grantedPermissions?: MicroFrontendPermission[];
  /** Read-only wallet projection. Never pass a signer or secret here. */
  wallet: { publicKey: string | null; network: StellarNetwork };
  /** Signs an approved envelope with the student's wallet and returns signed XDR. */
  onSignTransaction?: (xdr: string, request: { network: StellarNetwork; description: string }) => Promise<string>;
  onProgress?: (progress: ProgressReportParams, widgetId: string) => void;
  onEvaluation?: (evaluation: ExerciseEvaluationParams, widgetId: string) => void | Promise<void>;
  onViolation?: (violation: SecurityViolation) => void;
  courseId?: string;
  lessonId?: string;
  locale?: string;
  theme?: 'dark' | 'light';
  /** Allow `http://localhost` widgets; defaults to development builds only. */
  allowInsecureLocalhost?: boolean;
  className?: string;
}

type ContainerStatus = 'loading' | 'connected' | 'blocked';

interface PendingSignature {
  params: SignTransactionParams;
  resolve: (signedXdr: string) => void;
  reject: (error: RpcHandlerError) => void;
}

export function MicroFrontendContainer({
  manifest,
  allowedOrigins,
  grantedPermissions,
  wallet,
  onSignTransaction,
  onProgress,
  onEvaluation,
  onViolation,
  courseId,
  lessonId,
  locale = 'en',
  theme = 'dark',
  allowInsecureLocalhost = process.env.NODE_ENV === 'development',
  className = '',
}: MicroFrontendContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<HostRpcBridge | null>(null);
  const pendingRef = useRef<PendingSignature | null>(null);
  const [status, setStatus] = useState<ContainerStatus>('loading');
  const [height, setHeight] = useState(manifest.initialHeight ?? 480);
  const [pendingSignature, setPendingSignature] = useState<PendingSignature | null>(null);
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [signing, setSigning] = useState(false);
  // The host origin is only known in the browser; resolving it after mount keeps SSR and hydration identical.
  const [hostOrigin, setHostOrigin] = useState<string | null>(null);

  useEffect(() => {
    setHostOrigin(window.location.origin);
  }, []);

  // Handlers read the latest props through a ref so the bridge (and its token) survive re-renders.
  const latest = useRef({ wallet, onSignTransaction, onProgress, onEvaluation, onViolation });
  latest.current = { wallet, onSignTransaction, onProgress, onEvaluation, onViolation };

  const validation = useMemo(
    () => (hostOrigin ? validateManifest(manifest, { allowedOrigins, hostOrigin, allowInsecureLocalhost }) : null),
    [manifest, allowedOrigins, allowInsecureLocalhost, hostOrigin],
  );

  const granted = grantedPermissions ?? manifest.permissions;
  // Stable identity so a parent passing a new array literal each render does not rebuild the bridge.
  const grantedKey = Array.from(new Set(granted)).sort().join(',');

  useEffect(() => {
    if (!validation) return;
    if (!validation.ok) {
      setStatus('blocked');
      latest.current.onViolation?.({ reason: 'invalid-manifest', detail: validation.reason, at: Date.now() });
      return;
    }

    setStatus('loading');
    const recordViolation = (violation: SecurityViolation) => {
      setViolations((current) => [violation, ...current].slice(0, 5));
      latest.current.onViolation?.(violation);
    };

    const bridge = new HostRpcBridge({
      manifest,
      getTarget: () => iframeRef.current?.contentWindow ?? null,
      grantedPermissions: grantedKey ? (grantedKey.split(',') as MicroFrontendPermission[]) : [],
      context: { courseId, lessonId, locale, theme },
      onReady: () => setStatus('connected'),
      onViolation: recordViolation,
      handlers: {
        'wallet.getPublicKey': () => ({
          publicKey: latest.current.wallet.publicKey,
          network: latest.current.wallet.network,
        }),
        'wallet.signTransaction': (params) => {
          const { wallet: currentWallet, onSignTransaction: sign } = latest.current;
          if (!sign) throw new RpcHandlerError('METHOD_NOT_ALLOWED', 'Signing is not available in this lesson');
          if (!currentWallet.publicKey) throw new RpcHandlerError('USER_REJECTED', 'No wallet is connected');
          if (params.network !== currentWallet.network) {
            throw new RpcHandlerError('INVALID_PARAMS', `Wallet is on ${currentWallet.network}, not ${params.network}`);
          }
          if (pendingRef.current) {
            throw new RpcHandlerError('RATE_LIMITED', 'Another signing request is awaiting approval');
          }

          return new Promise<SignTransactionResult>((resolve, reject) => {
            const pending: PendingSignature = {
              params,
              resolve: (signedXdr) => resolve({ signedXdr }),
              reject,
            };
            pendingRef.current = pending;
            setPendingSignature(pending);
          });
        },
        'progress.report': (params, context) => {
          latest.current.onProgress?.(params, context.widgetId);
          return { accepted: Boolean(latest.current.onProgress) };
        },
        'exercise.submitEvaluation': async (params, context) => {
          await latest.current.onEvaluation?.(params, context.widgetId);
          return { recorded: Boolean(latest.current.onEvaluation) };
        },
        'widget.resize': ({ height: requested }) => {
          setHeight(requested);
          return { height: requested };
        },
      },
    });

    bridge.start();
    bridgeRef.current = bridge;

    return () => {
      bridge.destroy();
      bridgeRef.current = null;
      pendingRef.current?.reject(new RpcHandlerError('USER_REJECTED', 'Widget was unmounted'));
      pendingRef.current = null;
      setPendingSignature(null);
    };
    // The bridge is rebuilt only when the widget identity or its grants change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.id, manifest.origin, manifest.entryUrl, validation?.ok, grantedKey]);

  useEffect(() => {
    if (grantedKey.split(',').includes('wallet:read')) {
      bridgeRef.current?.emit('host.walletChanged', { publicKey: wallet.publicKey, network: wallet.network });
    }
  }, [wallet.publicKey, wallet.network, grantedKey]);

  useEffect(() => {
    bridgeRef.current?.emit('host.themeChanged', { theme });
  }, [theme]);

  const settleSignature = async (approved: boolean) => {
    const pending = pendingRef.current;
    if (!pending) return;

    if (!approved) {
      pending.reject(new RpcHandlerError('USER_REJECTED', 'The student rejected the signing request'));
    } else {
      setSigning(true);
      try {
        const sign = latest.current.onSignTransaction;
        if (!sign) throw new Error('Signing unavailable');
        const signedXdr = await sign(pending.params.xdr, {
          network: pending.params.network,
          description: pending.params.description,
        });
        pending.resolve(signedXdr);
      } catch {
        pending.reject(new RpcHandlerError('USER_REJECTED', 'The wallet did not sign the transaction'));
      } finally {
        setSigning(false);
      }
    }

    pendingRef.current = null;
    setPendingSignature(null);
  };

  if (!validation) {
    return (
      <div
        className={`animate-pulse rounded-2xl border border-white/10 bg-black/60 ${className}`}
        style={{ height: height + 37 }}
        aria-busy="true"
      />
    );
  }

  if (!validation.ok) {
    return (
      <div className={`rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300 ${className}`}>
        <div className="mb-1 flex items-center gap-2 font-bold">
          <ShieldAlert className="h-4 w-4" /> Widget blocked
        </div>
        <p className="text-red-300/80">
          “{manifest.name}” cannot be loaded: {validation.reason}.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <ShieldCheck className={`h-3.5 w-3.5 ${status === 'connected' ? 'text-emerald-400' : 'text-zinc-500'}`} />
          <span className="font-bold text-zinc-200">{manifest.name}</span>
          <span className="text-zinc-600">
            v{manifest.version} · {manifest.publisher} · {new URL(manifest.entryUrl).host}
          </span>
        </div>
        <span className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
          {status === 'connected' ? 'sandboxed · connected' : 'connecting…'}
        </span>
      </div>

      <iframe
        ref={iframeRef}
        src={manifest.entryUrl}
        title={`${manifest.name} (third-party widget)`}
        sandbox={MICRO_FRONTEND_SANDBOX}
        allow={IFRAME_PERMISSIONS_POLICY}
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ height }}
        className="block w-full border-0 bg-transparent"
      />

      {violations.length > 0 && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-300">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3 w-3" /> Blocked {violations.length} unauthorized widget request
            {violations.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-1 space-y-0.5 font-mono text-amber-300/70">
            {violations.map((violation) => (
              <li key={`${violation.at}-${violation.reason}`}>
                {violation.reason}: {violation.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingSignature && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mfe-sign-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
          >
            <h3 id="mfe-sign-title" className="flex items-center gap-2 text-sm font-black text-white">
              <PenTool className="h-4 w-4 text-red-400" /> Signature requested
            </h3>
            <p className="mt-2 text-xs text-zinc-400">
              <span className="font-bold text-zinc-200">{manifest.name}</span> by {manifest.publisher} wants your
              wallet to sign a <span className="font-bold text-zinc-200">{pendingSignature.params.network}</span>{' '}
              transaction:
            </p>
            <p className="mt-3 rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-zinc-200">
              {pendingSignature.params.description}
            </p>
            <details className="mt-3 text-xs text-zinc-500">
              <summary className="cursor-pointer">Envelope XDR</summary>
              <code className="mt-2 block max-h-32 overflow-auto break-all font-mono text-[10px] text-zinc-400">
                {pendingSignature.params.xdr}
              </code>
            </details>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void settleSignature(false)}
                disabled={signing}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void settleSignature(true)}
                disabled={signing}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {signing ? 'Signing…' : 'Approve & sign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MicroFrontendContainer;
