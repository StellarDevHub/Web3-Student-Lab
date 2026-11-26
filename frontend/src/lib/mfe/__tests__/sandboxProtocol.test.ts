import { describe, expect, it } from 'vitest';

import {
  ALLOWED_RPC_METHODS,
  COMMUNITY_WIDGET_SANDBOX,
  PROHIBITED_RPC_METHODS,
  RPC_PROTOCOL_VERSION,
  createHandshakeAck,
  createRPCError,
  createRPCResponse,
  createSessionToken,
  detectPrototypePollution,
  isAllowedMethod,
  isAllowedWidgetOrigin,
  isProhibitedMethod,
  toSanitizedWalletInfo,
  validateInboundRPCMessage,
} from '../sandboxProtocol';

describe('sandboxProtocol - Sandbox Attribute Configuration', () => {
  it('strictly sets sandbox to allow-scripts and omits allow-same-origin', () => {
    expect(COMMUNITY_WIDGET_SANDBOX).toBe('allow-scripts');
    expect(COMMUNITY_WIDGET_SANDBOX).not.toContain('allow-same-origin');
    expect(COMMUNITY_WIDGET_SANDBOX).not.toContain('allow-top-navigation');
    expect(COMMUNITY_WIDGET_SANDBOX).not.toContain('allow-popups');
  });
});

describe('sandboxProtocol - createSessionToken', () => {
  it('generates a 32-character hexadecimal token', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates distinct cryptographic tokens on each invocation', () => {
    const tokenSet = new Set(Array.from({ length: 50 }, () => createSessionToken()));
    expect(tokenSet.size).toBe(50);
  });
});

describe('sandboxProtocol - detectPrototypePollution', () => {
  it('detects __proto__ pollution', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(detectPrototypePollution(evil)).toBe(true);
  });

  it('detects constructor pollution in nested objects', () => {
    const evil = { safe: { constructor: 'bad' } };
    expect(detectPrototypePollution(evil)).toBe(true);
  });

  it('detects prototype pollution in arrays', () => {
    const evil = [1, { prototype: 'evil' }, 3];
    expect(detectPrototypePollution(evil)).toBe(true);
  });

  it('returns false for clean objects and arrays', () => {
    const clean = { courseId: 'soroban-101', questionId: 'q1', answer: 'persistent' };
    expect(detectPrototypePollution(clean)).toBe(false);
    expect(detectPrototypePollution([1, 2, 'hello', null])).toBe(false);
  });
});

describe('sandboxProtocol - isAllowedWidgetOrigin', () => {
  it('permits explicitly allowed origins including opaque null', () => {
    expect(isAllowedWidgetOrigin('null', ['null'])).toBe(true);
    expect(isAllowedWidgetOrigin('https://course-widget.example.com', ['https://course-widget.example.com'])).toBe(true);
  });

  it('rejects untrusted or unexpected origins', () => {
    expect(isAllowedWidgetOrigin('https://attacker.evil.com', ['null', 'https://course-widget.example.com'])).toBe(false);
  });
});

describe('sandboxProtocol - isAllowedMethod and isProhibitedMethod', () => {
  it('identifies allowed RPC methods', () => {
    expect(isAllowedMethod('course:getProgress')).toBe(true);
    expect(isAllowedMethod('course:submitAnswer')).toBe(true);
    expect(isAllowedMethod('wallet:getPublicInfo')).toBe(true);
    expect(isAllowedMethod('sandbox:ping')).toBe(true);
    expect(isAllowedMethod('malicious:attack')).toBe(false);
  });

  it('identifies prohibited high-risk methods', () => {
    expect(isProhibitedMethod('wallet:signTransaction')).toBe(true);
    expect(isProhibitedMethod('wallet:getSecretKey')).toBe(true);
    expect(isProhibitedMethod('storage:getLocalStorage')).toBe(true);
    expect(isProhibitedMethod('cookie:getCookies')).toBe(true);
    expect(isProhibitedMethod('course:getProgress')).toBe(false);
  });
});

