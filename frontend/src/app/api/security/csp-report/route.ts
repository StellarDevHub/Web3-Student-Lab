import { NextResponse } from 'next/server';

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLogValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[?#].*$/, '').slice(0, 512);
}

function reportDetails(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const body = isRecord(value['csp-report'])
    ? value['csp-report']
    : isRecord(value.body)
      ? value.body
      : value;

  return {
    documentUri: safeLogValue(body['document-uri'] ?? body.documentURL),
    blockedUri: safeLogValue(body['blocked-uri'] ?? body.blockedURL),
    violatedDirective: safeLogValue(body['violated-directive'] ?? body.violatedDirective),
    effectiveDirective: safeLogValue(body['effective-directive'] ?? body.effectiveDirective),
    sourceFile: safeLogValue(body['source-file'] ?? body.sourceFile),
    lineNumber: typeof (body['line-number'] ?? body.lineNumber) === 'number'
      ? body['line-number'] ?? body.lineNumber
      : undefined,
    columnNumber: typeof (body['column-number'] ?? body.columnNumber) === 'number'
      ? body['column-number'] ?? body.columnNumber
      : undefined,
  };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REPORT_BYTES) {
      await reader.cancel();
      return new NextResponse(null, { status: 413 });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const reports = Array.isArray(payload) ? payload.slice(0, MAX_REPORTS_PER_REQUEST) : [payload];
  const details = reports.map(reportDetails).filter((report): report is JsonRecord => report !== null);
  if (details.length === 0) return new NextResponse(null, { status: 400 });

  for (const detail of details) {
    console.warn('CSP violation reported', detail);
  }

  return new NextResponse(null, { status: 204 });
}
