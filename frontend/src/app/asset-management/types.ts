export type WarrantyStatus =
  | 'ALL'
  | 'ACTIVE'
  | 'CLAIM_SUBMITTED'
  | 'IN_ARBITRATION'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'EXPIRED'
  | 'TRANSFERRED';

export type ClaimSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ClaimType =
  | 'HARDWARE_FAILURE'
  | 'DEFECT_ON_ARRIVAL'
  | 'SCREEN_DAMAGE'
  | 'BATTERY_DEGRADATION'
  | 'WATER_RESISTANCE_BREACH'
  | 'FIRMWARE_CORRUPTION'
  | 'OTHER';

export type ClaimStatus = 'PENDING' | 'IN_ARBITRATION' | 'APPROVED' | 'REJECTED';

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  claimantAddress: string;
  claimType: ClaimType;
  severity: ClaimSeverity;
  title: string;
  description: string;
  requestedAmount: string;
  proofCid: string;
  proofFileName?: string;
  submittedAt: string;
  status: ClaimStatus;
  arbitratorNotes?: string;
  arbitrationTxHash?: string;
  arbitratedAt?: string;
  resolution?: 'REPLACEMENT' | 'REFUND' | 'REPAIR' | 'DENIED';
}

export interface OwnershipHistoryItem {
  id: string;
  fromAddress: string;
  toAddress: string;
  transferredAt: string;
  txHash: string;
  memo?: string;
}

export interface Warranty {
  id: string;
  productName: string;
  serialNumber: string;
  sku: string;
  manufacturer: string;
  currentOwner: string;
  originalOwner: string;
  purchaseDate: string;
  registeredAt: string;
  expiresAt: string;
  durationMonths: number;
  status: Exclude<WarrantyStatus, 'ALL'>;
  proofOfPurchaseCid: string;
  proofOfPurchaseFileName: string;
  proofOfPurchaseFileSize: string;
  stellarAssetCode: string;
  stellarIssuer: string;
  coverageValueUsd: number;
  claims: WarrantyClaim[];
  ownershipHistory: OwnershipHistoryItem[];
  termsAndConditions?: string;
}