describe('sandboxProtocol - validateInboundRPCMessage', () => {
  const allowedOrigins = ['null', 'https://trusted-partner.edu'];
  const validToken = 'abcdef0123456789abcdef0123456789';

  it('rejects messages originating from unauthorized origins', () => {
    const result = validateInboundRPCMessage({ type: 'MFE_HANDSHAKE_INIT' }, null, allowedOrigins, 'https://hacker.io');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('UNTRUSTED_ORIGIN');
      expect(result.alert.severity).toBe('critical');
    }
  });

  it('rejects non-object or null messages', () => {
    const result = validateInboundRPCMessage('plain-string', null, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('INVALID_SCHEMA');
    }
  });

  it('rejects prototype pollution attempts immediately with critical severity', () => {
    const evilPayload = JSON.parse('{"__proto__": {"isAdmin": true}, "method": "widget:log"}');
    const result = validateInboundRPCMessage(evilPayload, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('PROTOTYPE_POLLUTION');
      expect(result.alert.severity).toBe('critical');
    }
  });

  it('validates and accepts legitimate handshake initialization', () => {
    const handshake = {
      type: 'MFE_HANDSHAKE_INIT',
      widgetId: 'course-soroban-quiz-1',
      timestamp: Date.now(),
    };
    const result = validateInboundRPCMessage(handshake, null, allowedOrigins, 'null');
    expect(result.success).toBe(true);
    if (result.success && result.kind === 'handshake') {
      expect(result.kind).toBe('handshake');
      expect(result.message.widgetId).toBe('course-soroban-quiz-1');
    }
  });

  it('intercepts prohibited wallet signing calls with critical security violation', () => {
    const exploitMsg = {
      jsonrpc: '2.0',
      id: 'attack-1',
      method: 'wallet:signTransaction',
      params: { destination: 'GATTACKER' },
      token: validToken,
    };
    const result = validateInboundRPCMessage(exploitMsg, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('FORBIDDEN_METHOD_ACCESS');
      expect(result.alert.severity).toBe('critical');
      expect(result.alert.method).toBe('wallet:signTransaction');
    }
  });

  it('intercepts localStorage probing calls with critical security violation', () => {
    const exploitMsg = {
      jsonrpc: '2.0',
      id: 'attack-storage',
      method: 'storage:getLocalStorage',
      params: { key: 'secret_key' },
      token: validToken,
    };
    const result = validateInboundRPCMessage(exploitMsg, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('FORBIDDEN_METHOD_ACCESS');
      expect(result.alert.severity).toBe('critical');
    }
  });

  it('rejects requests sent before a session token has been established', () => {
    const msg = {
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'course:getProgress',
      token: 'some-arbitrary-token',
    };
    const result = validateInboundRPCMessage(msg, null, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('TOKEN_MISMATCH');
      expect(result.alert.severity).toBe('high');
    }
  });

  it('rejects requests carrying invalid or counterfeit session tokens', () => {
    const msg = {
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'course:getProgress',
      token: 'counterfeit-token-1234567890',
    };
    const result = validateInboundRPCMessage(msg, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('TOKEN_MISMATCH');
      expect(result.alert.severity).toBe('critical');
    }
  });

  it('rejects unapproved methods not on the RPC allowlist', () => {
    const msg = {
      jsonrpc: '2.0',
      id: 'req-2',
      method: 'unknown:secretAction',
      token: validToken,
    };
    const result = validateInboundRPCMessage(msg, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.alert.type).toBe('UNAUTHORIZED_METHOD');
      expect(result.alert.severity).toBe('high');
    }
  });

  it('successfully validates authorized RPC requests', () => {
    const msg = {
      jsonrpc: '2.0',
      id: 'req-3',
      method: 'course:submitAnswer',
      params: { courseId: 'soroban-101', questionId: 'q1', answer: 'persistent' },
      token: validToken,
    };
    const result = validateInboundRPCMessage(msg, validToken, allowedOrigins, 'null');
    expect(result.success).toBe(true);
    if (result.success && result.kind === 'request') {
      expect(result.kind).toBe('request');
      expect(result.message.method).toBe('course:submitAnswer');
    }
  });
});

describe('sandboxProtocol - Outbound Message Builders & Sanitizers', () => {
  it('creates valid JSON-RPC 2.0 success responses with token', () => {
    const res = createRPCResponse('req-10', { score: 100 }, 'token-xyz');
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 'req-10',
      result: { score: 100 },
      token: 'token-xyz',
    });
  });

  it('creates valid JSON-RPC 2.0 error responses with code and token', () => {
    const errRes = createRPCError('req-11', -32601, 'Method not found', 'token-xyz');
    expect(errRes.jsonrpc).toBe('2.0');
    expect(errRes.error?.code).toBe(-32601);
    expect(errRes.error?.message).toBe('Method not found');
    expect(errRes.token).toBe('token-xyz');
  });

  it('creates handshake acknowledgement with allowed methods and origin', () => {
    const ack = createHandshakeAck('tok-1', 'https://studentlab.stellar.org');
    expect(ack.type).toBe('MFE_HANDSHAKE_ACK');
    expect(ack.sessionToken).toBe('tok-1');
    expect(ack.allowedMethods).toEqual(ALLOWED_RPC_METHODS);
    expect(ack.hostOrigin).toBe('https://studentlab.stellar.org');
  });

  it('sanitizes wallet context to expose only read-only public projection', () => {
    const fullWallet = {
      publicKey: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGAAAARZ62VGVIUBUR5',
      network: 'testnet',
      secretKey: 'SDO_NOT_EXPOSE_SECRET_KEY',
      signTransaction: () => {},
    };
    const sanitized = toSanitizedWalletInfo(fullWallet);
    expect(sanitized).toEqual({
      publicKey: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGAAAARZ62VGVIUBUR5',
      network: 'testnet',
      isConnected: true,
    });
    expect((sanitized as Record<string, unknown>).secretKey).toBeUndefined();
    expect((sanitized as Record<string, unknown>).signTransaction).toBeUndefined();
  });
});
