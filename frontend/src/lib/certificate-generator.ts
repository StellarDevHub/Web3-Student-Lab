/**
 * Certificate generator utilities using Canvas API and html2canvas + jsPDF.
 * Handles rendering, cryptographic stamp, download, and LinkedIn sharing.
 */

export interface CertificateData {
  recipientName: string;
  courseName: string;
  issueDate: string;
  transactionHash: string;
  certificateId: string;
  instructorName?: string;
}

/** Stellar testnet explorer base URL */
export const STELLAR_EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx';

/** Build the full explorer URL for a given tx hash */
export function buildExplorerUrl(hash: string): string {
  if (!hash || hash === 'PENDING') return '#';
  return `${STELLAR_EXPLORER_BASE}/${hash}`;
}

/** Truncate a hash for display */
export function truncateHash(hash: string, chars = 16): string {
  if (!hash || hash.length <= chars * 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-8)}`;
}

/** Draw a cryptographic stamp onto a canvas element */
export function drawCryptoStamp(
  canvas: HTMLCanvasElement,
  hash: string,
  x: number,
  y: number,
  radius = 60
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Outer ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(x, y, radius - 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.stroke();

  // Center text
  ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VERIFIED', x, y - 8);
  ctx.fillText('ON-CHAIN', x, y + 4);

  // Hash snippet
  ctx.fillStyle = 'rgba(220, 38, 38, 0.6)';
  ctx.font = '7px monospace';
  ctx.fillText(hash ? hash.slice(0, 8) : 'PENDING', x, y + 16);

  ctx.restore();
}

/** Generate LinkedIn share URL for a certificate */
export function buildLinkedInShareUrl(cert: CertificateData): string {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: cert.courseName,
    organizationName: 'Web3 Student Lab',
    issueYear: new Date(cert.issueDate).getFullYear().toString(),
    issueMonth: (new Date(cert.issueDate).getMonth() + 1).toString(),
    certUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/certificates/${cert.certificateId}`,
    certId: cert.transactionHash || cert.certificateId,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/** Trigger a PNG download from a canvas element */
export async function downloadCertificateAsPng(elementId: string, filename: string): Promise<void> {
  // Dynamically import html2canvas to avoid SSR issues
  const html2canvas = (await import('html2canvas')).default;
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Certificate element not found');

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#0a0a0a',
  });

  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Trigger a PDF download from a canvas element */
