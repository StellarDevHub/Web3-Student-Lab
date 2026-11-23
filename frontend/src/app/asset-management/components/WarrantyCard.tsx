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
  Eye,
  FileText,
  Gavel,
  QrCode,
  Shield,
  ShieldCheck,
  Tag,
  User,
} from 'lucide-react';
import { Warranty } from '../types';
import { STATUS_CONFIGS } from './StatusBadgeFilter';

interface WarrantyCardProps {
  warranty: Warranty;
  onViewDetails: (warranty: Warranty) => void;
  onViewQr: (warranty: Warranty) => void;
  onSubmitClaim: (warranty: Warranty) => void;
  onArbitrate: (warranty: Warranty) => void;
  onTransfer: (warranty: Warranty) => void;
}

export const WarrantyCard: React.FC<WarrantyCardProps> = ({
  warranty,
  onViewDetails,
  onViewQr,
  onSubmitClaim,
  onArbitrate,
  onTransfer,
}) => {
  const statusConfig = STATUS_CONFIGS[warranty.status] || STATUS_CONFIGS.ACTIVE;

  // Calculate days/months remaining
  const now = new Date();
  const expires = new Date(warranty.expiresAt);
  const diffTime = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isExpired = diffDays <= 0 || warranty.status === 'EXPIRED';

  const formatAddress = (addr: string) =>
    addr.length > 12 ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : addr;

  return (
    <div
      data-testid={`warranty-card-${warranty.id}`}
      className="bg-card border border-border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
    >
      {/* Top accent border based on status */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          warranty.status === 'ACTIVE'
            ? 'bg-emerald-500'
            : warranty.status === 'IN_ARBITRATION'
            ? 'bg-purple-500'
            : warranty.status === 'CLAIM_APPROVED'
            ? 'bg-sky-500'
            : warranty.status === 'TRANSFERRED'
            ? 'bg-indigo-500'
            : warranty.status === 'EXPIRED'
            ? 'bg-slate-400'
            : 'bg-amber-500'
        }`}
      />

      <div className="space-y-4">
        {/* Header: Title + Status Badge */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {warranty.manufacturer}
            </span>
            <h3 className="font-semibold text-base text-foreground leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {warranty.productName}
            </h3>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${statusConfig.badgeClass}`}
          >
            {statusConfig.icon}
            <span>{statusConfig.label}</span>
          </span>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-3 rounded-xl border border-border/50">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
              Serial Number
            </span>
            <span className="font-mono font-medium text-foreground truncate block">
              {warranty.serialNumber}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
              Token Asset
            </span>
            <span className="font-mono font-medium text-foreground truncate block">
              {warranty.stellarAssetCode}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
              Protection Value
            </span>
            <span className="font-semibold text-foreground">
              ${warranty.coverageValueUsd.toLocaleString()} USD
            </span>
          </div>

          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
              Owner
            </span>
            <span className="font-mono text-muted-foreground truncate block" title={warranty.currentOwner}>
              {formatAddress(warranty.currentOwner)}
            </span>
          </div>
        </div>

        {/* IPFS Proof of Purchase pill */}
        <div className="flex items-center justify-between text-xs px-3 py-2 bg-background border border-border/60 rounded-lg">
          <div className="flex items-center gap-1.5 truncate">
            <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-muted-foreground text-[11px] truncate">
              {warranty.proofOfPurchaseFileName || 'IPFS Invoice Proof'}
            </span>
          </div>
          <a
            href={`https://ipfs.io/ipfs/${warranty.proofOfPurchaseCid}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 shrink-0 ml-2"
            title="Inspect proof on IPFS"
          >
            <span>IPFS</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Expiry indicator & active claims preview */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {isExpired
                ? 'Coverage expired'
                : `${diffDays} days remaining (${warranty.durationMonths}m plan)`}
            </span>
          </div>

          {warranty.claims.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-500/40">
              {warranty.claims.length} {warranty.claims.length === 1 ? 'Claim' : 'Claims'}
            </Badge>
          )}
        </div>
      </div>

      {/* Action Buttons Footer */}
      <div className="pt-5 mt-4 border-t border-border flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onViewQr(warranty)}
            className="flex-1 text-xs flex items-center gap-1.5 h-8.5"
            data-testid={`card-qr-btn-${warranty.id}`}
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>QR Code</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTransfer(warranty)}
            className="flex-1 text-xs flex items-center gap-1.5 h-8.5"
            data-testid={`card-transfer-btn-${warranty.id}`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Transfer</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(warranty)}
            className="h-8.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            title="View Full Details"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Lifecycle Primary Action Button */}
        {warranty.claims.length > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onArbitrate(warranty)}
            className="w-full text-xs h-8.5 bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-1.5"
            data-testid={`card-arbitrate-btn-${warranty.id}`}
          >
            <Gavel className="h-3.5 w-3.5" />
            <span>Arbitration Panel ({warranty.claims.length})</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => onSubmitClaim(warranty)}
            disabled={isExpired}
            className="w-full text-xs h-8.5 flex items-center justify-center gap-1.5"
            data-testid={`card-submit-claim-btn-${warranty.id}`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Submit Lifecycle Claim</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default WarrantyCard;
