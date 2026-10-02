'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import {
  Calendar,
  CheckCircle2,
  Package,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { ProofOfPurchaseUpload } from './ProofOfPurchaseUpload';
import { Warranty } from '../types';

interface RegisterProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (warranty: Warranty) => void;
  connectedAddress?: string;
}

export const RegisterProductModal: React.FC<RegisterProductModalProps> = ({
  isOpen,
  onClose,
  onRegister,
  connectedAddress = 'GD4K72J3K6X6Y2WQ7P98ZTRN7931654ABCMNOP89XYZ',
}) => {
  const [productName, setProductName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [sku, setSku] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationMonths, setDurationMonths] = useState<number>(24);
  const [coverageValueUsd, setCoverageValueUsd] = useState<number>(1299);
  const [terms, setTerms] = useState(
    'Standard Manufacturer Hardware Warranty: covers defects in materials and workmanship under normal operational parameters.'
  );

  // IPFS Upload state
  const [proofCid, setProofCid] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [proofFileSize, setProofFileSize] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  if (!isOpen) return null;

  // Auto-fill template helper for quick testing
  const handleAutofillDemo = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setProductName('NovaSphere Micro-Datacenter Rig');
    setManufacturer('NovaSphere Technologies AG');
    setSerialNumber(`NVR-${new Date().getFullYear()}-${randomNum}-PRO`);
    setSku('SRV-NOVA-256G-R1');
    setCoverageValueUsd(3499);
    setProofCid('bafybeidemoautofillproofreceipt99881122334455667788');
    setProofFileName(`official_invoice_novasphere_${randomNum}.pdf`);
    setProofFileSize('1.85 MB');
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !serialNumber.trim() || !manufacturer.trim()) return;

    setIsRegistering(true);

    const purchase = new Date(purchaseDate);
    const expires = new Date(purchase);
    expires.setMonth(expires.getMonth() + durationMonths);

    const cid = proofCid || `bafybeic${Date.now().toString(16)}generatedproof98765`;
    const fileName = proofFileName || `receipt_${serialNumber.toLowerCase()}.pdf`;
    const fileSize = proofFileSize || '1.20 MB';

    const newWarranty: Warranty = {
      id: `war-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productName: productName.trim(),
      serialNumber: serialNumber.trim().toUpperCase(),
      sku: (sku.trim() || 'SKU-GEN-01').toUpperCase(),
      manufacturer: manufacturer.trim(),
      currentOwner: connectedAddress,
      originalOwner: connectedAddress,
      purchaseDate,
      registeredAt: new Date().toISOString(),
      expiresAt: expires.toISOString(),
      durationMonths,
      status: 'ACTIVE',
      proofOfPurchaseCid: cid,
      proofOfPurchaseFileName: fileName,
      proofOfPurchaseFileSize: fileSize,
      stellarAssetCode: `WAR${productName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}`,
      stellarIssuer: connectedAddress.substring(0, 8) + '...ISSUER',
      coverageValueUsd,
      termsAndConditions: terms,
      claims: [],
      ownershipHistory: [
        {
          id: `hist-genesis-${Date.now()}`,
          fromAddress: 'STELLAR_GENESIS_REGISTRAR',
          toAddress: connectedAddress,
          transferredAt: new Date().toISOString(),
          txHash: `0x${Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
          memo: 'Genesis Product Warranty On-Chain Registration',
        },
      ],
    };

    setTimeout(() => {
      onRegister(newWarranty);
      setIsRegistering(false);
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-testid="register-product-modal"
    >
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-foreground">
                Register Product & Mint Warranty
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create an immutable, transferable warranty asset token on the Stellar blockchain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutofillDemo}
              className="text-xs flex items-center gap-1.5 h-8 border-dashed"
              title="Autofill with sample data"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Autofill Sample</span>
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleRegister} className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Product Name *</Label>
              <Input
                id="product-name"
                placeholder="e.g. Quantum Validator Node"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
                className="text-sm"
                data-testid="product-name-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manufacturer">Manufacturer / Brand *</Label>
              <Input
                id="manufacturer"
                placeholder="e.g. Stellar Hardware Labs"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                required
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="serial-number">Serial Number *</Label>
              <Input
                id="serial-number"
                placeholder="e.g. ZQN-2025-9981-TX"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                required
                className="font-mono text-sm uppercase"
                data-testid="serial-number-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU / Model Number</Label>
              <Input
                id="sku"
                placeholder="e.g. HW-NODE-PRO-64G"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="font-mono text-sm uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-date">Purchase Date</Label>
              <Input
                id="purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration-months">Warranty Period Duration</Label>
              <select
                id="duration-months"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                <option value={12}>12 Months (1 Year)</option>
                <option value={24}>24 Months (2 Years)</option>
                <option value={36}>36 Months (3 Years)</option>
                <option value={48}>48 Months (4 Years)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coverage-value">Replacement / Coverage Value (USD)</Label>
            <Input
              id="coverage-value"
              type="number"
              min="0"
              step="50"
              value={coverageValueUsd}
              onChange={(e) => setCoverageValueUsd(Number(e.target.value))}
              className="text-sm"
            />
          </div>

          {/* Proof of Purchase IPFS Upload */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Proof-of-Purchase Invoice (Pinned to IPFS)</Label>
              <span className="text-[11px] text-muted-foreground">Required for claim validity</span>
            </div>
            <ProofOfPurchaseUpload
              initialCid={proofCid}
              initialFileName={proofFileName}
              initialFileSize={proofFileSize}
              onUploadSuccess={({ cid, fileName, fileSize }) => {
                setProofCid(cid);
                setProofFileName(fileName);
                setProofFileSize(fileSize);
              }}
              onClear={() => {
                setProofCid('');
                setProofFileName('');
                setProofFileSize('');
              }}
            />
          </div>

          {/* Initial Owner Info */}
          <div className="p-3 bg-muted/30 border border-border/80 rounded-xl space-y-1 text-xs">
            <span className="text-muted-foreground">Initial Entitlement Assigned To Connected Wallet:</span>
            <div className="font-mono text-foreground truncate select-all">{connectedAddress}</div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isRegistering}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isRegistering || !productName.trim() || !serialNumber.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="submit-register-product-btn"
            >
              {isRegistering ? 'Registering on Stellar...' : 'Register Product & Issue Warranty'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterProductModal;