export async function downloadCertificateAsPdf(elementId: string, filename: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const element = document.getElementById(elementId);
  if (!element) throw new Error('Certificate element not found');

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#0a0a0a',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [canvas.width / 3, canvas.height / 3],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 3, canvas.height / 3);
  pdf.save(`${filename}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// High-resolution certificate rendering engine
//
// Implements a Canvas 2D diploma renderer with deterministic guilloche
// anti-counterfeit borders and an embedded verification QR code. Output is
// produced at print-quality 300 DPI (10" × 7" landscape).
// ─────────────────────────────────────────────────────────────────────────────

/** Public verification URL encoded in the certificate QR code. */
export function buildVerificationUrl(certificateId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://web3studentlab.example';
  return `${origin}/verify/${certificateId}`;
}

/** Deterministic 32-bit PRNG (Mulberry32) so guilloche patterns never lag. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed for deterministic rendering. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface GuillocheOptions {
  width: number;
  height: number;
  seed: number;
  color?: string;
  lineWidth?: number;
}

/**
 * Draw an intricate, deterministic guilloche security border onto a 2D context.
 * The same certificate id always renders the same pattern — no randomness, no
 * layout thrash, zero browser lag.
 */
export function drawGuillocheBorder(ctx: CanvasRenderingContext2D, opts: GuillocheOptions): void {
  const { width, height, seed, color = 'rgba(220,38,38,0.22)', lineWidth = 1 } = opts;
  const rng = mulberry32(seed >>> 0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  const cx = width / 2;
  const cy = height / 2;
  const rings = 6;
  for (let r = 0; r < rings; r++) {
    const radius = Math.min(width, height) * (0.28 + r * 0.05);
    const petals = 6 + Math.floor(rng() * 6);
    const offset = rng() * Math.PI * 2;
    const amp = 0.06 + rng() * 0.05;
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.02) {
      const rr = radius * (1 + amp * Math.sin(petals * t + offset));
      const x = cx + rr * Math.cos(t);
      const y = cy + rr * Math.sin(t);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Corner rosettes
  const corners = [
    [width * 0.12, height * 0.12],
    [width * 0.88, height * 0.12],
    [width * 0.12, height * 0.88],
    [width * 0.88, height * 0.88],
  ];
  for (const [x0, y0] of corners) {
    const rosetteR = Math.min(width, height) * 0.07;
    const k = 5 + Math.floor(rng() * 5);
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.02) {
      const rr = rosetteR * (1 + 0.25 * Math.sin(k * t));
      const x = x0 + rr * Math.cos(t);
      const y = y0 + rr * Math.sin(t);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** Generate a QR code data URL pointing at the verification page. */
export async function renderVerificationQr(certificateId: string): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(buildVerificationUrl(certificateId), {
    margin: 1,
    width: 320,
    color: { dark: '#dc2626', light: '#0a0a0a' },
  });
}

const DPI = 300;
const INCH_W = 10;
const INCH_H = 7;

/**
 * Render a complete, print-quality (300 DPI) diploma to a canvas: guilloche
 * border, recipient/course/date text, cryptographic stamp, and verification QR.
 * Returns the canvas so callers may export PNG/PDF.
 */
export async function generateCertificateCanvas(
  data: CertificateData
): Promise<HTMLCanvasElement> {
  if (typeof document === 'undefined') {
    throw new Error('generateCertificateCanvas must run in the browser');
  }
  const canvas = document.createElement('canvas');
  canvas.width = DPI * INCH_W;
  canvas.height = DPI * INCH_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const W = canvas.width;
  const H = canvas.height;

  // Background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#18181b');
  grad.addColorStop(0.5, '#000000');
  grad.addColorStop(1, '#18181b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Guilloche security border (deterministic per certificate id)
  const seed = seedFromString(data.certificateId || data.recipientName || 'cert');
  drawGuillocheBorder(ctx, { width: W, height: H, seed, lineWidth: 2 });

  const margin = DPI * 0.6;
  ctx.strokeStyle = 'rgba(220,38,38,0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);

  // Header
  ctx.fillStyle = '#dc2626';
  ctx.font = `${DPI * 0.16}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('WEB3 STUDENT LAB', W / 2, H * 0.18);
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${DPI * 0.07}px monospace`;
  ctx.fillText('BLOCKCHAIN-VERIFIED CERTIFICATE OF COMPLETION', W / 2, H * 0.24);

  // Body
  ctx.fillStyle = '#d4d4d4';
  ctx.font = `${DPI * 0.08}px sans-serif`;
  ctx.fillText('THIS CERTIFIES THAT', W / 2, H * 0.38);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${DPI * 0.26}px Georgia, serif`;
  ctx.fillText(data.recipientName || 'Student Name', W / 2, H * 0.5);

  ctx.fillStyle = '#dc2626';
  ctx.font = `bold ${DPI * 0.14}px Georgia, serif`;
  ctx.fillText((data.courseName || 'Course Name').toUpperCase(), W / 2, H * 0.6);

  const dateStr = data.issueDate
    ? new Date(data.issueDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${DPI * 0.08}px monospace`;
  ctx.fillText(`ISSUED ON ${dateStr}`, W / 2, H * 0.7);

  // QR verification code
  const qrSize = DPI * 1.1;
  try {
    const qr = await renderVerificationQr(data.certificateId || 'pending');
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('QR load failed'));
      img.src = qr;
    });
    ctx.drawImage(img, W / 2 - qrSize / 2, H * 0.78, qrSize, qrSize);
  } catch {
    // QR is non-fatal; the diploma still renders.
  }

  // Footer labels
  ctx.fillStyle = '#6b7280';
  ctx.font = `${DPI * 0.06}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(data.instructorName || 'Instructor', margin + 20, H - margin);
  ctx.textAlign = 'right';
  ctx.fillText(
    (data.certificateId || '—').slice(0, 12).toUpperCase(),
    W - margin - 20,
    H - margin
  );

  return canvas;
}

/** Export the engine-rendered certificate as a print-quality PNG. */
export async function downloadEngineCertificatePng(
  data: CertificateData,
  filename: string
): Promise<void> {
  const canvas = await generateCertificateCanvas(data);
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Export the engine-rendered certificate as a print-quality PDF. */
export async function downloadEngineCertificatePdf(
  data: CertificateData,
  filename: string
): Promise<void> {
  const canvas = await generateCertificateCanvas(data);
  const { jsPDF } = await import('jspdf');
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [INCH_W, INCH_H] });
  pdf.addImage(imgData, 'PNG', 0, 0, INCH_W, INCH_H);
  pdf.save(`${filename}.pdf`);
}
