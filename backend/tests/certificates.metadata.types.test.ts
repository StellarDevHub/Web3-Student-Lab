/**
 * Type-boundary tests for the certificate metadata generator.
 *
 * These cover the shapes that CertificateService passes into
 * MetadataGenerator now that the module is fully type-checked:
 *   - a full Prisma Certificate row
 *   - a narrowed `select` projection of Student (no email / PII)
 */

import type { Certificate } from '@prisma/client';
import {
  MetadataGenerator,
  MetadataCourseInput,
  MetadataStudentInput,
} from '../src/certificates/MetadataGenerator.js';

const generator = new MetadataGenerator();

const issuedAt = new Date('2026-01-15T10:00:00.000Z');

const certificate: Certificate = {
  id: 'cert-1',
  workspaceId: 'default',
  studentId: 'student-1',
  courseId: 'course-1',
  tokenId: '4242',
  issuedAt,
  certificateHash: 'tx-hash',
  status: 'ACTIVE',
  did: 'did:stellar:GCERTSTUDENTWALLET',
  metadataUri: null,
  contractAddress: 'CCONTRACT',
  network: 'stellar-testnet',
  grade: 'A',
  revokedAt: null,
  revocationReason: null,
  revokedBy: null,
  previousVersionId: null,
  transactionHash: 'tx-hash',
  createdAt: issuedAt,
  updatedAt: issuedAt,
};

const course: MetadataCourseInput = {
  id: 'course-1',
  title: 'Soroban Smart Contracts',
  instructor: 'Ada Lovelace',
  credits: 4,
};

describe('MetadataGenerator type boundaries', () => {
  it('builds metadata from a full Prisma row and a narrowed student projection', () => {
    const student: MetadataStudentInput = {
      firstName: 'Grace',
      lastName: 'Hopper',
      walletAddress: 'GWALLETADDRESS',
    };

    const metadata = generator.generate(certificate, course, student);

    expect(metadata.name).toBe('Grace Hopper - Soroban Smart Contracts Certificate');
    expect(metadata.course).toEqual({
      id: 'course-1',
      title: 'Soroban Smart Contracts',
      instructor: 'Ada Lovelace',
      credits: 4,
      completionDate: '2026-01-15',
      grade: 'A',
    });
    expect(metadata.student).toEqual({
      name: 'Grace Hopper',
      walletAddress: 'GWALLETADDRESS',
    });
    expect(metadata.verification.tokenId).toBe('4242');
    expect(metadata.verification.contractAddress).toBe('CCONTRACT');
  });

  it('falls back to the certificate DID when the student has no wallet address', () => {
    const student: MetadataStudentInput = {
      firstName: null,
      lastName: null,
      walletAddress: null,
    };

    const metadata = generator.generate(certificate, course, student);

    expect(metadata.student.walletAddress).toBe('GCERTSTUDENTWALLET');
    expect(metadata.student.name).toBe('Web3 Student');
  });

  it('honours explicit image and external URL overrides', () => {
    const metadata = generator.generate(
      certificate,
      course,
      { firstName: 'Grace', lastName: 'Hopper' },
      { imageUri: 'ipfs://image-cid', externalUrl: 'https://example.test/cert/4242' }
    );

    expect(metadata.image).toBe('ipfs://image-cid');
    expect(metadata.external_url).toBe('https://example.test/cert/4242');
  });

  it('exposes completion date and grade as NFT attributes', () => {
    const metadata = generator.generate(certificate, course, { firstName: 'Grace' });
    const traits = new Map(metadata.attributes.map((a) => [a.trait_type, a.value]));

    expect(traits.get('Completion Date')).toBe('2026-01-15');
    expect(traits.get('Grade')).toBe('A');
    expect(traits.get('Credits')).toBe(4);
  });
});
