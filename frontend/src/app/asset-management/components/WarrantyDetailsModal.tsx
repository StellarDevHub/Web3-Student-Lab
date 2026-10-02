'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Gavel,
  History,
  QrCode,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { Warranty } from '../types';
import { STATUS_CONFIGS } from './StatusBadgeFilter';
import { WarrantyQRCode } from './WarrantyQRCode';

interface WarrantyDetailsModalProps {
  warranty: Warranty | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenQrModal: () => void;
  onOpenClaimModal: () => void;
  onOpenTransferModal: () => void;
}

export const WarrantyDetailsModal: React.FC<WarrantyDetailsModalProps> = ({
  warranty,
  isOpen,
  onClose,
  onOpenQrModal,
  onOpenClaimModal,
  onOpenTransferModal,
}) => {
  if (!isOpen || !warranty) return null;

  const statusConfig = STATUS_CONFIGS[warranty.status] || STATUS_CONFIGS.ACTIVE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-testid="warranty-details-modal"
    >
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.badgeClass}`}
              >
                {statusConfig.icon}
                <span>{statusConfig.label}</span>
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {warranty.serialNumber}
              </span>
            </div>
            <h3 className="text-xl font-bold text-foreground mt-1">{warranty.productName}</h3>
            <p className="text-xs text-muted-foreground">{warranty.manufacturer}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Top row: Specifications & Embedded QR Code */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Warranty Specifications & Blockchain Identity
              </h4>

              <div className="grid grid-cols-2 gap-3 bg-muted/30 p-4 rounded-xl border border-border/60 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">SKU Number</span>
                  <span className="font-mono font-medium text-foreground">{warranty.sku}</span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Protection Value</span>
                  <span className="font-semibold text-foreground">
                    ${warranty.coverageValueUsd.toLocaleString()} USD
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Purchase Date</span>
                  <span className="text-foreground">{warranty.purchaseDate}</span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Coverage Expiry</span>
                  <span className="text-foreground">
                    {new Date(warranty.expiresAt).toLocaleDateString()} ({warranty.durationMonths}m plan)
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Stellar Asset Code</span>
                  <span className="font-mono font-semibold text-foreground">{warranty.stellarAssetCode}</span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Issuer Account</span>
                  <span className="font-mono text-muted-foreground truncate block">{warranty.stellarIssuer}</span>
                </div>
              </div>

              {/* Current & Original Owner */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Current Registered Owner</span>
                  <div className="font-mono p-2 bg-background border border-border rounded-lg text-foreground truncate select-all">
                    {warranty.currentOwner}
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Genesis Original Owner</span>
                  <div className="font-mono p-2 bg-background border border-border rounded-lg text-muted-foreground truncate select-all">
                    {warranty.originalOwner}
                  </div>
                </div>
              </div>

              {/* IPFS Proof of Purchase */}
              <div className="p-3.5 bg-background border border-border rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold">IPFS Proof-of-Purchase Receipt</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                    Decentralized Proof
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>File: {warranty.proofOfPurchaseFileName}</span>
                  <span>Size: {warranty.proofOfPurchaseFileSize}</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-lg font-mono text-[11px]">
                  <span className="truncate">{warranty.proofOfPurchaseCid}</span>
                  <a
                    href={`https://ipfs.io/ipfs/${warranty.proofOfPurchaseCid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 shrink-0 font-sans text-xs"
                  >
                    <span>Open Gateway</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* QR Code preview column */}
            <div className="flex flex-col items-center justify-center">
              <WarrantyQRCode
                warranty={warranty}
                size={180}
                showDownload={true}
                showCopy={true}
                className="w-full"
              />
            </div>
          </div>

          {/* Terms & Conditions */}
          {warranty.termsAndConditions && (
            <div className="space-y-1.5 text-xs">
              <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                Coverage Terms & Warranty Covenant
              </h4>
              <p className="p-3 bg-muted/20 border border-border/60 rounded-xl text-muted-foreground italic">
                {warranty.termsAndConditions}
              </p>
            </div>
          )}

          {/* Provenance Audit Trail */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-4 w-4 text-indigo-500" />
              <span>Full On-Chain Provenance Trail ({warranty.ownershipHistory.length})</span>
            </div>
            <div className="space-y-2">
              {warranty.ownershipHistory.map((h, i) => (
                <div
                  key={h.id || i}
                  className="p-3 bg-muted/30 border border-border/70 rounded-xl text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-medium text-foreground">{h.memo || 'Ownership Event'}</span>
                    <span>{new Date(h.transferredAt).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px] text-muted-foreground">
                    <div className="truncate">From: {h.fromAddress}</div>
                    <div className="truncate">To: {h.toAddress}</div>
                  </div>
                  <div className="font-mono text-[10px] text-primary truncate pt-0.5">
                    Tx: {h.txHash}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Claims History */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Gavel className="h-4 w-4 text-purple-500" />
                <span>Claims & Arbitration History ({warranty.claims.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenClaimModal();
                }}
                className="text-xs h-7"
              >
                Submit New Claim
              </Button>
            </div>

            {warranty.claims.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-3 bg-muted/10 rounded-xl border border-border/40 text-center">
                No active or historical claims recorded for this device.
              </p>
            ) : (
              <div className="space-y-2">
                {warranty.claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{claim.title}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {claim.claimType}
                        </Badge>
                        <Badge
                          variant={
                            claim.status === 'APPROVED'
                              ? 'default'
                              : claim.status === 'REJECTED'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {claim.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground">{claim.description}</p>
                    {claim.arbitratorNotes && (
                      <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-900 dark:text-purple-200">
                        <span className="font-semibold">Arbitrator Determination: </span>
                        {claim.arbitratorNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onOpenTransferModal();
            }}
            className="flex items-center gap-1.5"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Transfer Ownership</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              onClose();
              onOpenClaimModal();
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
          >
            <Gavel className="h-4 w-4" />
            <span>Claim & Arbitration Hub</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WarrantyDetailsModal;
