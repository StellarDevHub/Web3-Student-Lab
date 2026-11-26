'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';

import {
  COMMUNITY_WIDGET_SANDBOX,
  PublicWalletInfo,
  RPCRequestMessage,
  RPCResponseMessage,
  SecurityAlert,
  createHandshakeAck,
  createRPCError,
  createRPCResponse,
  createSessionToken,
  toSanitizedWalletInfo,
  validateInboundRPCMessage,
} from './sandboxProtocol';

export interface WidgetSandboxProps {
  widgetId?: string;
  title?: string;
  src?: string;
  srcDoc?: string;
  allowedOrigins?: string[];
  walletContext?: {
    publicKey: string | null;
    network?: string;
  };
  onSecurityAlert?: (alert: SecurityAlert) => void;
  onQuarantine?: (alert: SecurityAlert) => void;
  className?: string;
}

export type WidgetDemoType = 'safe-quiz' | 'malicious-exploit' | 'custom';

export interface RPCLogItem {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  method?: string;
  status: 'ok' | 'blocked' | 'error';
  payload: unknown;
}

/**
 * Built-in Safe Community Course Quiz Widget.
 * Communicates strictly via authorized RPCs and proves that parent storage/wallet are blocked.
 */
const SAFE_QUIZ_WIDGET_SRCDOC = String.raw`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      font-size: 13px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    h3 { margin: 0 0 8px 0; font-size: 15px; color: #38bdf8; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: #065f46;
      color: #34d399;
      margin-bottom: 8px;
    }
    button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      margin-right: 6px;
      margin-top: 6px;
    }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #334155; }
    button.secondary:hover { background: #475569; }
    .status-box {
      font-family: monospace;
      font-size: 11px;
      background: #020617;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #1e293b;
      margin-top: 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .proof-item { margin: 4px 0; }
    .blocked { color: #f87171; font-weight: bold; }
    .success { color: #4ade80; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Community Course Widget #42</span>
    <h3>Stellar Soroban Quiz: Resource Footprint</h3>
    <p>Answer this interactive check to earn student credentials. This widget runs inside an isolated microfrontend sandbox.</p>
    
    <div id="quiz-question" style="margin: 10px 0;">
      <p style="font-weight: 600;">Question: Which storage type in Soroban is retained forever unless archived, and ideal for immutable governance rules?</p>
      <button onclick="submitQuiz('temporary')">A) Temporary</button>
      <button onclick="submitQuiz('instance')">B) Instance</button>
      <button onclick="submitQuiz('persistent')">C) Persistent</button>
    </div>

    <div id="quiz-result" class="status-box" style="display:none;"></div>
  </div>

  <div class="card">
    <h3 style="color:#a78bfa;">Sandbox Isolation Proof (Live Verification)</h3>
    <p>This button attempts to directly access parent storage and wallet injection without host permission:</p>
    <button class="secondary" onclick="runIsolationCheck()">Inspect Direct Parent Access</button>
    <div id="isolation-report" class="status-box">Status: Waiting to run inspection...</div>
  </div>

  <script>
    (function() {
      var sessionToken = null;
      var requestId = 0;
      var pendingRequests = {};

      function sendRPC(method, params, callback) {
        if (!sessionToken) {
          log('Cannot send RPC: Session token not established yet.');
          return;
        }
        var id = 'rpc-' + (++requestId);
        if (callback) pendingRequests[id] = callback;
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: id,
          method: method,
          params: params || {},
          token: sessionToken
        }, '*');
      }

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'MFE_HANDSHAKE_ACK') {
          sessionToken = msg.sessionToken;
          sendRPC('course:getProgress', { courseId: 'soroban-101' }, function(err, res) {
            if (!err) {
              log('Connected via typed RPC! Initial course progress: ' + JSON.stringify(res));
            }
          });
          return;
        }

        if (msg.jsonrpc === '2.0' && msg.id && pendingRequests[msg.id]) {
          var cb = pendingRequests[msg.id];
          delete pendingRequests[msg.id];
          cb(msg.error, msg.result);
        }
      });

      window.submitQuiz = function(answer) {
        var resultBox = document.getElementById('quiz-result');
        resultBox.style.display = 'block';
        resultBox.innerHTML = 'Submitting answer via authorized RPC protocol...';

        sendRPC('course:submitAnswer', {
          courseId: 'soroban-101',
          questionId: 'q-storage',
          answer: answer
        }, function(err, result) {
          if (err) {
            resultBox.innerHTML = '<span class="blocked">RPC Error: ' + err.message + '</span>';
          } else {
            resultBox.innerHTML = (result.correct ? '<span class="success">✓ Correct! ' : '<span class="blocked">✗ Incorrect: ') +
              result.explanation + '</span>\nEarned XP: ' + result.xpEarned;
          }
        });
      };

      window.runIsolationCheck = function() {
        var reportEl = document.getElementById('isolation-report');
        var report = [];

        // 1. Check parent localStorage
        try {
          var pStorage = window.parent.localStorage;
          report.push('parent.localStorage: ' + (pStorage ? 'ACCESSIBLE (CRITICAL FAIL)' : 'blocked'));
        } catch(e) {
          report.push('parent.localStorage: <span class="blocked">BLOCKED (' + e.name + ')</span>');
        }

        // 2. Check parent cookies
        try {
          var pCookie = window.parent.document.cookie;
          report.push('parent.document.cookie: ' + (pCookie ? 'READ (' + pCookie.length + ' chars)' : 'blocked'));
        } catch(e) {
          report.push('parent.document.cookie: <span class="blocked">BLOCKED (' + e.name + ')</span>');
        }

        // 3. Check window.stellar wallet injection
        try {
          var pStellar = window.parent.stellar;
          report.push('parent.stellar wallet: ' + (pStellar ? 'ACCESSIBLE (THEFT RISK)' : '<span class="blocked">BLOCKED (Cannot access parent object)</span>'));
        } catch(e) {
          report.push('parent.stellar wallet: <span class="blocked">BLOCKED (' + e.name + ')</span>');
        }

        // 4. Check iframe own origin
        report.push('Iframe origin: <span class="success">' + window.origin + ' (opaque null origin)</span>');

        reportEl.innerHTML = report.join('\n');
      };

      function log(msg) {
        var el = document.getElementById('isolation-report');
        if (el) el.innerHTML = msg;
      }

      // Initiate handshake
      window.parent.postMessage({
        type: 'MFE_HANDSHAKE_INIT',
        widgetId: 'widget-stellar-soroban-quiz',
        timestamp: Date.now()
      }, '*');
    })();
  </script>
</body>
</html>
`;

