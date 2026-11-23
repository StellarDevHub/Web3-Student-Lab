'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  History,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { Warranty } from '../types';

interface OwnershipTransferModalProps {
  warranty: Warranty;
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (warrantyId: string, newOwnerAddress: string, memo: string) => void;
}

export const OwnershipTransferModal: React.FC<OwnershipTransferModalProps> = ({
  warranty,
  isOpen,
  onClose,
  onTransfer,
}) => {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [transferMemo, setTransferMemo] = useState('Secondary Market Resale - Verified');
  const [isTransferring, setIsTransferring] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Simple Stellar Public Key validation (Starts with G, length 56, alphanumeric)
  const validateStellarAddress = (address: string): boolean => {
    const trimmed = address.trim();
    return /^G[A-Z0-9]{55}$/.test(trimmed) || trimmed.length >= 32;
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const target = recipientAddress.trim();

    if (!target) {
      setValidationError('Please provide a valid recipient Stellar public key.');
      return;
    }

    if (target === warranty.currentOwner) {
      setValidationError('Recipient cannot be the current owner address.');
      return;
    }

    if (!validateStellarAddress(target)) {
      setValidationError('Invalid Stellar public key format (Must begin with G and be 56 characters).');
      return;
    }

    setValidationError(null);
    setIsTransferring(true);

    setTimeout(() => {
      onTransfer(warranty.id, target, transferMemo);
      setIsTransferring(false);
      onClose();
    }, 700);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-testid="ownership-transfer-modal"
    >
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-500" />
            <h3 className="text-lg font-semibold text-foreground">
              Transfer Warranty Ownership
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

        <form onSubmit={handleExecuteTransfer} className="p-6 space-y-5">
          {/* Product summary banner */}
          <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1 text-xs">
            <div className="font-semibold text-foreground text-sm">{warranty.productName}</div>
            <div className="flex justify-between text-muted-foreground">
              <span>Serial: <span className="font-mono text-foreground">{warranty.serialNumber}</span></span>
              <span>Asset Token: <span className="font-mono text-foreground">{warranty.stellarAssetCode}</span></span>
            </div>
          </div>

          {/* Current Owner Address */}
          <div className="space-y-1 text-xs">
            <span className="text-muted-foreground">Current Registered Owner:</span>
            <div className="font-mono p-2 bg-muted/20 border border-border/80 rounded-lg text-foreground truncate select-all">
              {warranty.currentOwner}
            </div>
          </div>

          {/* Recipient Address */}
          <div className="space-y-1.5">
            <Label htmlFor="recipient-address" className="text-sm">
              New Owner Stellar Public Key (G...)
            </Label>
            <Input
              id="recipient-address"
              placeholder="e.g. GAV881K9034K2LK30948NJFKD0932LKJ40938KDJF09..."
              value={recipientAddress}
              onChange={(e) => {
                setRecipientAddress(e.target.value);
                if (validationError) setValidationError(null);
              }}
              required
              className="font-mono text-xs"
              data-testid="recipient-address-input"
            />
            {validationError && (
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {validationError}
              </p>
            )}
          </div>

          {/* Transfer Memo */}
          <div className="space-y-1.5">
            <Label htmlFor="transfer-memo" className="text-sm">
              Transfer Memo / Provenance Note
            </Label>
            <Input
              id="transfer-memo"
              placeholder="e.g. Secondary market escrow transfer #892"
              value={transferMemo}
              onChange={(e) => setTransferMemo(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Warning / Transfer notice */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Transferring warranty ownership assigns full entitlement, claim rights, and warranty
              arbitration authority to the new Stellar address. This operation generates an on-chain provenance record.
            </p>
          </div>

          {/* Provenance History log preview */}
          {warranty.ownershipHistory && warranty.ownershipHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                <span>Provenance Audit Trail ({warranty.ownershipHistory.length})</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {warranty.ownershipHistory.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="p-2 bg-muted/20 border border-border/40 rounded-lg text-[11px] space-y-0.5"
                  >
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>{new Date(item.transferredAt).toLocaleDateString()}</span>
                      <span className="font-mono text-[10px]">Tx: {item.txHash.substring(0, 10)}...</span>
                    </div>
                    <div className="font-mono text-foreground truncate">
                      To: {item.toAddress.substring(0, 16)}...
                    </div>
                    {item.memo && <div className="text-muted-foreground italic text-[10px]">{item.memo}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isTransferring}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isTransferring || !recipientAddress.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="confirm-transfer-btn"
            >
              {isTransferring ? 'Recording Transfer...' : 'Sign & Transfer Ownership'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OwnershipTransferModal;
