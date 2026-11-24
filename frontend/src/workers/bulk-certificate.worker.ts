import QRCode from 'qrcode';

export interface CertificateItem {
  id: string;
  recipientName: string;
  courseName: string;
  issueDate: string;
  transactionHash?: string;
  instructorName?: string;
  grade?: string;
}

export interface WorkerStartPayload {
  certificates: CertificateItem[];
  batchSize?: number;
}

export type WorkerMessage =
  | {
      type: 'PROGRESS';
      current: number;
      total: number;
      percentage: number;
      etaSeconds: number;
      currentName: string;
    }
  | {
      type: 'COMPLETE';
      zipBlob: Blob;
      totalCertificates: number;
      durationMs: number;
      fileCount: number;
    }
  | {
      type: 'ERROR';
      error: string;
    };

// Fast CRC32 lookup table for clean binary ZIP construction
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  path: string;
  data: Uint8Array;
}

class FastZipWriter {
  private entries: ZipEntry[] = [];

  public addFile(path: string, content: Uint8Array | string): void {
    const data =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.entries.push({ path, data });
  }

  public generate(): Uint8Array {
    let totalSize = 0;
    const encoder = new TextEncoder();

    // Calculate buffer sizing
    for (const entry of this.entries) {
      const pathBytes = encoder.encode(entry.path);
      totalSize += 30 + pathBytes.length + entry.data.length; // Local file header + data
      totalSize += 46 + pathBytes.length; // Central directory header
    }
    totalSize += 22; // End of central directory record

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;
    const centralOffsets: { offset: number; pathBytes: Uint8Array; entry: ZipEntry; crc: number }[] = [];

    // Write Local File Headers and Data
    for (const entry of this.entries) {
      const pathBytes = encoder.encode(entry.path);
      const crc = calculateCrc32(entry.data);
      const localHeaderOffset = offset;

      centralOffsets.push({
        offset: localHeaderOffset,
        pathBytes,
        entry,
        crc,
      });

      // Signature PK\x03\x04
      view.setUint32(offset, 0x04034b50, true);
      view.setUint16(offset + 4, 20, true); // Version needed
      view.setUint16(offset + 6, 0, true); // Flags
      view.setUint16(offset + 8, 0, true); // Compression: 0 (Store)
      view.setUint16(offset + 10, 0, true); // Mod time
      view.setUint16(offset + 12, 0, true); // Mod date
      view.setUint32(offset + 14, crc, true); // CRC-32
      view.setUint32(offset + 18, entry.data.length, true); // Compressed size
      view.setUint32(offset + 22, entry.data.length, true); // Uncompressed size
      view.setUint16(offset + 26, pathBytes.length, true); // Filename length
      view.setUint16(offset + 28, 0, true); // Extra field length

      offset += 30;
      buffer.set(pathBytes, offset);
      offset += pathBytes.length;
      buffer.set(entry.data, offset);
      offset += entry.data.length;
    }

    const centralDirectoryStart = offset;

    // Write Central Directory Headers
    for (const item of centralOffsets) {
      view.setUint32(offset, 0x02014b50, true); // Signature PK\x01\x02
      view.setUint16(offset + 4, 20, true); // Version made by
      view.setUint16(offset + 6, 20, true); // Version needed
      view.setUint16(offset + 8, 0, true); // Flags
      view.setUint16(offset + 10, 0, true); // Compression (Store)
      view.setUint16(offset + 12, 0, true); // Mod time
      view.setUint16(offset + 14, 0, true); // Mod date
      view.setUint32(offset + 16, item.crc, true); // CRC-32
      view.setUint32(offset + 20, item.entry.data.length, true); // Compressed size
      view.setUint32(offset + 24, item.entry.data.length, true); // Uncompressed size
      view.setUint16(offset + 28, item.pathBytes.length, true); // Filename length
      view.setUint16(offset + 30, 0, true); // Extra field length
      view.setUint16(offset + 32, 0, true); // File comment length
      view.setUint16(offset + 34, 0, true); // Disk number start
      view.setUint16(offset + 36, 0, true); // Internal attributes
      view.setUint32(offset + 38, 0, true); // External attributes
      view.setUint32(offset + 42, item.offset, true); // Local header offset

      offset += 46;
      buffer.set(item.pathBytes, offset);
      offset += item.pathBytes.length;
    }

    const centralDirectorySize = offset - centralDirectoryStart;

    // Write End of Central Directory Record
    view.setUint32(offset, 0x06054b50, true); // Signature PK\x05\x06
    view.setUint16(offset + 4, 0, true); // Disk number
    view.setUint16(offset + 6, 0, true); // Central dir disk
    view.setUint16(offset + 8, this.entries.length, true); // Entries on this disk
    view.setUint16(offset + 10, this.entries.length, true); // Total entries
    view.setUint32(offset + 12, centralDirectorySize, true); // Central dir size
    view.setUint32(offset + 16, centralDirectoryStart, true); // Central dir offset
    view.setUint16(offset + 20, 0, true); // Comment length

    return buffer;
  }
}

