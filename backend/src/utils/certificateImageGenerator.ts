import { CertificateImageOptions } from '../types/certificate.types.js';
import logger from './logger.js';

/**
 * Certificate Image Generator
 * Generates SVG certificate images (PNG via external conversion if needed)
 * Works without native dependencies
 */
export class CertificateImageGenerator {
  private readonly width: number;
  private readonly height: number;

  constructor() {
    this.width = 1200;
    this.height = 800;
  }

  /**
   * Generates a certificate as SVG buffer
   * Returns SVG XML that can be served directly or converted to PNG
   */
  async generateCertificateImage(options: CertificateImageOptions): Promise<Buffer> {
    try {
      const svg = this.generateSVG(options);
      return Buffer.from(svg, 'utf-8');
    } catch (error) {
      logger.error('Failed to generate certificate image:', error);
      throw new Error(
        `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates a professional SVG certificate
   */
  private generateSVG(options: CertificateImageOptions): string {
    const {
      studentName,
      courseTitle,
      instructor,
      completionDate,
      grade,
      credentialId,
      issuerName,
    } = options;

    const formattedDate = new Date(completionDate).toLocaleDateString();
    const gradeSection = grade
      ? `
    <text x="50%" y="650" font-family="Arial" font-size="22" fill="#374151" text-anchor="middle">Final Grade: ${grade}</text>`
      : '';

    return `<svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, Helvetica, sans-serif;">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff"/>
  
  <!-- Decorative border -->
  <rect x="40" y="40" width="${this.width - 80}" height="${this.height - 80}" fill="none" stroke="#1a56db" stroke-width="6"/>
  <rect x="50" y="50" width="${this.width - 100}" height="${this.height - 100}" fill="none" stroke="#e5e7eb" stroke-width="2"/>
  
  <!-- Header banner -->
  <rect x="50" y="50" width="${this.width - 100}" height="100" fill="#1a56db" rx="4"/>
  
  <!-- Title -->
  <text x="50%" y="105" font-family="Arial" font-size="40" font-weight="bold" fill="white" text-anchor="middle">Certificate of Completion</text>
  
  <!-- Credential ID -->
  <text x="50%" y="170" font-family="Arial" font-size="16" fill="#6b7280" text-anchor="middle">Credential ID: ${this.escapeXml(credentialId)}</text>
  
  <!-- "This certifies that" -->
  <text x="50%" y="260" font-family="Arial" font-size="26" fill="#374151" text-anchor="middle">This certifies that</text>
  
  <!-- Student name -->
  <text x="50%" y="340" font-family="Arial" font-size="52" font-weight="bold" fill="#1a56db" text-anchor="middle">${this.escapeXml(studentName)}</text>
  
  <!-- Course completion text -->
  <text x="50%" y="420" font-family="Arial" font-size="26" fill="#374151" text-anchor="middle">has successfully completed the course</text>
  
  <!-- Course title -->
  <text x="50%" y="500" font-family="Arial" font-size="38" font-weight="bold" fill="#111827" text-anchor="middle">"${this.escapeXml(courseTitle)}"</text>
  
  <!-- Instructor -->
  <text x="50%" y="570" font-family="Arial" font-size="22" fill="#4b5563" text-anchor="middle">Instructor: ${this.escapeXml(instructor)}</text>
  
  <!-- Completion date -->
  <text x="50%" y="630" font-family="Arial" font-size="20" fill="#6b7280" text-anchor="middle">Completion Date: ${formattedDate}</text>
  
  ${gradeSection}
  
  <!-- Issuer -->
  <text x="50%" y="730" font-family="Arial" font-size="24" font-weight="bold" fill="#111827" text-anchor="middle">${this.escapeXml(issuerName)}</text>
  
  <!-- Generated timestamp -->
  <text x="50%" y="${this.height - 60}" font-family="Arial" font-size="12" fill="#9ca3af" text-anchor="middle">Generated: ${new Date().toISOString().split('T')[0]}</text>
</svg>`;
  }

  /**
   * Escapes XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Gets available template styles
   */
  getTemplateNames(): string[] {
    return ['professional-blue', 'modern-minimal', 'classic-gold', 'tech-dark'];
  }
}

export const certificateImageGenerator = new CertificateImageGenerator();