/**
 * Built-in Malicious Community Course Widget (Exploit Simulation).
 * Simulates an attacker attempting XSS, wallet theft, localStorage theft, and unauthorized RPC calls.
 */
const MALICIOUS_EXPLOIT_WIDGET_SRCDOC = String.raw`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #180509;
      color: #ffe4e6;
      font-size: 13px;
    }
    .card {
      background: #2a0b12;
      border: 1px solid #881337;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    h3 { margin: 0 0 8px 0; font-size: 15px; color: #fb7185; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: #881337;
      color: #fecdd3;
      margin-bottom: 8px;
    }
    button {
      background: #e11d48;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      margin-right: 6px;
      margin-top: 6px;
      display: inline-block;
    }
    button:hover { background: #be123c; }
    .status-box {
      font-family: monospace;
      font-size: 11px;
      background: #0d0104;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #4c0519;
      margin-top: 8px;
      white-space: pre-wrap;
      word-break: break-all;
      color: #fda4af;
    }
    .exploit-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">SECURITY TEST HARNESS</span>
    <h3>Untrusted Community Widget: Attack Simulator</h3>
    <p>Simulates real-world XSS and wallet theft attacks against the parent application. Triggering these will test the microfrontend isolation boundary.</p>

    <div class="exploit-grid">
      <div>
        <strong>Attack Vector 1: Unauthorized RPC Wallet Theft</strong>
        <p style="margin:2px 0 6px 0;font-size:11px;color:#fecdd3;">Attempts to trigger <code>wallet:signTransaction</code> through the postMessage RPC bridge to siphon student lumens.</p>
        <button onclick="triggerRpcWalletTheft()">Launch Unauthorized RPC (wallet:signTransaction)</button>
      </div>

      <div style="margin-top:8px;">
        <strong>Attack Vector 2: LocalStorage & Cookie Exfiltration</strong>
        <p style="margin:2px 0 6px 0;font-size:11px;color:#fecdd3;">Attempts to access <code>window.parent.localStorage</code> or <code>document.cookie</code> directly.</p>
        <button onclick="triggerStorageTheft()">Attempt Parent LocalStorage Access</button>
      </div>

      <div style="margin-top:8px;">
        <strong>Attack Vector 3: Prototype Pollution via RPC Bridge</strong>
        <p style="margin:2px 0 6px 0;font-size:11px;color:#fecdd3;">Injects <code>__proto__</code> payloads across the postMessage protocol to poison parent prototype.</p>
        <button onclick="triggerPrototypePollution()">Send Prototype Pollution Payload</button>
      </div>

      <div style="margin-top:8px;">
        <strong>Attack Vector 4: Unauthenticated RPC Spoofer</strong>
        <p style="margin:2px 0 6px 0;font-size:11px;color:#fecdd3;">Sends RPC requests without acquiring a valid cryptographic session token.</p>
        <button onclick="triggerTokenSpoof()">Send Token Spoof Request</button>
      </div>
    </div>

    <div id="attack-log" class="status-box">Simulator Ready. Select an exploit vector above.</div>
  </div>

  <script>
    (function() {
      var token = null;

      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'MFE_HANDSHAKE_ACK') {
          token = event.data.sessionToken;
        }
      });

      // Try handshake
      window.parent.postMessage({
        type: 'MFE_HANDSHAKE_INIT',
        widgetId: 'malicious-untrusted-widget-666',
        timestamp: Date.now()
      }, '*');

      window.triggerRpcWalletTheft = function() {
        var logEl = document.getElementById('attack-log');
        logEl.innerText = '[Attack 1] Sending forbidden RPC wallet:signTransaction...';
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: 'exploit-wallet-' + Date.now(),
          method: 'wallet:signTransaction',
          params: {
            destination: 'GATTACKER_ACCOUNT_ADDRESS_XYZ',
            amount: '50000',
            memo: 'unauthorized_siphon'
          },
          token: token || 'stolen-or-mock-token'
        }, '*');
      };

      window.triggerStorageTheft = function() {
        var logEl = document.getElementById('attack-log');
        try {
          var val = window.parent.localStorage.getItem('stellar_wallet_seed');
          logEl.innerText = '[CRITICAL BREACH] Stole seed from parent: ' + val;
        } catch(e) {
          logEl.innerText = '[BLOCKED BY SANDBOX] Browser threw DOMException: ' + e.message + '\nReporting escape attempt to host...';
          // Send unauthorized RPC trying to probe storage
          window.parent.postMessage({
            jsonrpc: '2.0',
            id: 'exploit-storage-' + Date.now(),
            method: 'storage:getLocalStorage',
            params: { key: 'token' },
            token: token || 'mock'
          }, '*');
        }
      };

      window.triggerPrototypePollution = function() {
        var logEl = document.getElementById('attack-log');
        logEl.innerText = '[Attack 3] Transmitting __proto__ prototype pollution payload...';
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: 'exploit-proto-' + Date.now(),
          method: 'widget:log',
          params: JSON.parse('{"__proto__": {"isAdmin": true, "elevated": true}}'),
          token: token || 'token'
        }, '*');
      };

      window.triggerTokenSpoof = function() {
        var logEl = document.getElementById('attack-log');
        logEl.innerText = '[Attack 4] Sending spoofed unauthenticated request...';
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: 'exploit-spoof-' + Date.now(),
          method: 'course:getProgress',
          params: { courseId: 'secret-exam-data' },
          token: 'invalid-counterfeit-token-000'
        }, '*');
      };
    })();
  </script>
</body>
</html>
`;

