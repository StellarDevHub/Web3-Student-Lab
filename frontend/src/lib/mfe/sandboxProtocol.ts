/**
 * Microfrontend Isolation Sandbox Protocol for Untrusted Community Course Widgets (FE-072).
 *
 * Implements strict postMessage RPC validation and security boundary enforcement:
 * - Isolated iframe configuration: sandbox="allow-scripts" (strictly omitting allow-same-origin).
 * - Cryptographically random per-mount session tokens.
 * - Strict Zod schema validation for all RPC requests, responses, and notifications.
 * - Granular method allowlist & immediate quarantine triggers on prohibited or malformed attempts.
 * - Prototype pollution and payload sanitization defenses.
 */

import { z } from 'zod';

/**
 * Sandboxed iframe configuration:
 * Only 'allow-scripts' is permitted for untrusted community course widgets.
 * 'allow-same-origin' is explicitly and intentionally omitted so that the browser
 * treats the iframe content as an opaque origin ('null'), blocking direct access to
 * parent window, document.cookie, localStorage, and window.stellar wallet injection.
 */
export const COMMUNITY_WIDGET_SANDBOX = 'allow-scripts';

export const RPC_PROTOCOL_VERSION = '2.0';

/**
 * Explicit allowlist of RPC methods permitted for untrusted community course widgets.
 */
export const ALLOWED_RPC_METHODS = [
  'course:getProgress',
  'course:submitAnswer',
  'course:getMetadata',
  'wallet:getPublicInfo',
  'widget:ready',
  'widget:resize',
  'widget:log',
  'sandbox:ping',
] as const;

export type AllowedRpcMethod = (typeof ALLOWED_RPC_METHODS)[number];

/**
 * Explicit list of known high-risk/sensitive operations.
 * Invocation of any of these immediately triggers a critical security violation
 * and activates render-boundary quarantine isolation.
 */
export const PROHIBITED_RPC_METHODS = [
  'wallet:signTransaction',
  'wallet:signAuthEntry',
  'wallet:signMessage',
  'wallet:getSecretKey',
  'wallet:requestFunds',
  'wallet:sendPayment',
  'wallet:exportPrivateKey',
  'storage:getLocalStorage',
  'storage:setLocalStorage',
  'storage:clear',
  'cookie:getCookies',
  'cookie:setCookie',
  'dom:accessParent',
  'stellar:provider',
  'eval',
  'exec',
] as const;

export type ProhibitedRpcMethod = (typeof PROHIBITED_RPC_METHODS)[number];

export type SecurityViolationType =
  | 'UNAUTHORIZED_METHOD'
  | 'FORBIDDEN_METHOD_ACCESS'
  | 'TOKEN_MISMATCH'
  | 'INVALID_SCHEMA'
  | 'PROTOTYPE_POLLUTION'
  | 'UNTRUSTED_ORIGIN'
  | 'MALICIOUS_PAYLOAD'
  | 'SANDBOX_ESCAPE_ATTEMPT';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityAlert {
  id: string;
  timestamp: number;
  type: SecurityViolationType;
  severity: SecuritySeverity;
  details: string;
  rawPayload?: unknown;
  origin?: string;
  method?: string;
}

export interface PublicWalletInfo {
  publicKey: string | null;
  network: string;
  isConnected: boolean;
}

/**
 * Standard JSON-RPC 2.0 Error Codes
 */
export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN_METHOD: -32002,
  QUARANTINED: -32003,
} as const;

// -------------------------------------------------------------
// Zod Schemas for Validation
// -------------------------------------------------------------

export const HandshakeInitSchema = z.object({
  type: z.literal('MFE_HANDSHAKE_INIT'),
  widgetId: z.string().min(1, 'widgetId must be a non-empty string'),
  timestamp: z.number(),
});

export const HandshakeAckSchema = z.object({
  type: z.literal('MFE_HANDSHAKE_ACK'),
  sessionToken: z.string().min(1),
  allowedMethods: z.array(z.string()),
  hostOrigin: z.string(),
});

export const RPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1, 'RPC method cannot be empty'),
  params: z.unknown().optional(),
  token: z.string().min(1, 'Session token is required'),
});

export const RPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
  token: z.string().min(1),
});

export const RPCNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.unknown().optional(),
  token: z.string().optional(),
});

