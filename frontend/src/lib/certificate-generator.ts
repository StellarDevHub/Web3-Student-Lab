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
