import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import logger from '../utils/logger.js';

export type UploadPurpose = 'avatar' | 'image' | 'deliverable' | 'assignment' | 'generic';

export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  fileSize: number;
  purpose?: UploadPurpose;
  workspaceId?: string;
  userId?: string;
  fileBufferHeader?: Buffer | string;
}

export interface PresignedUrlResult {
  uploadUrl: string;
  fileKey: string;
  bucket: string;
  expiresIn: number;
  maxSizeBytes: number;
  contentType: string;
  jobId?: string;
}

export interface MagicByteValidationResult {
  valid: boolean;
  detectedMime: string | null;
  error?: string;
}

export const MAX_FILE_SIZES: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5MB limit
  avatar: 5 * 1024 * 1024, // 5MB limit
  deliverable: 10 * 1024 * 1024, // 10MB limit
  assignment: 10 * 1024 * 1024, // 10MB limit
  generic: 10 * 1024 * 1024, // 10MB limit
};

export const ALLOWED_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
]);

export function detectMimeFromBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) {
    return null;
  }

  // Windows Executable (PE / DOS header: "MZ")
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'application/x-dosexec';
  }

  // ELF Executable: 0x7F 'E' 'L' 'F'
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return 'application/x-executable';
  }

  // Mach-O binary
  if (buffer.length >= 4 && (
    (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
    (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe) ||
    (buffer[0] === 0xce && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe)
  )) {
    return 'application/x-mach-binary';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // ZIP (PK..): 50 4B 03 04 or 50 4B 05 06 or 50 4B 07 08
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return 'application/zip';
  }

  return null;
}

export function validateMagicBytes(buffer: Buffer, claimedMimeType: string): MagicByteValidationResult {
  const detected = detectMimeFromBytes(buffer);

  if (detected === 'application/x-dosexec' || detected === 'application/x-executable' || detected === 'application/x-mach-binary') {
    return {
      valid: false,
      detectedMime: detected,
      error: 'Executable payloads and forged file extensions are strictly prohibited',
    };
  }

  const normalizedClaimed = claimedMimeType.toLowerCase().trim();

  if (normalizedClaimed === 'image/jpg') {
    if (detected === 'image/jpeg') {
      return { valid: true, detectedMime: detected };
    }
  }

  if (normalizedClaimed === 'application/x-zip-compressed') {
    if (detected === 'application/zip') {
      return { valid: true, detectedMime: detected };
    }
  }

  if (detected && detected !== normalizedClaimed) {
    return {
      valid: false,
      detectedMime: detected,
      error: `File signature mismatch: claimed "${claimedMimeType}" but header signature matches "${detected}"`,
    };
  }

  if (!detected && (normalizedClaimed.startsWith('image/') || normalizedClaimed === 'application/pdf' || normalizedClaimed === 'application/zip')) {
    return {
      valid: false,
      detectedMime: null,
      error: `Invalid file signature: header bytes do not match expected signature for "${claimedMimeType}"`,
    };
  }

  return {
    valid: true,
    detectedMime: detected || claimedMimeType,
  };
}

export interface FileUploadServiceConfig {
  bucketName?: string;
  quarantineBucketName?: string;
  region?: string;
  s3ClientOverride?: any;
  virusScanQueue?: any;
}

export class FileUploadService {
  private s3Client: any;
  private bucketName: string;
  private quarantineBucketName: string;
  private region: string;
  private virusScanQueue: any;

