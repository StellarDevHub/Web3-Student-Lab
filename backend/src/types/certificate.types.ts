// Certificate NFT Metadata Types
// Based on OpenSea/ERC-721 metadata standards with educational extensions

export interface CertificateMetadataAttributes {
  trait_type: string;
  value: string | number;
}

export interface CertificateCourseInfo {
  id: string;
  title: string;
  instructor: string;
  credits: number;
  completionDate: string; // ISO date string
  grade?: string;
}

export interface CertificateStudentInfo {
  name: string;
  walletAddress: string;
}

export interface CertificateVerificationInfo {
  certificateId: string;
  mintedAt: string;
  contractAddress: string;
  tokenId: string;
  network: string;
  issuerDid: string; // Decentralized Identifier
}

export interface CertificateMetadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: CertificateMetadataAttributes[];
  course: CertificateCourseInfo;
  student: CertificateStudentInfo;
  verification: CertificateVerificationInfo;
  standard: string;
  version: string;
}

// Certificate Status (string literal types)
export enum CertificateStatus {
  MINTED = 'MINTED',
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  REISSUED = 'REISSUED',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
}

// Certificate entity with DB fields - matches Prisma output
export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  tokenId: string | null;
  issuedAt: Date;
  certificateHash: string | null;
  status: string; // Will be one of CERTIFICATE_STATUS values
  did?: string | null;
  metadataUri: string | null;
  contractAddress: string | null;
  transactionHash: string | null;
  network: string | null;
  grade?: string | null;
  revokedAt?: Date | null;
  revocationReason?: string | null;
  revokedBy?: string | null;
  previousVersionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    walletAddress?: string | null;
  } | null;
  course?: {
    id: string;
    title: string;
    description?: string | null;
    instructor: string;
    credits: number;
  } | null;
}

// Verification Result
export interface VerificationResult {
  isValid: boolean;
  certificate: CertificateMetadata | null;
  status: CertificateStatus;
  onChainData: {
    tokenId: string;
    owner: string;
    mintedAt: Date;
    contractAddress: string;
    transactionHash: string;
    network: string;
  } | null;
  revocationInfo?: {
    revokedAt: Date;
    reason: string;
    revokedBy: string;
  };
  message?: string;
}

// Batch verification item
export interface BatchVerificationItem {
  tokenId: string;
  isValid: boolean;
  status: CertificateStatus;
  error?: string;
}

// Batch verification response
export interface BatchVerificationResponse {
  results: BatchVerificationItem[];
  summary: {
    total: number;
    valid: number;
    revoked: number;
    invalid: number;
  };
}

// Mint certificate request
export interface MintCertificateRequest {
  studentId: string;
  courseId: string;
  tokenId?: string;
  grade?: string;
  did?: string;
}

// Revoke certificate request
export interface RevokeCertificateRequest {
  certificateId: string;
  reason: string;
  revokedBy: string;
}

// Reissue certificate request
export interface ReissueCertificateRequest {
  certificateId: string;
  reason: string;
  newGrade?: string;
  issuedBy: string;
}

// Analytics data
export interface CertificateAnalytics {
  totalCertificates: number;
  byStatus: Record<string, number>; // Use string keys for flexibility
  totalVerifications: number;
  verificationsByDate: { date: string; count: number }[];
  revocationRate: number;
  uniqueStudents: number;
  uniqueCourses: number;
}

// Certificate image generation options
export interface CertificateImageOptions {
  studentName: string;
  courseTitle: string;
  instructor: string;
  completionDate: string;
  grade?: string;
  credentialId: string;
  issuerName: string;
  logoUrl?: string;
}

// QR Code generation options
export interface QRCodeOptions {
  data: string;
  size?: number;
  format?: 'png' | 'svg';
}

// Blockchain service interface
export interface IBlockchainService {
  mintCertificate(metadata: CertificateMetadata): Promise<MintResult>;
  verifyOnChain(tokenId: string): Promise<boolean>;
  getOwner(tokenId: string): Promise<string>;
  revokeCertificate(tokenId: string, reason: string): Promise<void>;
  getTransactionHistory(tokenId: string): Promise<TransactionHistoryItem[]>;
  getCertificateData(tokenId: string): Promise<OnChainCertificateData | null>;
}

export interface MintResult {
  success: boolean;
  tokenId: string;
  transactionHash: string;
  contractAddress: string;
  error?: string;
}

export interface TransactionHistoryItem {
  transactionHash: string;
  timestamp: Date;
  type: 'MINT' | 'TRANSFER' | 'REVOKE' | 'BURN';
  from: string;
  to?: string;
  amount?: number;
}

export interface OnChainCertificateData {
  tokenId: string;
  owner: string;
  metadataUri: string;
  mintedAt: Date;
  contractAddress: string;
  transactionHash: string;
  network: string;
}