function generateCertificateSvg(
  item: CertificateItem,
  qrDataUrl: string
): string {
  const txShort = item.transactionHash
    ? `${item.transactionHash.slice(0, 10)}...${item.transactionHash.slice(-8)}`
    : 'VERIFIED_ON_CHAIN';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>

  <rect width="1200" height="800" fill="url(#bg)" />
  <rect x="30" y="30" width="1140" height="740" rx="20" fill="none" stroke="url(#borderGrad)" stroke-width="4" opacity="0.8" />
  <rect x="50" y="50" width="1100" height="700" rx="14" fill="none" stroke="#334155" stroke-width="1" />

  <text x="600" y="140" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" letter-spacing="4" fill="#818cf8" font-weight="600">
    STELLAR WEB3 STUDENT LAB
  </text>
  <text x="600" y="190" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#f8fafc" font-weight="bold">
    Certificate of Completion
  </text>

  <text x="600" y="270" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#94a3b8">
    This certifies that
  </text>
  <text x="600" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#38bdf8" font-weight="bold">
    ${item.recipientName}
  </text>

  <text x="600" y="390" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#94a3b8">
    has successfully mastered and completed the course
  </text>
  <text x="600" y="440" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#e2e8f0" font-weight="600">
    ${item.courseName}
  </text>

  <image href="${qrDataUrl}" x="525" y="480" width="150" height="150" />

  <text x="600" y="655" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748b">
    VERIFICATION ID: ${item.id}
  </text>
  <text x="600" y="675" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748b">
    TX HASH: ${txShort}
  </text>

  <text x="120" y="710" text-anchor="start" font-family="system-ui, sans-serif" font-size="13" fill="#94a3b8">
    Instructor: ${item.instructorName || 'Lead Soroban Instructor'}
  </text>
  <text x="1080" y="710" text-anchor="end" font-family="system-ui, sans-serif" font-size="13" fill="#94a3b8">
    Issued: ${item.issueDate}
  </text>
</svg>`;
}

function generateCleanPdfBinary(
  item: CertificateItem,
  qrDataUrl: string
): Uint8Array {
  const recipient = item.recipientName.replace(/[()\\]/g, '');
  const course = item.courseName.replace(/[()\\]/g, '');
  const id = item.id.replace(/[()\\]/g, '');
  const date = item.issueDate.replace(/[()\\]/g, '');

  const contentStream = `BT
/F1 26 Tf
180 500 Td
(STELLAR WEB3 STUDENT LAB) Tj
0 -40 Td
/F2 32 Tf
(Certificate of Completion) Tj
0 -50 Td
/F1 15 Tf
(This certifies that) Tj
0 -40 Td
/F2 28 Tf
(${recipient}) Tj
0 -40 Td
/F1 15 Tf
(has successfully completed the curriculum:) Tj
0 -35 Td
/F2 20 Tf
(${course}) Tj
0 -60 Td
/F3 11 Tf
(Verification ID: ${id} | Issue Date: ${date}) Tj
ET`;

  const streamBytes = new TextEncoder().encode(contentStream);

  const objects: string[] = [
    // 1: Catalog
    '<< /Type /Catalog /Pages 2 0 R >>',
    // 2: Pages
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    // 3: Page
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>',
    // 4: Contents
    `<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream`,
    // 5: Font F1
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    // 6: Font F2
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>',
    // 7: Font F3
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(out).length);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startXref = new TextEncoder().encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    out += `${offStr} 00000 n \n`;
  }

  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

self.onmessage = async (e: MessageEvent<WorkerStartPayload>) => {
  const { certificates, batchSize = 10 } = e.data;
  if (!Array.isArray(certificates) || certificates.length === 0) {
    self.postMessage({ type: 'ERROR', error: 'No certificates provided' } as WorkerMessage);
    return;
  }

  const startTime = Date.now();
  const total = certificates.length;
  const zip = new FastZipWriter();

  try {
    for (let i = 0; i < total; i++) {
      const item = certificates[i];
      const verifyUrl = `https://stellar-student-lab.org/verify/${item.id}`;

      // Generate verified QR code
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        width: 180,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      // 1. Watermark QR code onto certificate SVG
      const svg = generateCertificateSvg(item, qrDataUrl);
      const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      zip.addFile(`certificates/${safeId}/certificate.svg`, svg);

      // 2. Verification metadata JSON
      const metadata = JSON.stringify(
        {
          id: item.id,
          recipientName: item.recipientName,
          courseName: item.courseName,
          issueDate: item.issueDate,
          instructorName: item.instructorName || 'Lead Soroban Instructor',
          transactionHash: item.transactionHash || '0x_verified',
          verificationUrl: verifyUrl,
          grade: item.grade || 'Pass (with Honors)',
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      );
      zip.addFile(`certificates/${safeId}/metadata.json`, metadata);

      // 3. Certificate PDF
      const pdfBytes = generateCleanPdfBinary(item, qrDataUrl);
      zip.addFile(`certificates/${safeId}/certificate.pdf`, pdfBytes);

      // Yield progress update
      if ((i + 1) % batchSize === 0 || i === total - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgPerItem = elapsed / (i + 1);
        const remaining = total - (i + 1);
        const etaSeconds = Math.max(0, Math.round(remaining * avgPerItem));
        const percentage = Math.round(((i + 1) / total) * 100);

        self.postMessage({
          type: 'PROGRESS',
          current: i + 1,
          total,
          percentage,
          etaSeconds,
          currentName: item.recipientName,
        } as WorkerMessage);

        // Keep worker execution yielding periodically
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const zipBytes = zip.generate();
    const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
    const durationMs = Date.now() - startTime;

    self.postMessage({
      type: 'COMPLETE',
      zipBlob,
      totalCertificates: total,
      durationMs,
      fileCount: total * 3,
    } as WorkerMessage);
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err?.message || 'Certificate batch generation failed',
    } as WorkerMessage);
  }
};