export function WidgetSandbox({
  widgetId = 'community-course-widget',
  title = 'Community Course Widget Sandbox',
  src,
  srcDoc,
  allowedOrigins = ['null'],
  walletContext,
  onSecurityAlert,
  onQuarantine,
  className = '',
}: WidgetSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const mountInstanceId = useId();

  const [demoType, setDemoType] = useState<WidgetDemoType>(src ? 'custom' : 'safe-quiz');
  const [customHtml, setCustomHtml] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<
    'initializing' | 'handshaking' | 'connected' | 'quarantined'
  >('initializing');

  const [isQuarantined, setIsQuarantined] = useState<boolean>(false);
  const [quarantineAlert, setQuarantineAlert] = useState<SecurityAlert | null>(null);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [rpcLogs, setRpcLogs] = useState<RPCLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'sandbox' | 'alerts' | 'rpcLogs' | 'source'>('sandbox');
  const [mountKey, setMountKey] = useState<number>(1);

  // Sanitized wallet information strictly projected across the boundary
  const publicWallet = useMemo(() => {
    return toSanitizedWalletInfo(walletContext);
  }, [walletContext]);

  // Log helper
  const addRpcLog = useCallback(
    (direction: 'inbound' | 'outbound', method: string | undefined, payload: unknown, status: 'ok' | 'blocked' | 'error') => {
      const item: RPCLogItem = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        direction,
        method,
        status,
        payload,
      };
      setRpcLogs((prev) => [item, ...prev].slice(0, 50));
    },
    []
  );

  // Quarantine trigger
  const triggerQuarantine = useCallback(
    (alert: SecurityAlert) => {
      setIsQuarantined(true);
      setConnectionStatus('quarantined');
      setQuarantineAlert(alert);
      setSecurityAlerts((prev) => [alert, ...prev]);
      onSecurityAlert?.(alert);
      onQuarantine?.(alert);
    },
    [onSecurityAlert, onQuarantine]
  );

  // Reset / Reboot Sandbox
  const handleResetSandbox = useCallback(() => {
    const newToken = createSessionToken();
    sessionTokenRef.current = newToken;
    setIsQuarantined(false);
    setQuarantineAlert(null);
    setConnectionStatus('handshaking');
    setMountKey((prev) => prev + 1);
  }, []);

  // Post message to iframe safely
  const postToIframe = useCallback(
    (message: unknown, targetOrigin = '*') => {
      const frame = iframeRef.current;
      if (!frame || !frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage(message, targetOrigin);
      } catch (err) {
        console.error('Failed to postMessage to sandbox iframe:', err);
      }
    },
    []
  );

  // Handle incoming RPC requests
  const handleInboundRPCRequest = useCallback(
    (req: RPCRequestMessage) => {
      addRpcLog('inbound', req.method, req, 'ok');

      if (!sessionTokenRef.current) return;
      const token = sessionTokenRef.current;

      switch (req.method) {
        case 'course:getProgress': {
          const courseId = (req.params as { courseId?: string })?.courseId || 'stellar-101';
          const progress = {
            courseId,
            completedLessons: 4,
            totalLessons: 8,
            percentComplete: 50,
            score: 120,
            badge: 'Soroban Beginner',
          };
          const response = createRPCResponse(req.id, progress, token);
          postToIframe(response);
          addRpcLog('outbound', 'course:getProgress[response]', response, 'ok');
          break;
        }

        case 'course:submitAnswer': {
          const params = (req.params as { questionId?: string; answer?: string }) || {};
          const isCorrect = params.answer === 'persistent';
          const evaluation = {
            questionId: params.questionId,
            correct: isCorrect,
            explanation: isCorrect
              ? 'Persistent storage is stored forever on ledger state unless explicitly archived by TTL expiry.'
              : 'Incorrect. Temporary storage is wiped on TTL expiration without archive storage.',
            xpEarned: isCorrect ? 50 : 0,
            submittedAt: Date.now(),
          };
          const response = createRPCResponse(req.id, evaluation, token);
          postToIframe(response);
          addRpcLog('outbound', 'course:submitAnswer[response]', response, 'ok');
          break;
        }

        case 'course:getMetadata': {
          const meta = {
            title: 'Stellar Smart Contracts & State Archival',
            author: 'Community Educator DAO',
            version: '1.2.0',
            sandboxIsolated: true,
          };
          const response = createRPCResponse(req.id, meta, token);
          postToIframe(response);
          addRpcLog('outbound', 'course:getMetadata[response]', response, 'ok');
          break;
        }

        case 'wallet:getPublicInfo': {
          // Strictly return sanitized read-only projection (never key material, never signer)
          const response = createRPCResponse(req.id, publicWallet, token);
          postToIframe(response);
          addRpcLog('outbound', 'wallet:getPublicInfo[response]', response, 'ok');
          break;
        }

        case 'sandbox:ping': {
          const response = createRPCResponse(req.id, { pong: true, timestamp: Date.now() }, token);
          postToIframe(response);
          addRpcLog('outbound', 'sandbox:ping[response]', response, 'ok');
          break;
        }

        default: {
          const errResponse = createRPCError(req.id, -32601, `Method not implemented: ${req.method}`, token);
          postToIframe(errResponse);
          addRpcLog('outbound', 'error[response]', errResponse, 'error');
          break;
        }
      }
    },
    [addRpcLog, postToIframe, publicWallet]
  );

  // Setup message listener
  useEffect(() => {
    const newToken = createSessionToken();
    sessionTokenRef.current = newToken;
    setConnectionStatus('handshaking');

    const handleWindowMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) {
        return; // Ignore messages not originating from this specific iframe
      }

      const outcome = validateInboundRPCMessage(
        event.data,
        sessionTokenRef.current,
        allowedOrigins,
        event.origin
      );

      if (!outcome.success) {
        addRpcLog('inbound', outcome.alert.method || 'unknown', event.data, 'blocked');
        triggerQuarantine(outcome.alert);
        return;
      }

      if (outcome.kind === 'handshake') {
        setConnectionStatus('connected');
        const ack = createHandshakeAck(sessionTokenRef.current ?? '', window.location.origin);
        postToIframe(ack);
        addRpcLog('outbound', 'MFE_HANDSHAKE_ACK', ack, 'ok');
        return;
      }

      if (outcome.kind === 'request') {
        handleInboundRPCRequest(outcome.message);
        return;
      }

      if (outcome.kind === 'notification') {
        addRpcLog('inbound', outcome.message.method, outcome.message, 'ok');
        if (outcome.message.method === 'widget:ready') {
          setConnectionStatus('connected');
        }
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [allowedOrigins, handleInboundRPCRequest, mountKey, postToIframe, triggerQuarantine, addRpcLog]);

  // Selected srcDoc calculation
  const currentSrcDoc = useMemo(() => {
    if (srcDoc) return srcDoc;
    if (demoType === 'safe-quiz') return SAFE_QUIZ_WIDGET_SRCDOC;
    if (demoType === 'malicious-exploit') return MALICIOUS_EXPLOIT_WIDGET_SRCDOC;
    return customHtml || SAFE_QUIZ_WIDGET_SRCDOC;
  }, [srcDoc, demoType, customHtml]);

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 text-slate-100 shadow-xl overflow-hidden ${className}`}
      data-testid="microfrontend-widget-sandbox"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              isQuarantined
                ? 'border-rose-500/40 bg-rose-950/60 text-rose-400'
                : 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400'
            }`}
          >
            {isQuarantined ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100">{title}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isQuarantined
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isQuarantined ? 'Quarantined' : 'Isolated Sandbox'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Host: <code className="text-sky-300">sandbox=&quot;{COMMUNITY_WIDGET_SANDBOX}&quot;</code> (Strictly no allow-same-origin)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetSandbox}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            title="Reset session token and re-mount sandbox"
            data-testid="reset-sandbox-button"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Sandbox</span>
          </button>
        </div>
      </div>

      {/* Widget Selector & Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/50 px-5 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Select Widget:</span>
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => {
                setDemoType('safe-quiz');
                handleResetSandbox();
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                demoType === 'safe-quiz'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Safe Quiz Widget
            </button>
            <button
              onClick={() => {
                setDemoType('malicious-exploit');
                handleResetSandbox();
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                demoType === 'malicious-exploit'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              Attacker Simulator
            </button>
            <button
              onClick={() => {
                setDemoType('custom');
                handleResetSandbox();
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                demoType === 'custom'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Custom HTML
            </button>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === 'sandbox'
                ? 'bg-slate-800 text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Widget View</span>
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium relative ${
              activeTab === 'alerts'
                ? 'bg-slate-800 text-rose-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Security Alerts</span>
            {securityAlerts.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {securityAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('rpcLogs')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === 'rpcLogs'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>RPC Telemetry</span>
            {rpcLogs.length > 0 && (
              <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400 border border-slate-700">
                {rpcLogs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-5">
        {/* Render Boundary Isolation Banner when Quarantined */}
        {isQuarantined && quarantineAlert && (
          <div
            className="mb-5 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/70 to-slate-950 p-4 text-rose-100 shadow-lg"
            data-testid="security-quarantine-banner"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-rose-600/30 p-2 text-rose-400 border border-rose-500/40">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-rose-200">
                    RENDER-BOUNDARY ISOLATION ACTIVATED (CRITICAL SECURITY ALERT)
                  </h4>
                  <span className="rounded bg-rose-900/80 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-200 uppercase border border-rose-700">
                    {quarantineAlert.severity} severity
                  </span>
                </div>
                <p className="text-xs text-rose-200/90">{quarantineAlert.details}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-rose-300">
                  <span className="rounded bg-rose-950/80 px-2 py-0.5 border border-rose-900">
                    Violation: <code>{quarantineAlert.type}</code>
                  </span>
                  {quarantineAlert.method && (
                    <span className="rounded bg-rose-950/80 px-2 py-0.5 border border-rose-900">
                      Method: <code>{quarantineAlert.method}</code>
                    </span>
                  )}
                  <span className="rounded bg-rose-950/80 px-2 py-0.5 border border-rose-900">
                    Origin: <code>{quarantineAlert.origin || 'opaque (null)'}</code>
                  </span>
                  <span className="rounded bg-rose-950/80 px-2 py-0.5 border border-rose-900">
                    Time: {new Date(quarantineAlert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleResetSandbox}
                    className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reset & Neutralize Sandbox
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Sandbox / Widget View */}
        {activeTab === 'sandbox' && (
          <div className="space-y-4">
            {demoType === 'custom' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">Custom Untrusted Widget HTML / Script:</label>
                <textarea
                  value={customHtml}
                  onChange={(e) => setCustomHtml(e.target.value)}
                  placeholder="Paste untrusted HTML/JS code here to test isolation..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                />
              </div>
            )}

            {/* Iframe Container with Isolation Shield when Quarantined */}
            <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden min-h-[360px]">
              {isQuarantined ? (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center backdrop-blur-md"
                  data-testid="quarantined-boundary-shield"
                >
                  <div className="mb-3 rounded-full bg-rose-500/20 p-3 text-rose-400 border border-rose-500/30">
                    <Lock className="h-8 w-8" />
                  </div>
                  <h4 className="text-lg font-bold text-rose-300">Untrusted Microfrontend Quarantined</h4>
                  <p className="max-w-md text-xs text-slate-400 mt-1">
                    Widget execution has been suspended by the render-boundary isolation layer because a security
                    violation was caught. No parent cookies, local storage, or wallet providers were leaked.
                  </p>
                  <button
                    onClick={handleResetSandbox}
                    className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
                  >
                    Reboot Sandbox with New Session Token
                  </button>
                </div>
              ) : null}

              {/* Hardened Iframe */}
              <iframe
                key={`${mountInstanceId}-${mountKey}`}
                ref={iframeRef}
                src={src}
                srcDoc={src ? undefined : currentSrcDoc}
                title={title}
                sandbox={COMMUNITY_WIDGET_SANDBOX}
                className="h-[380px] w-full border-0 bg-slate-950"
                data-testid="mfe-sandbox-iframe"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Security Alerts Log */}
        {activeTab === 'alerts' && (
          <div className="space-y-3" data-testid="security-alerts-panel">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Security Violation Incidents ({securityAlerts.length})
              </h4>
              {securityAlerts.length > 0 && (
                <button
                  onClick={() => setSecurityAlerts([])}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear History
                </button>
              )}
            </div>

            {securityAlerts.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-slate-300">No Security Incidents Detected</p>
                <p className="text-xs text-slate-500 mt-1">
                  All messages have adhered to the strict RPC protocol and schema validations.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {securityAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-rose-800/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-200">
                          {alert.type}
                        </span>
                        <span className="text-slate-400">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <span className="font-semibold text-rose-400 uppercase text-[10px]">
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-slate-300">{alert.details}</p>
                    {alert.rawPayload ? (
                      <pre className="rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-400 overflow-x-auto">
                        {JSON.stringify(alert.rawPayload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: RPC Inspector / Telemetry Log */}
        {activeTab === 'rpcLogs' && (
          <div className="space-y-3" data-testid="rpc-telemetry-panel">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                postMessage RPC Telemetry ({rpcLogs.length} events)
              </h4>
              {rpcLogs.length > 0 && (
                <button onClick={() => setRpcLogs([])} className="text-xs text-slate-400 hover:text-slate-200">
                  Clear Log
                </button>
              )}
            </div>

            {rpcLogs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
                <Terminal className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-400">Waiting for RPC Messages</p>
                <p className="text-xs text-slate-500 mt-1">
                  Bidirectional messages exchanged across the postMessage bridge will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {rpcLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-lg border p-2.5 font-mono text-xs ${
                      log.status === 'blocked'
                        ? 'border-rose-900 bg-rose-950/30 text-rose-200'
                        : log.status === 'error'
                        ? 'border-amber-900 bg-amber-950/30 text-amber-200'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.2 font-bold uppercase text-[9px] ${
                            log.direction === 'inbound'
                              ? 'bg-sky-900/60 text-sky-300'
                              : 'bg-emerald-900/60 text-emerald-300'
                          }`}
                        >
                          {log.direction}
                        </span>
                        <span className="font-semibold text-slate-200">{log.method || 'message'}</span>
                      </div>
                      <span className="text-slate-500">{log.timestamp}</span>
                    </div>
                    <pre className="text-[11px] overflow-x-auto text-slate-400">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Specs Footer */}
      <div className="border-t border-slate-800 bg-slate-950/80 px-5 py-3 text-xs text-slate-400">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>Storage Isolation:</strong> Parent localStorage & cookies unreachable
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>Wallet Projection:</strong> Read-only public info; signer quarantined
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>Protocol:</strong> Typed JSON-RPC 2.0 with Zod schema enforcement
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WidgetSandbox;
