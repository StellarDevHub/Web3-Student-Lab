import crypto from 'node:crypto';
import type { EmailMessage } from '../services/emailService.js';

function signAwsV4Request(options: {
  method: string;
  url: string;
  headers: Record<string, string>;
  payload: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}): Record<string, string> {
  const { method, url, headers, payload, accessKeyId, secretAccessKey, sessionToken, region, service } = options;
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const host = parsedUrl.host;

  const signedHeaders: Record<string, string> = {
    ...headers,
    host,
    'x-amz-date': amzDate,
  };

  if (sessionToken) {
    signedHeaders['x-amz-security-token'] = sessionToken;
  }

  const headerEntries = Object.entries(signedHeaders)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  const canonicalHeaders = headerEntries
    .map(([key, value]) => `${key}:${value.replace(/\s+/g, ' ').trim()}\n`)
    .join('');
  const signedHeaderNames = headerEntries.map(([key]) => key).join(';');
  const canonicalQuery = Array.from(parsedUrl.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames,
    sha256Hex(payload),
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  signedHeaders.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;
  return signedHeaders;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

export async function sendWithSes(message: EmailMessage, region: string): Promise<void> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS SES credentials are not configured');
  }

  const payload = JSON.stringify({
    FromEmailAddress: process.env.EMAIL_FROM || 'noreply@web3studentlab.example',
    Destination: { ToAddresses: [message.to] },
    Content: {
      Simple: {
        Subject: { Data: message.subject },
        Body: { Html: { Data: message.html } },
      },
    },
  });

  const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const signedHeaders = signAwsV4Request({
    method: 'POST',
    url: endpoint,
    headers: { 'Content-Type': 'application/json' },
    payload,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    service: 'email',
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: signedHeaders,
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`SES delivery failed with status ${response.status}`);
  }
}