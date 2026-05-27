import { z } from 'zod';

// Zod schemas for certificate validation

export const CertificateMetadataAttributesSchema = z.object({
  trait_type: z.string().min(1).max(100),
  value: z.union([z.string(), z.number()]),
});

export const CertificateCourseInfoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  instructor: z.string().min(1).max(100),
  credits: z.number().int().positive(),
  completionDate: z.string().datetime(),
  grade: z.string().optional(),
});

export const CertificateStudentInfoSchema = z.object({
  name: z.string().min(1).max(100),
  walletAddress: z.string().regex(/^G[a-zA-Z0-9]{55}$/, 'Invalid Stellar public key'),
});

export const CertificateVerificationInfoSchema = z.object({
  certificateId: z.string().min(1),
  mintedAt: z.string().datetime(),
  contractAddress: z.string().regex(/^G[a-zA-Z0-9]{55}$/, 'Invalid Stellar address'),
  tokenId: z.string().min(1),
  network: z.string().min(1),
  issuerDid: z.string().min(1),
});

export const CertificateMetadataSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  image: z.string().url(),
  external_url: z.string().url(),
  attributes: z.array(CertificateMetadataAttributesSchema).min(1),
  course: CertificateCourseInfoSchema,
  student: CertificateStudentInfoSchema,
  verification: CertificateVerificationInfoSchema,
  standard: z.literal('Stellar NFT Certificate v1.0'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export type CertificateMetadata = z.infer<typeof CertificateMetadataSchema>;

// Mint request schema
export const MintCertificateSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  tokenId: z.string().optional(),
  grade: z.string().optional(),
  did: z.string().optional(),
});

export type MintCertificateRequest = z.infer<typeof MintCertificateSchema>;

// Revoke certificate schema
export const RevokeCertificateSchema = z.object({
  certificateId: z.string().min(1),
  reason: z.string().min(1).max(500),
  revokedBy: z.string().min(1),
});

export type RevokeCertificateRequest = z.infer<typeof RevokeCertificateSchema>;

// Reissue certificate schema
export const ReissueCertificateSchema = z.object({
  certificateId: z.string().min(1),
  reason: z.string().min(1).max(500),
  newGrade: z.string().optional(),
  issuedBy: z.string().min(1),
});

export type ReissueCertificateRequest = z.infer<typeof ReissueCertificateSchema>;

// Batch verification schema
export const BatchVerificationSchema = z.object({
  tokenIds: z.array(z.string().min(1)).min(1).max(100),
});

export type BatchVerificationRequest = z.infer<typeof BatchVerificationSchema>;

// Certificate image generation options
export const CertificateImageOptionsSchema = z.object({
  studentName: z.string().min(1),
  courseTitle: z.string().min(1),
  instructor: z.string().min(1),
  completionDate: z.string().datetime(),
  grade: z.string().optional(),
  credentialId: z.string().min(1),
  issuerName: z.string().min(1),
  logoUrl: z.string().url().optional(),
});

export type CertificateImageOptions = z.infer<typeof CertificateImageOptionsSchema>;

// QR Code options
export const QRCodeOptionsSchema = z.object({
  data: z.string().min(1),
  size: z.number().int().positive().optional(),
  format: z.enum(['png', 'svg']).optional(),
});

export type QRCodeOptions = z.infer<typeof QRCodeOptionsSchema>;
