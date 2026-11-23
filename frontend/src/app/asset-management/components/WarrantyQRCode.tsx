'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Check, Copy, Download, QrCode as QrIcon, ShieldCheck } from 'lucide-react';
import { Warranty } from '../types';

interface WarrantyQRCodeProps {
  warranty: Warranty;
  size?: number;
  showDownload?: boolean;
  showCopy?: boolean;
  customPayload?: string;
  className?: string;
}

export const WarrantyQRCode: React.FC<WarrantyQRCodeProps> = ({
  warranty,
  size = 220,
  showDownload = true,
  showCopy = true,
  customPayload,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Construct standard verification URL & cryptographic metadata
  const verificationPayload =
    customPayload ||
    JSON.stringify({
      app: 'Web3-Student-Lab-Commercial-Warranty',
      version: '1.0',
      warrantyId: warranty.id,
      serialNumber: warranty.serialNumber,
      sku: warranty.sku,
      currentOwner: warranty.currentOwner,
      status: warranty.status,
      ipfsReceipt: `ipfs://${warranty.proofOfPurchaseCid}`,
      stellarAsset: warranty.stellarAssetCode,
      expiresAt: warranty.expiresAt,
    });

  const verificationUrl = `https://stellar-student-lab.org/verify-warranty?id=${encodeURIComponent(
    warranty.id
  )}&serial=${encodeURIComponent(warranty.serialNumber)}`;

  useEffect(() => {
    let isMounted = true;
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        verificationUrl,
        {
          width: size,
          margin: 2,
          color: {
            dark: '#0f172a', // Deep slate for high contrast
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        },
        (err) => {
          if (err && isMounted) {
            console.error('QR Code render error:', err);
            setError('Failed to render QR Code canvas.');
          }
        }
      );

      // Also generate high-res data URL for downloading
      QRCode.toDataURL(
        verificationUrl,
        {
          width: 600,
          margin: 3,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        },
        (err, url) => {
          if (!err && isMounted && url) {
            setDataUrl(url);
          }
        }
      );
    }
    return () => {
      isMounted = false;
    };
  }, [verificationUrl, size]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy verification link:', err);
    }
  };

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(verificationPayload);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch (err) {
      console.error('Failed to copy verification payload:', err);
    }
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `warranty-${warranty.serialNumber}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      data-testid="warranty-qrcode-container"
      className={`flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm text-center ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-5 w-5 text-emerald-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cryptographic Product Identity
        </span>
      </div>

      {/* QR Code Canvas with visual frame */}
      <div className="relative p-3 bg-white rounded-xl shadow-inner border border-slate-200 dark:border-slate-800">
        <canvas
          ref={canvasRef}
          data-testid="warranty-qr-canvas"
          className="rounded-lg max-w-full"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Product metadata preview */}
      <div className="mt-4 w-full text-left space-y-1 bg-muted/40 p-3 rounded-lg border border-border/50 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Serial:</span>
          <span className="font-mono font-medium">{warranty.serialNumber}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className="text-[10px] py-0">
            {warranty.status}
          </Badge>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Asset Token:</span>
          <span className="font-mono font-medium">{warranty.stellarAssetCode}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2 w-full justify-center">
        {showCopy && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            data-testid="copy-qr-link-btn"
            className="text-xs flex items-center gap-1.5 flex-1 min-w-[120px]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copied Link</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy URL</span>
              </>
            )}
          </Button>
        )}

        {showDownload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            data-testid="download-qr-btn"
            disabled={!dataUrl}
            className="text-xs flex items-center gap-1.5 flex-1 min-w-[120px]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download PNG</span>
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopyPayload}
          data-testid="copy-qr-payload-btn"
          className="text-xs flex items-center gap-1.5 w-full text-muted-foreground hover:text-foreground"
        >
          {copiedPayload ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Copied Metadata JSON</span>
            </>
          ) : (
            <>
              <QrIcon className="h-3.5 w-3.5" />
              <span>Copy On-Chain Payload</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default WarrantyQRCode;
