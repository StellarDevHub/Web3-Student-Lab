'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Gavel,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Warranty, WarrantyClaim, WarrantyStatus } from '../types';
import { INITIAL_WARRANTIES } from '../mockData';
import { StatusBadgeFilter } from './StatusBadgeFilter';
import { WarrantyCard } from './WarrantyCard';
import { RegisterProductModal } from './RegisterProductModal';
import { QRCodeModal } from './QRCodeModal';
import { ClaimArbitrationModal } from './ClaimArbitrationModal';
import { OwnershipTransferModal } from './OwnershipTransferModal';
import { WarrantyDetailsModal } from './WarrantyDetailsModal';

const LOCAL_STORAGE_KEY = 'web3_student_lab_warranties_v1';

interface CommercialWarrantyPortalProps {
  connectedAddress?: string;
}

export const CommercialWarrantyPortal: React.FC<CommercialWarrantyPortalProps> = ({
  connectedAddress = 'GD4K72J3K6X6Y2WQ7P98ZTRN7931654ABCMNOP89XYZ',
}) => {
  const [warranties, setWarranties] = useState<Warranty[]>(INITIAL_WARRANTIES);
  const [selectedStatus, setSelectedStatus] = useState<WarrantyStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);

  // Modal states
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Success alert toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWarranties(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load warranties from localStorage:', e);
    }
  }, []);

  // Save to localStorage whenever warranties change
  const saveWarranties = (updated: Warranty[]) => {
    setWarranties(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save warranties to localStorage:', e);
    }
  };

  // Reset to initial mock data
  const handleResetData = () => {
    saveWarranties(INITIAL_WARRANTIES);
    showToast('Reset sample warranties to default production dataset.');
  };

  // 1. Full Lifecycle: Register Product
  const handleRegisterProduct = (newWarranty: Warranty) => {
    const updated = [newWarranty, ...warranties];
    saveWarranties(updated);
    showToast(`Registered "${newWarranty.productName}" on-chain with IPFS receipt.`);
  };

  // 2. Full Lifecycle: Submit Claim
  const handleSubmitClaim = (
    warrantyId: string,
    claimData: Omit<WarrantyClaim, 'id' | 'warrantyId' | 'submittedAt' | 'status'>
  ) => {
    const newClaim: WarrantyClaim = {
      ...claimData,
      id: `clm-${Date.now()}`,
      warrantyId,
      submittedAt: new Date().toISOString(),
      status: 'IN_ARBITRATION',
    };

    const updated = warranties.map((w) => {
      if (w.id === warrantyId) {
        return {
          ...w,
          status: 'IN_ARBITRATION' as const,
          claims: [newClaim, ...w.claims],
        };
      }
      return w;
    });

    saveWarranties(updated);
    showToast('Claim submitted & forwarded to Stellar Arbitration Escrow.');
  };

  // 3. Full Lifecycle: Arbitrate Claim
  const handleArbitrateClaim = (
    warrantyId: string,
    claimId: string,
    resolution: 'APPROVED' | 'REJECTED',
    notes: string,
    resolutionType?: 'REPLACEMENT' | 'REFUND' | 'REPAIR' | 'DENIED'
  ) => {
    const txHash = `0x${Array.from({ length: 48 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    const updated = warranties.map((w) => {
      if (w.id === warrantyId) {
        const nextClaims = w.claims.map((c) => {
          if (c.id === claimId) {
            return {
              ...c,
              status: resolution,
              arbitratorNotes: notes,
              arbitrationTxHash: txHash,
              arbitratedAt: new Date().toISOString(),
              resolution: resolutionType || (resolution === 'APPROVED' ? 'REPLACEMENT' : 'DENIED'),
            };
          }
          return c;
        });

        const nextStatus = resolution === 'APPROVED' ? ('CLAIM_APPROVED' as const) : ('CLAIM_REJECTED' as const);

        return {
          ...w,
          status: nextStatus,
          claims: nextClaims,
        };
      }
      return w;
    });

    saveWarranties(updated);
    showToast(`Claim arbitration finalized: ${resolution} on Stellar Ledger.`);
  };

  // 4. Full Lifecycle: Transfer Warranty
  const handleTransferWarranty = (warrantyId: string, newOwnerAddress: string, memo: string) => {
    const txHash = `0x${Array.from({ length: 48 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    const updated = warranties.map((w) => {
      if (w.id === warrantyId) {
        const historyItem = {
          id: `hist-${Date.now()}`,
          fromAddress: w.currentOwner,
          toAddress: newOwnerAddress,
          transferredAt: new Date().toISOString(),
          txHash,
          memo,
        };

        return {
          ...w,
          currentOwner: newOwnerAddress,
          status: 'TRANSFERRED' as const,
          ownershipHistory: [historyItem, ...w.ownershipHistory],
        };
      }
      return w;
    });

    saveWarranties(updated);
    showToast(`Warranty ownership transferred to ${newOwnerAddress.substring(0, 8)}...`);
  };

  // Filter & Search computation
  const filteredWarranties = warranties.filter((w) => {
    // Status filter
    if (selectedStatus !== 'ALL' && w.status !== selectedStatus) {
      return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchProduct = w.productName.toLowerCase().includes(q);
      const matchSerial = w.serialNumber.toLowerCase().includes(q);
      const matchSku = w.sku.toLowerCase().includes(q);
      const matchOwner = w.currentOwner.toLowerCase().includes(q);
      const matchManufacturer = w.manufacturer.toLowerCase().includes(q);
      return matchProduct || matchSerial || matchSku || matchOwner || matchManufacturer;
    }

    return true;
  });

  // Analytics & Stats
  const totalValue = warranties.reduce((acc, curr) => acc + (curr.coverageValueUsd || 0), 0);
  const activeCount = warranties.filter((w) => w.status === 'ACTIVE').length;
  const inArbitrationCount = warranties.filter(
    (w) => w.status === 'IN_ARBITRATION' || w.status === 'CLAIM_SUBMITTED'
  ).length;

  return (
    <div className="space-y-6" data-testid="commercial-warranty-portal">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-border text-sm animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header and Action Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-emerald-500" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Commercial Warranty & Claim Lifecycle Suite
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            End-to-end decentralized warranty lifecycle: on-chain registration, IPFS invoice verification, claim arbitration, and secondary market ownership transfer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetData}
            title="Reset to default mock data"
            className="text-xs text-muted-foreground flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Demo</span>
          </Button>

          <Button
            onClick={() => setIsRegisterOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-sm text-sm"
            data-testid="register-new-product-btn"
          >
            <PackagePlus className="h-4 w-4" />
            <span>Register Product</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card/80 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Protected
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{warranties.length}</span>
            <span className="text-xs text-muted-foreground">Tokens</span>
          </div>
        </Card>

        <Card className="p-4 bg-card/80 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Coverage
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </span>
            <span className="text-xs text-muted-foreground">Active plans</span>
          </div>
        </Card>

        <Card className="p-4 bg-card/80 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Under Arbitration
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Gavel className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
              {inArbitrationCount}
            </span>
            <span className="text-xs text-muted-foreground">Open disputes</span>
          </div>
        </Card>

        <Card className="p-4 bg-card/80 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Protected Value
            </span>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              ${totalValue.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">USD Escrow</span>
          </div>
        </Card>
      </div>

      {/* Status Filter and Search Bar Component */}
      <StatusBadgeFilter
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        warranties={warranties}
      />

      {/* Warranties Grid */}
      {filteredWarranties.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card/40 space-y-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No Warranties Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No warranty assets match your current status filter ({selectedStatus}) or search term.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedStatus('ALL');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
            <Button size="sm" onClick={() => setIsRegisterOpen(true)}>
              Register New Product
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredWarranties.map((w) => (
            <WarrantyCard
              key={w.id}
              warranty={w}
              onViewDetails={(item) => {
                setSelectedWarranty(item);
                setIsDetailsModalOpen(true);
              }}
              onViewQr={(item) => {
                setSelectedWarranty(item);
                setIsQrModalOpen(true);
              }}
              onSubmitClaim={(item) => {
                setSelectedWarranty(item);
                setIsClaimModalOpen(true);
              }}
              onArbitrate={(item) => {
                setSelectedWarranty(item);
                setIsClaimModalOpen(true);
              }}
              onTransfer={(item) => {
                setSelectedWarranty(item);
                setIsTransferModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Lifecycle Modals */}
      {/* 1. Register Product Modal */}
      <RegisterProductModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegister={handleRegisterProduct}
        connectedAddress={connectedAddress}
      />

      {/* 2. QR Code Render Component Modal */}
      <QRCodeModal
        warranty={selectedWarranty}
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />

      {/* 3. Claim & Arbitration Modal */}
      {selectedWarranty && (
        <ClaimArbitrationModal
          warranty={selectedWarranty}
          isOpen={isClaimModalOpen}
          onClose={() => setIsClaimModalOpen(false)}
          onSubmitClaim={handleSubmitClaim}
          onArbitrateClaim={handleArbitrateClaim}
          userAddress={connectedAddress}
        />
      )}

      {/* 4. Ownership Transfer Modal */}
      {selectedWarranty && (
        <OwnershipTransferModal
          warranty={selectedWarranty}
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          onTransfer={handleTransferWarranty}
        />
      )}

      {/* 5. Full Warranty Details Modal */}
      <WarrantyDetailsModal
        warranty={selectedWarranty}
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        onOpenClaimModal={() => setIsClaimModalOpen(true)}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
      />
    </div>
  );
};

export default CommercialWarrantyPortal;
