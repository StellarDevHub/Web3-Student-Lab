import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOTAL_BUDGET_MS = 1_450;
const PER_GATEWAY_TIMEOUT_MS = 450;
const MAX_IMAGE_BYTES = 10_000_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

// Process-local guardrail. The upstream gateway should also enforce limits.
const requestLog = new Map<string, number[]>();

function isValidCid(value: string): boolean {
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(value) || /^b[a-z2-7]{20,}$/i.test(value);
}

function isAllowedImageType(value: string | null): boolean {
  return Boolean(value && /^image\/(avif|webp|png|jpeg|gif|apng)$/i.test(value.split(';')[0].trim()));
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function allowRequest(key: string, now = Date.now()): boolean {
  const recent = (requestLog.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestLog.set(key, recent);
    return false;
  }
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5_000) {
    for (const [entry, timestamps] of requestLog) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_WINDOW_MS)) requestLog.delete(entry);
    }
  }
  return true;
}

function signedPrivateGatewayUrl(base: string, path: string): string {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  const secret = process.env.IPFS_GATEWAY_SIGNING_SECRET;
  if (secret) {
    const expires = Math.floor(Date.now() / 1_000) + 60;
    const signature = createHmac('sha256', secret).update(`${url.pathname}:${expires}`).digest('hex');
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', signature);
  }
  return url.toString();
}

async function readLimitedBody(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new Error('Gateway returned an empty response body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('IPFS image exceeds the configured size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function getGateways(path: string): Array<{ url: string; token?: string; private: boolean }> {
  const configuredPrivate = process.env.IPFS_PRIVATE_GATEWAY_URL;
  const configuredPublic = (process.env.IPFS_PUBLIC_GATEWAYS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const gateways: Array<{ url: string; token?: string; private: boolean }> = [];

  if (configuredPrivate && isHttpsUrl(configuredPrivate)) {
    gateways.push({
      url: signedPrivateGatewayUrl(configuredPrivate, path),
      token: process.env.IPFS_PRIVATE_GATEWAY_TOKEN,
      private: true,
    });
  }

  const publicGateways = [
    ...configuredPublic,
    'https://dweb.link/ipfs/',
    'https://ipfs.io/ipfs/',
  ];
  for (const base of publicGateways) {
    if (!isHttpsUrl(base)) continue;
    gateways.push({ url: new URL(path, base.endsWith('/') ? base : `${base}/`).toString(), private: false });
  }
  return gateways;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: 'An IPFS CID is required.' }, { status: 400 });
  }

  let decoded: string[];
  try {
    decoded = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return NextResponse.json({ error: 'Invalid IPFS path encoding.' }, { status: 400 });
  }
  const [cid, ...subpath] = decoded;
  if (!isValidCid(cid) || decoded.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('/'))) {
    return NextResponse.json({ error: 'Invalid IPFS path.' }, { status: 400 });
  }

  const clientKey = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!allowRequest(clientKey)) {
    return NextResponse.json({ error: 'Too many image requests.' }, {
      status: 429,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }

  const path = `ipfs/${[cid, ...subpath].map(encodeURIComponent).join('/')}`;
  const startedAt = Date.now();
  const gateways = getGateways(path);
  let lastStatus = 502;

  for (const gateway of gateways) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 0) break;

    try {
      const headers = new Headers({ Accept: 'image/avif,image/webp,image/*;q=0.8' });
      if (gateway.token) headers.set('Authorization', `Bearer ${gateway.token}`);
      const response = await fetch(gateway.url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(Math.min(PER_GATEWAY_TIMEOUT_MS, remaining)),
        cache: 'no-store',
      });
      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }

      const contentType = response.headers.get('content-type');
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (!isAllowedImageType(contentType) || (contentLength > MAX_IMAGE_BYTES)) {
        lastStatus = 415;
        continue;
      }

      const bytes = await readLimitedBody(response, MAX_IMAGE_BYTES);
      if (bytes.byteLength === 0) {
        lastStatus = 413;
        continue;
      }

      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': contentType!.split(';')[0],
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          'X-Content-Type-Options': 'nosniff',
          'Vary': 'Accept',
        },
      });
    } catch {
      // A timeout or unavailable mirror advances to the next gateway.
    }
  }

  return NextResponse.json(
    { error: 'The requested IPFS image is temporarily unavailable.' },
    { status: lastStatus, headers: { 'Cache-Control': 'no-store' } },
  );
}
