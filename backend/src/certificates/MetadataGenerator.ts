import {
  CertificateMetadata,
  CertificateCourseInfo,
  CertificateStudentInfo,
  CertificateVerificationInfo,
} from '../types/certificate.types.js';
import { Certificate } from '@prisma/client';
import { API_BASE_URL, ISSUER_NAME, ISSUER_DID } from '../config/rpcConfig.js';

export class MetadataGenerator {
  private readonly baseUrl: string;
  private readonly issuerName: string;
  private readonly issuerDid: string;

  constructor() {
    this.baseUrl = process.env.CERT_METADATA_BASE_URL || API_BASE_URL;
    this.issuerName = ISSUER_NAME;
    this.issuerDid = ISSUER_DID;
  }

  /**
   * Generates complete NFT-compliant certificate metadata
   */
  generate(
    certificate: Certificate & { student: any; course: any },
    course: any,
    student: any
  ): CertificateMetadata {
    // Build verification info
    const verification = this.buildVerificationInfo(certificate);

    // Build course info
    const courseInfo = this.buildCourseInfo(course, certificate);

    // Build student info
    const studentInfo = this.buildStudentInfo(student, certificate);

    // Generate certificate name and description
    const name = this.buildCertificateName(certificate, course, student);
    const description = this.buildCertificateDescription(certificate, course, student);

    // Build attributes (traits)
    const attributes = this.buildAttributes(certificate, course, student);

    // Build external URL (deep link to certificate viewer)
    const externalUrl = `${this.baseUrl}/certificates/${certificate.tokenId}/view`;

    // Build image URL
    const imageUrl = this.buildImageUrl(certificate);

    return {
      name,
      description,
      image: imageUrl,
      external_url: externalUrl,
      attributes,
      course: courseInfo,
      student: studentInfo,
      verification,
      standard: 'Stellar NFT Certificate v1.0',
      version: '1.0.0',
    };
  }

  /**
   * Builds certificate verification info
   */
  private buildVerificationInfo(certificate: Certificate): CertificateVerificationInfo {
    return {
      certificateId: certificate.id,
      mintedAt: certificate.issuedAt.toISOString(),
      contractAddress:
        certificate.contractAddress ||
        process.env.CERTIFICATE_CONTRACT_ADDRESS ||
        'GUNKNOWNCONTRACT',
      tokenId: certificate.tokenId || '',
      network: certificate.network || 'stellar-testnet',
      issuerDid: this.issuerDid,
    };
  }

  /**
   * Builds course information object
   */
  private buildCourseInfo(course: any, certificate: Certificate): CertificateCourseInfo {
    const dateStr = certificate.issuedAt.toISOString().split('T')[0] || '';
    return {
      id: course.id,
      title: course.title,
      instructor: course.instructor,
      credits: course.credits,
      completionDate: dateStr,
      grade: certificate.grade || undefined,
    };
  }

  /**
   * Builds student information object (privacy-aware, no email)
   */
  private buildStudentInfo(student: any, certificate: Certificate): CertificateStudentInfo {
    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const walletAddress = student.walletAddress || this.extractWalletFromDid(certificate.did);

    return {
      name: fullName || 'Web3 Student',
      walletAddress: walletAddress || '',
    };
  }

  /**
   * Extracts wallet address from DID if needed
   */
  private extractWalletFromDid(did?: string | null): string {
    if (!did) return '';

    // did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT
    const parts = did.split(':');
    if (parts.length === 3 && parts[0] === 'did' && parts[1] === 'stellar') {
      return parts[2] || '';
    }
    return '';
  }

  /**
   * Builds certificate display name
   */
  private buildCertificateName(certificate: Certificate, course: any, student: any): string {
    const courseName = course.title;
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

    return `${studentName} - ${courseName} Certificate`;
  }

  /**
   * Builds certificate description
   */
  private buildCertificateDescription(certificate: Certificate, course: any, student: any): string {
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const completionDate = certificate.issuedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let desc = `This certifies that ${studentName} has successfully completed the course "${course.title}" on ${completionDate}. `;
    desc += `The course was taught by ${course.instructor} and awarded ${course.credits} credits. `;

    if (certificate.grade) {
      desc += `Final grade: ${certificate.grade}.`;
    }

    return desc;
  }

  /**
   * Builds NFT trait attributes list
   */
  private buildAttributes(
    certificate: Certificate,
    course: any,
    student: any
  ): Array<{ trait_type: string; value: string | number }> {
    const attributes = [
      {
        trait_type: 'Course Title',
        value: course.title,
      },
      {
        trait_type: 'Instructor',
        value: course.instructor,
      },
      {
        trait_type: 'Credits',
        value: course.credits,
      },
      {
        trait_type: 'Completion Date',
        value: certificate.issuedAt.toISOString().split('T')[0],
      },
      {
        trait_type: 'Certificate ID',
        value: certificate.tokenId || certificate.id,
      },
      {
        trait_type: 'Issuer',
        value: this.issuerName,
      },
      {
        trait_type: 'Standard',
        value: 'Stellar NFT Certificate v1.0',
      },
    ];

    if (certificate.grade) {
      attributes.push({
        trait_type: 'Grade',
        value: certificate.grade,
      });
    }

    if (certificate.did) {
      attributes.push({
        trait_type: 'Student DID',
        value: certificate.did,
      });
    }

    return attributes;
  }

  /**
   * Builds image URL for the certificate PNG
   */
  private buildImageUrl(certificate: Certificate): string {
    // In production, this would be a hosted image generated by a service
    // For demo, use a placeholder service with certificate details
    const tokenId = certificate.tokenId || 'unknown';
    const encodedId = encodeURIComponent(tokenId);

    // Could point to a CDN-hosted generated image
    return `${this.baseUrl}/api/v1/certificates/${certificate.id}/image?format=png`;

    // Or use a placeholder service (for demo)
    // return `https://placehold.co/600x400/1a56db/white?text=Certificate+${encodedId}`;
  }

  /**
   * Generates the full metadata URI for on-chain NFT
   * On-chain contracts point to off-chain JSON metadata
   */
  public generateMetadataUri(tokenId: string): string {
    // For Stellar NFTs on Soroban, metadata URI is typically set per token
    return `${this.baseUrl}/api/v1/certificates/metadata/${tokenId}`;
  }
}

export const metadataGenerator = new MetadataGenerator();