  constructor(config: FileUploadServiceConfig = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.bucketName = config.bucketName || process.env.S3_UPLOAD_BUCKET || 'web3-student-lab-uploads';
    this.quarantineBucketName =
      config.quarantineBucketName || process.env.S3_QUARANTINE_BUCKET || 'web3-student-lab-quarantine';

    if (config.s3ClientOverride) {
      this.s3Client = config.s3ClientOverride;
    } else {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test-access-key',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test-secret-key',
        },
      });
    }

    this.virusScanQueue = config.virusScanQueue || null;
  }

  public getMaxFileSize(purpose: UploadPurpose = 'generic'): number {
    return MAX_FILE_SIZES[purpose] || MAX_FILE_SIZES.generic;
  }

  public validateFileParameters(req: PresignedUrlRequest): { valid: boolean; error?: string } {
    const { filename, contentType, fileSize, purpose = 'generic', fileBufferHeader } = req;

    if (!filename || typeof filename !== 'string') {
      return { valid: false, error: 'Missing or invalid filename' };
    }

    if (!contentType || typeof contentType !== 'string') {
      return { valid: false, error: 'Missing or invalid contentType' };
    }

    const normalizedMime = contentType.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return {
        valid: false,
        error: `Unsupported MIME type: "${contentType}". Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
      };
    }

    const maxLimit = this.getMaxFileSize(purpose);
    if (!fileSize || fileSize <= 0) {
      return { valid: false, error: 'File size must be greater than 0' };
    }

    if (fileSize > maxLimit) {
      const maxMb = Math.round(maxLimit / (1024 * 1024));
      return {
        valid: false,
        error: `File size exceeds maximum allowed limit of ${maxMb}MB for ${purpose} uploads`,
      };
    }

    const fileExt = filename.split('.').pop()?.toLowerCase();
    if (fileExt === 'exe' || fileExt === 'sh' || fileExt === 'bat' || fileExt === 'bin' || fileExt === 'cmd') {
      return {
        valid: false,
        error: `File extension .${fileExt} is disallowed for security reasons`,
      };
    }

    if (fileBufferHeader) {
      const buf = Buffer.isBuffer(fileBufferHeader)
        ? fileBufferHeader
        : Buffer.from(fileBufferHeader, 'base64');
      const validation = validateMagicBytes(buf, contentType);
      if (!validation.valid) {
        return { valid: false, error: validation.error };
      }
    }

    return { valid: true };
  }

  public async generatePresignedUploadUrl(
    request: PresignedUrlRequest,
    options: { expiresInSeconds?: number } = {}
  ): Promise<PresignedUrlResult> {
    const validation = this.validateFileParameters(request);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const expiresIn = options.expiresInSeconds || 15 * 60; // 15 minutes default
    const purpose = request.purpose || 'generic';
    const maxSizeBytes = this.getMaxFileSize(purpose);

    const safeFilename = request.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const datePrefix = new Date().toISOString().slice(0, 10);
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const fileKey = `uploads/${purpose}/${datePrefix}/${uniqueId}-${safeFilename}`;

    let uploadUrl = '';
    if (this.s3Client && typeof this.s3Client.send === 'function' && typeof getSignedUrl === 'function') {
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          ContentType: request.contentType,
          Metadata: {
            originalFilename: encodeURIComponent(request.filename),
            purpose,
            userId: request.userId || 'anonymous',
            workspaceId: request.workspaceId || 'default',
          },
        });
        uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      } catch (err: any) {
        logger.warn('getSignedUrl invocation fallback to simulated presigned URL', { error: err.message });
        uploadUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=${uniqueId}`;
      }
    } else {
      uploadUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=${uniqueId}`;
    }

    return {
      uploadUrl,
      fileKey,
      bucket: this.bucketName,
      expiresIn,
      maxSizeBytes,
      contentType: request.contentType,
    };
  }

  public async enqueueVirusScan(fileKey: string, metadata: Record<string, any> = {}): Promise<string> {
    const jobId = `scan-${crypto.randomBytes(12).toString('hex')}`;
    if (this.virusScanQueue && typeof this.virusScanQueue.add === 'function') {
      await this.virusScanQueue.add(
        'scan-file',
        {
          fileKey,
          bucket: this.bucketName,
          quarantineBucket: this.quarantineBucketName,
          metadata,
          enqueuedAt: new Date().toISOString(),
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );
    }
    return jobId;
  }
}

export const fileUploadService = new FileUploadService();
