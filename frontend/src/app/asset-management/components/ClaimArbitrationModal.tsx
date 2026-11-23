'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  Gavel,
  Scale,
  Shield,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { ProofOfPurchaseUpload } from './ProofOfPurchaseUpload';
import { ClaimSeverity, ClaimType, Warranty, WarrantyClaim } from '../types';

interface ClaimArbitrationModalProps {
  warranty: Warranty;
  isOpen: boolean;
  onClose: () => void;
  onSubmitClaim: (warrantyId: string, claimData: Omit<WarrantyClaim, 'id' | 'warrantyId' | 'submittedAt' | 'status'>) => void;
  onArbitrateClaim: (warrantyId: string, claimId: string, resolution: 'APPROVED' | 'REJECTED', notes: string, resolutionType?: 'REPLACEMENT' | 'REFUND' | 'REPAIR' | 'DENIED') => void;
  userAddress?: string;
}

export const ClaimArbitrationModal: React.FC<ClaimArbitrationModalProps> = ({
  warranty,
  isOpen,
  onClose,
  onSubmitClaim,
  onArbitrateClaim,
  userAddress = 'GD4K72J3K6X6Y2WQ7P98ZTRN7931654ABCMNOP89XYZ',
}) => {
  const [activeTab, setActiveTab] = useState<'submit' | 'arbitrate'>('submit');

  // Submit Claim Form State
  const [claimType, setClaimType] = useState<ClaimType>('HARDWARE_FAILURE');
  const [severity, setSeverity] = useState<ClaimSeverity>('HIGH');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedAmount, setRequestedAmount] = useState(`${warranty.coverageValueUsd} USDC`);
  const [proofCid, setProofCid] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Arbitration Decision State
  const [selectedClaimId, setSelectedClaimId] = useState<string>(
    warranty.claims[0]?.id || ''
  );
  const [arbitratorNotes, setArbitratorNotes] = useState('');
  const [resolutionType, setResolutionType] = useState<'REPLACEMENT' | 'REFUND' | 'REPAIR' | 'DENIED'>('REPLACEMENT');
  const [isArbitrating, setIsArbitrating] = useState(false);

  if (!isOpen) return null;

  const handleSubmitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onSubmitClaim(warranty.id, {
        claimantAddress: userAddress,
        claimType,
        severity,
        title,
        description,
        requestedAmount,
        proofCid: proofCid || `bafybeievidence${Date.now().toString(16)}`,
        proofFileName: proofFileName || 'diagnostic_report.pdf',
      });
      setIsSubmitting(false);
      onClose();
    }, 600);
  };

  const handleExecuteArbitration = (resolution: 'APPROVED' | 'REJECTED') => {
    if (!selectedClaimId) return;

    setIsArbitrating(true);
    setTimeout(() => {
      onArbitrateClaim(
        warranty.id,
        selectedClaimId,
        resolution,
        arbitratorNotes || (resolution === 'APPROVED' ? 'Arbitration approved based on submitted telemetry and proof-of-purchase.' : 'Claim denied due to terms exclusion.'),
        resolution === 'APPROVED' ? resolutionType : 'DENIED'
      );
      setIsArbitrating(false);
      onClose();
    }, 600);
  };

  const selectedClaim = warranty.claims.find((c) => c.id === selectedClaimId) || warranty.claims[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-testid="claim-arbitration-modal"
    >
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-foreground">
                Commercial Claim & Arbitration Suite
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Serial: <span className="font-mono text-foreground">{warranty.serialNumber}</span> • {warranty.productName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-muted/10 px-6 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('submit')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'submit'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>Submit Lifecycle Claim</span>
          </button>
          <button
            onClick={() => setActiveTab('arbitrate')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'arbitrate'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Gavel className="h-4 w-4" />
            <span>Arbitration Panel ({warranty.claims.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'submit' ? (
            <form onSubmit={handleSubmitClaim} className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3 text-xs text-blue-700 dark:text-blue-300">
                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Decentralized Claim Guarantee:</span> Once submitted, your claim is registered with an on-chain timestamp on the Stellar network. Evidence is pinned to IPFS for cryptographic immutability.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="claim-type">Claim Category</Label>
                  <select
                    id="claim-type"
                    value={claimType}
                    onChange={(e) => setClaimType(e.target.value as ClaimType)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="HARDWARE_FAILURE">Hardware Failure</option>
                    <option value="DEFECT_ON_ARRIVAL">Defect on Arrival (DOA)</option>
                    <option value="SCREEN_DAMAGE">Display / Screen Damage</option>
                    <option value="BATTERY_DEGRADATION">Battery / Power Degradation</option>
                    <option value="WATER_RESISTANCE_BREACH">Water Resistance Breach</option>
                    <option value="FIRMWARE_CORRUPTION">Firmware / ASIC Corruption</option>
                    <option value="OTHER">Other Malfunction</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="severity-level">Severity Level</Label>
                  <select
                    id="severity-level"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as ClaimSeverity)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="LOW">Low (Minor cosmetic / non-blocking)</option>
                    <option value="MEDIUM">Medium (Degraded performance)</option>
                    <option value="HIGH">High (Complete subsystem fault)</option>
                    <option value="CRITICAL">Critical (Total device brick)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="claim-title">Claim Title / Issue Summary</Label>
                <Input
                  id="claim-title"
                  placeholder="e.g. ASIC cryptographic hash unit failure after 48h uptime"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="claim-desc">Detailed Problem Description & Diagnostic Steps</Label>
                <Textarea
                  id="claim-desc"
                  rows={3}
                  placeholder="Detail what happened, ambient conditions, diagnostic error codes or LED patterns observed..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="requested-amount">Requested Settlement / Compensation</Label>
                <Input
                  id="requested-amount"
                  placeholder="e.g. 1500 USDC or Full Replacement"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* IPFS Proof of Issue / Damage Upload */}
              <div className="space-y-1.5">
                <Label>Upload Incident Evidence / Telemetry to IPFS</Label>
                <ProofOfPurchaseUpload
                  onUploadSuccess={({ cid, fileName }) => {
                    setProofCid(cid);
                    setProofFileName(fileName);
                  }}
                  onClear={() => {
                    setProofCid('');
                    setProofFileName('');
                  }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-border">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !description.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="submit-claim-btn"
                >
                  {isSubmitting ? 'Recording on Stellar...' : 'Submit Claim to Arbitration'}
                </Button>
              </div>
            </form>
          ) : (
            /* Arbitrate Tab */
            <div className="space-y-6">
              {warranty.claims.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground space-y-2">
                  <Gavel className="h-10 w-10 mx-auto text-muted-foreground/60" />
                  <p className="text-sm">No claims have been submitted for this warranty yet.</p>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('submit')}>
                    Submit First Claim
                  </Button>
                </div>
              ) : (
                <>
                  {/* Claim Selector if multiple */}
                  {warranty.claims.length > 1 && (
                    <div className="space-y-1.5">
                      <Label>Select Claim to Review</Label>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {warranty.claims.map((c, i) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedClaimId(c.id)}
                            className={`px-3 py-1.5 text-xs rounded-lg border text-left font-medium transition-colors ${
                              (selectedClaimId || warranty.claims[0].id) === c.id
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            Claim #{i + 1} - {c.claimType}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedClaim && (
                    <div className="space-y-4">
                      {/* Claim Details Card */}
                      <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-sm">{selectedClaim.title}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Submitted: {new Date(selectedClaim.submittedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={
                                selectedClaim.status === 'APPROVED'
                                  ? 'default'
                                  : selectedClaim.status === 'REJECTED'
                                  ? 'destructive'
                                  : 'outline'
                              }
                              className="text-xs"
                            >
                              {selectedClaim.status}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {selectedClaim.severity}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground bg-background p-3 rounded-lg border border-border/60">
                          {selectedClaim.description}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Requested Payout: </span>
                            <span className="font-semibold">{selectedClaim.requestedAmount}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Claimant: </span>
                            <span className="font-mono truncate">{selectedClaim.claimantAddress.substring(0, 10)}...</span>
                          </div>
                        </div>

                        {selectedClaim.proofCid && (
                          <div className="flex items-center justify-between p-2.5 bg-background rounded-lg border border-border/80 text-xs">
                            <div className="flex items-center gap-2">
                              <FileCheck2 className="h-4 w-4 text-emerald-500" />
                              <span className="font-mono truncate max-w-[240px] text-muted-foreground">
                                IPFS: {selectedClaim.proofCid}
                              </span>
                            </div>
                            <a
                              href={`https://ipfs.io/ipfs/${selectedClaim.proofCid}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 shrink-0 font-medium"
                            >
                              <span>View Evidence</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}

                        {selectedClaim.arbitrationTxHash && (
                          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs space-y-1">
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Arbitration Executed on Stellar Ledger</span>
                            </div>
                            <div className="font-mono text-[11px] truncate text-muted-foreground">
                              Tx: {selectedClaim.arbitrationTxHash}
                            </div>
                            {selectedClaim.arbitratorNotes && (
                              <p className="text-xs italic pt-1">{selectedClaim.arbitratorNotes}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Arbitrator Decision Action Form */}
                      {selectedClaim.status !== 'APPROVED' && selectedClaim.status !== 'REJECTED' && (
                        <div className="p-4 border border-purple-500/30 bg-purple-500/5 rounded-xl space-y-4">
                          <div className="flex items-center gap-2">
                            <Gavel className="h-4 w-4 text-purple-500" />
                            <h4 className="text-sm font-semibold">Arbitrator Determination Panel</h4>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="resolution-type">Approved Settlement Remedy</Label>
                            <select
                              id="resolution-type"
                              value={resolutionType}
                              onChange={(e) =>
                                setResolutionType(
                                  e.target.value as 'REPLACEMENT' | 'REFUND' | 'REPAIR' | 'DENIED'
                                )
                              }
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden"
                            >
                              <option value="REPLACEMENT">Full Hardware Replacement</option>
                              <option value="REFUND">Full Escrow USDC Refund</option>
                              <option value="REPAIR">Factory Repair Authorization</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="arbitration-notes">Arbitrator Finding & Notes</Label>
                            <Textarea
                              id="arbitration-notes"
                              rows={2}
                              placeholder="Document justification, telemetry corroboration, or exclusion criteria..."
                              value={arbitratorNotes}
                              onChange={(e) => setArbitratorNotes(e.target.value)}
                              className="text-sm"
                            />
                          </div>

                          <div className="flex gap-3 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleExecuteArbitration('REJECTED')}
                              disabled={isArbitrating}
                              className="flex-1 border-rose-500/50 text-rose-600 hover:bg-rose-500/10"
                              data-testid="reject-claim-btn"
                            >
                              <XCircle className="h-4 w-4 mr-1.5" />
                              Reject Claim
                            </Button>
                            <Button
                              type="button"
                              onClick={() => handleExecuteArbitration('APPROVED')}
                              disabled={isArbitrating}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              data-testid="approve-claim-btn"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1.5" />
                              Approve & Settle
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClaimArbitrationModal;
