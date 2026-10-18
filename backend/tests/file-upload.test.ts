import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  FileUploadService,
  detectMimeFromBytes,
  validateMagicBytes,
  MAX_FILE_SIZES,
} from '../src/services/fileUploadService.js';
import { ClamAVScanner, VirusScanWorker } from '../src/workers/virusScanWorker.js';

describe('Secure File Upload Service ([BE-044])', () => {
  let fileUploadService: FileUploadService;
  let mockS3Client: any;
  let mockQueue: any;

  beforeEach(() => {
    mockS3Client = {
      send: jest.fn<any>().mockResolvedValue({
        Body: Buffer.from('mock-file-content'),
      }),
    };
    mockQueue = {
      add: jest.fn<any>().mockResolvedValue({ id: 'mock-job-id' }),
    };

    fileUploadService = new FileUploadService({
      bucketName: 'test-bucket',
      quarantineBucketName: 'test-quarantine-bucket',
      region: 'us-east-1',
      s3ClientOverride: mockS3Client,
      virusScanQueue: mockQueue,
    });
  });

  describe('Pre-Signed URL Generation & S3 Pipeline', () => {
    it('generates a 15-minute time-limited pre-signed upload URL', async () => {
      const result = await fileUploadService.generatePresignedUploadUrl(
        {
          filename: 'course-deliverable.pdf',
          contentType: 'application/pdf',
          fileSize: 1024 * 500, // 500KB
          purpose: 'deliverable',
        },
        { expiresInSeconds: 15 * 60 }
      );

      expect(result).toBeDefined();
      expect(result.expiresIn).toBe(900); // 15 minutes = 900 seconds
      expect(result.uploadUrl).toBeDefined();
      expect(result.uploadUrl).toContain('uploads/deliverable/');
      expect(result.bucket).toBe('test-bucket');
      expect(result.maxSizeBytes).toBe(10 * 1024 * 1024); // 10MB limit for deliverables
    });

    it('enforces maximum file size limit of 5MB for images', async () => {
      const overLimitSize = 5 * 1024 * 1024 + 1; // 5MB + 1 byte

      await expect(
        fileUploadService.generatePresignedUploadUrl({
          filename: 'avatar.png',
          contentType: 'image/png',
          fileSize: overLimitSize,
          purpose: 'image',
        })
      ).rejects.toThrow(/exceeds maximum allowed limit of 5MB/i);
    });

    it('enforces maximum file size limit of 10MB for deliverables', async () => {
      const overLimitSize = 10 * 1024 * 1024 + 1; // 10MB + 1 byte

      await expect(
        fileUploadService.generatePresignedUploadUrl({
          filename: 'project_submission.pdf',
          contentType: 'application/pdf',
          fileSize: overLimitSize,
          purpose: 'deliverable',
        })
      ).rejects.toThrow(/exceeds maximum allowed limit of 10MB/i);
    });

    it('rejects forbidden file extensions like .exe, .sh, .bat', async () => {
      await expect(
        fileUploadService.generatePresignedUploadUrl({
          filename: 'malicious.exe',
          contentType: 'image/png',
          fileSize: 1024,
          purpose: 'image',
        })
      ).rejects.toThrow(/disallowed for security reasons/i);
    });
  });

  describe('Magic Byte Signature Verification & Extension Forgery Rejection', () => {
    it('detects and rejects executable Windows PE header (MZ) disguised as PNG', () => {
      // 0x4D, 0x5A is the DOS / PE "MZ" header
      const forgedExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const detected = detectMimeFromBytes(forgedExeBuffer);
      expect(detected).toBe('application/x-dosexec');

      const validation = validateMagicBytes(forgedExeBuffer, 'image/png');
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/Executable payloads and forged file extensions are strictly prohibited/i);
    });

    it('detects and rejects ELF binary disguised as PDF', () => {
      // 0x7F, 'E', 'L', 'F'
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const detected = detectMimeFromBytes(elfBuffer);
      expect(detected).toBe('application/x-executable');

      const validation = validateMagicBytes(elfBuffer, 'application/pdf');
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/Executable payloads and forged file extensions are strictly prohibited/i);
    });

    it('validates authentic PNG file signatures', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const detected = detectMimeFromBytes(pngHeader);
      expect(detected).toBe('image/png');

      const validation = validateMagicBytes(pngHeader, 'image/png');
      expect(validation.valid).toBe(true);
      expect(validation.detectedMime).toBe('image/png');
    });

    it('validates authentic JPEG file signatures', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const detected = detectMimeFromBytes(jpegHeader);
      expect(detected).toBe('image/jpeg');

      const validation = validateMagicBytes(jpegHeader, 'image/jpeg');
      expect(validation.valid).toBe(true);
      expect(validation.detectedMime).toBe('image/jpeg');
    });

    it('validates authentic PDF file signatures', () => {
      // %PDF-
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
      const detected = detectMimeFromBytes(pdfHeader);
      expect(detected).toBe('application/pdf');

      const validation = validateMagicBytes(pdfHeader, 'application/pdf');
      expect(validation.valid).toBe(true);
      expect(validation.detectedMime).toBe('application/pdf');
    });

    it('rejects mismatched file types (e.g. PDF bytes claimed as JPEG)', () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
      const validation = validateMagicBytes(pdfHeader, 'image/jpeg');
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/File signature mismatch/i);
    });
  });

  describe('Asynchronous ClamAV Virus Scanning & Quarantine Worker', () => {
    it('quarantines malicious payloads detected by the scanner', async () => {
      const eicarPayload = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
      );

      const mockScanner = {
        scanBuffer: jest.fn<any>().mockResolvedValue({
          isInfected: true,
          virusName: 'Eicar-Test-Signature',
        }),
      } as unknown as ClamAVScanner;

      mockS3Client.send = jest.fn<any>().mockImplementation(async (command: any) => {
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(eicarPayload),
          },
        };
      });

      const worker = new VirusScanWorker({
        scanner: mockScanner,
        s3Client: mockS3Client,
      });

      const result = await worker.scanFile('uploads/test-virus.txt', 'test-bucket', 'test-quarantine-bucket');

      expect(result.isInfected).toBe(true);
      expect(result.virusName).toBe('Eicar-Test-Signature');
      expect(result.quarantined).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalledTimes(3); // GetObject, CopyObject (quarantine), DeleteObject (cleanup)
    });

    it('marks clean files as uninfected and does not quarantine', async () => {
      const mockScanner = {
        scanBuffer: jest.fn<any>().mockResolvedValue({
          isInfected: false,
          virusName: null,
        }),
      } as unknown as ClamAVScanner;

      mockS3Client.send = jest.fn<any>().mockResolvedValue({
        Body: {
          transformToByteArray: async () => new Uint8Array(Buffer.from('Clean file contents')),
        },
      });

      const worker = new VirusScanWorker({
        scanner: mockScanner,
        s3Client: mockS3Client,
      });

      const result = await worker.scanFile('uploads/clean-doc.pdf', 'test-bucket');

      expect(result.isInfected).toBe(false);
      expect(result.virusName).toBeNull();
      expect(result.quarantined).toBe(false);
      expect(mockS3Client.send).toHaveBeenCalledTimes(1); // Only GetObject
    });
  });
});