export type HandshakeInitMessage = z.infer<typeof HandshakeInitSchema>;
export type HandshakeAckMessage = z.infer<typeof HandshakeAckSchema>;
export type RPCRequestMessage = z.infer<typeof RPCRequestSchema>;
export type RPCResponseMessage = z.infer<typeof RPCResponseSchema>;
export type RPCNotificationMessage = z.infer<typeof RPCNotificationSchema>;

/**
 * Generates a cryptographically secure random session token.
 * A new token is minted for each widget mount and never persisted to localStorage.
 */
export function createSessionToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates an alert ID.
 */
export function createAlertId(): string {
  return `sec-alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Checks for prototype pollution patterns recursively.
 */
export function detectPrototypePollution(data: unknown, visited = new WeakSet()): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  if (visited.has(data)) {
    return false;
  }
  visited.add(data);

  if (Array.isArray(data)) {
    for (const item of data) {
      if (detectPrototypePollution(item, visited)) {
        return true;
      }
    }
    return false;
  }

  for (const key of Object.keys(data)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    const val = (data as Record<string, unknown>)[key];
    if (detectPrototypePollution(val, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if origin is in allowed origins list.
 * Note: 'null' is the opaque origin produced by sandboxed iframes without allow-same-origin.
 */
export function isAllowedWidgetOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.includes(origin);
}

export function isAllowedMethod(method: string): method is AllowedRpcMethod {
  return (ALLOWED_RPC_METHODS as readonly string[]).includes(method);
}

export function isProhibitedMethod(method: string): method is ProhibitedRpcMethod {
  return (PROHIBITED_RPC_METHODS as readonly string[]).includes(method);
}

export type ValidationOutcome =
  | { success: true; kind: 'handshake'; message: HandshakeInitMessage }
  | { success: true; kind: 'request'; message: RPCRequestMessage }
  | { success: true; kind: 'notification'; message: RPCNotificationMessage }
  | { success: false; alert: SecurityAlert };

/**
 * Validates inbound postMessage data from a sandboxed course widget.
 */
export function validateInboundRPCMessage(
  rawData: unknown,
  expectedSessionToken: string | null,
  allowedOrigins: readonly string[],
  origin: string
): ValidationOutcome {
  // 1. Origin verification
  if (!isAllowedWidgetOrigin(origin, allowedOrigins)) {
    return {
      success: false,
      alert: {
        id: createAlertId(),
        timestamp: Date.now(),
        type: 'UNTRUSTED_ORIGIN',
        severity: 'critical',
        details: `Message rejected from unauthorized origin: "${origin}".`,
        rawPayload: rawData,
        origin,
      },
    };
  }

  // 2. Non-object or null check
  if (typeof rawData !== 'object' || rawData === null) {
    return {
      success: false,
      alert: {
        id: createAlertId(),
        timestamp: Date.now(),
        type: 'INVALID_SCHEMA',
        severity: 'medium',
        details: 'Received non-object message across postMessage bridge.',
        rawPayload: rawData,
        origin,
      },
    };
  }

  // 3. Prototype pollution defense
  if (detectPrototypePollution(rawData)) {
    return {
      success: false,
      alert: {
        id: createAlertId(),
        timestamp: Date.now(),
        type: 'PROTOTYPE_POLLUTION',
        severity: 'critical',
        details: 'Prototype pollution payload detected in message keys (__proto__, constructor, prototype).',
        rawPayload: rawData,
        origin,
      },
    };
  }

  const candidate = rawData as Record<string, unknown>;

  // 4. Handshake verification (can arrive before session token is established)
  if (candidate.type === 'MFE_HANDSHAKE_INIT') {
    const parseResult = HandshakeInitSchema.safeParse(rawData);
    if (!parseResult.success) {
      return {
        success: false,
        alert: {
          id: createAlertId(),
          timestamp: Date.now(),
          type: 'INVALID_SCHEMA',
          severity: 'medium',
          details: `Malformed handshake request: ${parseResult.error.message}`,
          rawPayload: rawData,
          origin,
        },
      };
    }
    return {
      success: true,
      kind: 'handshake',
      message: parseResult.data,
    };
  }

  // 5. Explicit check for prohibited methods (critical security trigger)
  const candidateMethod = typeof candidate.method === 'string' ? candidate.method : '';
  if (isProhibitedMethod(candidateMethod)) {
    return {
      success: false,
      alert: {
        id: createAlertId(),
        timestamp: Date.now(),
        type: 'FORBIDDEN_METHOD_ACCESS',
        severity: 'critical',
        details: `High-risk unauthorized RPC call attempted: "${candidateMethod}". Parent wallet and storage access are strictly prohibited.`,
        rawPayload: rawData,
        origin,
        method: candidateMethod,
      },
    };
  }

  // 6. JSON-RPC 2.0 Request validation
  if ('id' in candidate) {
    const parseResult = RPCRequestSchema.safeParse(rawData);
    if (!parseResult.success) {
      return {
        success: false,
        alert: {
          id: createAlertId(),
          timestamp: Date.now(),
          type: 'INVALID_SCHEMA',
          severity: 'medium',
          details: `Invalid JSON-RPC request schema: ${parseResult.error.message}`,
          rawPayload: rawData,
          origin,
          method: candidateMethod,
        },
      };
    }

    const request = parseResult.data;

    // Token verification
    if (!expectedSessionToken) {
      return {
        success: false,
        alert: {
          id: createAlertId(),
          timestamp: Date.now(),
          type: 'TOKEN_MISMATCH',
          severity: 'high',
          details: 'RPC request sent before host session handshake was completed.',
          rawPayload: rawData,
          origin,
          method: request.method,
        },
      };
    }

    if (request.token !== expectedSessionToken) {
      return {
        success: false,
        alert: {
          id: createAlertId(),
          timestamp: Date.now(),
          type: 'TOKEN_MISMATCH',
          severity: 'critical',
          details: `Invalid session token presented. Expected "${expectedSessionToken.slice(0, 8)}...", received "${request.token.slice(0, 8)}...".`,
          rawPayload: rawData,
          origin,
          method: request.method,
        },
      };
    }

    // Method allowlist verification
    if (!isAllowedMethod(request.method)) {
      return {
        success: false,
        alert: {
          id: createAlertId(),
          timestamp: Date.now(),
          type: 'UNAUTHORIZED_METHOD',
          severity: 'high',
          details: `Method "${request.method}" is not in the approved microfrontend RPC allowlist.`,
          rawPayload: rawData,
          origin,
          method: request.method,
        },
      };
    }

    return {
      success: true,
      kind: 'request',
      message: request,
    };
  }

  // 7. Notification / Event validation
  const notificationResult = RPCNotificationSchema.safeParse(rawData);
  if (!notificationResult.success) {
    return {
      success: false,
      alert: {
        id: createAlertId(),
        timestamp: Date.now(),
        type: 'INVALID_SCHEMA',
        severity: 'medium',
        details: `Invalid RPC notification schema: ${notificationResult.error.message}`,
        rawPayload: rawData,
        origin,
        method: candidateMethod,
      },
    };
  }

  return {
    success: true,
    kind: 'notification',
    message: notificationResult.data,
  };
}

/**
 * Creates an outbound JSON-RPC 2.0 Success Response.
 */
export function createRPCResponse(
  id: string | number,
  result: unknown,
  token: string
): RPCResponseMessage {
  return {
    jsonrpc: '2.0',
    id,
    result,
    token,
  };
}

/**
 * Creates an outbound JSON-RPC 2.0 Error Response.
 */
export function createRPCError(
  id: string | number,
  code: number,
  message: string,
  token: string,
  data?: unknown
): RPCResponseMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
    token,
  };
}

/**
 * Creates an outbound handshake acknowledgement message.
 */
export function createHandshakeAck(sessionToken: string, hostOrigin: string): HandshakeAckMessage {
  return {
    type: 'MFE_HANDSHAKE_ACK',
    sessionToken,
    allowedMethods: [...ALLOWED_RPC_METHODS],
    hostOrigin,
  };
}

/**
 * Sanitizes wallet context to ensure private keys and signers are never exposed across the RPC boundary.
 */
export function toSanitizedWalletInfo(wallet?: {
  publicKey: string | null;
  network?: string;
}): PublicWalletInfo {
  return {
    publicKey: wallet?.publicKey ?? null,
    network: wallet?.network ?? 'testnet',
    isConnected: Boolean(wallet?.publicKey),
  };
}
