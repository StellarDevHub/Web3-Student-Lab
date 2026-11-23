'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { X, QrCode } from 'lucide-react';
import { Warranty } from '../types';
import { WarrantyQRCode } from './WarrantyQRCode';

interface QRCodeModalProps {
  warranty: Warranty | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ warranty, isOpen, onClose }) => {
  if (!isOpen || !warranty) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-testid="qrcode-modal"
    >
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Warranty Verification QR
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <WarrantyQRCode
            warranty={warranty}
            size={240}
            showDownload={true}
            showCopy={true}
          />
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;
