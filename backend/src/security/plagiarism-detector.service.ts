import { Injectable, Logger } from '@nestjs/common';

/**
 * BE-033: Real-Time Fraud & Anomaly Detection Engine for Exercise Plagiarism.
 * Detects copy-paste submissions using Winnowing fingerprinting and AST analysis.
 */
@Injectable()
export class PlagiarismDetectorService {
  private readonly logger = new Logger(PlagiarismDetectorService.name);
  private readonly WINNOWING_WINDOW = 4;
  private readonly SIMILARITY_THRESHOLD = 0.85; // 85% similarity
  private previousSubmissions: Map<string, SubmissionFingerprint> = new Map();

  /**
   * Analyze submission for plagiarism.
   */
  async analyzeSubmission(
    submissionId: string,
    code: string,
    studentId: string,
  ): Promise<{
    isPlagiarized: boolean;
    similarityScore: number;
    matches: MatchDetail[];
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    try {
      // Extract winnowing fingerprint
      const fingerprint = this.generateWinnowingFingerprint(code);

      // Compare against previous submissions
      const matches = this.findSimilarSubmissions(fingerprint, studentId);

      // Calculate overall similarity
      const similarityScore = matches.length > 0 ? matches[0].similarity : 0;
      const isPlagiarized = similarityScore >= this.SIMILARITY_THRESHOLD;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (similarityScore >= 0.95) {
        riskLevel = 'high';
      } else if (similarityScore >= 0.75) {
        riskLevel = 'medium';
      }

      // Store for future comparisons
      this.previousSubmissions.set(submissionId, {
        fingerprint,
        studentId,
        code,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Submission ${submissionId}: similarity=${(similarityScore * 100).toFixed(1)}%, risk=${riskLevel}`,
      );

      return {
        isPlagiarized,
        similarityScore,
        matches: matches.slice(0, 3), // Top 3 matches
        riskLevel,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze submission: ${error}`);
      throw error;
    }
  }

  /**
   * Generate Winnowing fingerprint.
   * Selects minimum hash from each sliding window.
   */
  private generateWinnowingFingerprint(code: string): string[] {
    const tokens = this.tokenizeCode(code);
    const hashes = tokens.map((t) => this.hashToken(t));

    const fingerprint: string[] = [];
    for (let i = 0; i <= hashes.length - this.WINNOWING_WINDOW; i++) {
      const window = hashes.slice(i, i + this.WINNOWING_WINDOW);
      const minHash = window.reduce((min, h) => (h < min ? h : min));
      if (!fingerprint.length || minHash !== fingerprint[fingerprint.length - 1]) {
        fingerprint.push(minHash);
      }
    }

    return fingerprint;
  }

  /**
   * Tokenize Rust code into AST-like tokens.
   */
  private tokenizeCode(code: string): string[] {
    const tokens: string[] = [];

    // Remove comments
    let cleaned = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // Extract significant tokens
    const pattern =
      /\b(?:fn|let|mut|const|if|else|for|while|match|return|struct|impl|trait|pub|async|await|unwrap|expect)\b|\{|\}|;|,|=>/g;
    let match;

    while ((match = pattern.exec(cleaned))) {
      tokens.push(match[0]);
    }

    // Add function names and variable names
    const namePattern = /fn\s+(\w+)|let\s+(\w+)|const\s+(\w+)/g;
    while ((match = namePattern.exec(cleaned))) {
      const name = match[1] || match[2] || match[3];
      if (name) tokens.push(`NAME:${name}`);
    }

    return tokens;
  }

  /**
   * Hash a token to integer.
   */
  private hashToken(token: string): string {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash = hash & 0xffffffff; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Find similar submissions using fingerprint matching.
   */
  private findSimilarSubmissions(
    currentFingerprint: string[],
    studentId: string,
  ): MatchDetail[] {
    const matches: MatchDetail[] = [];

    for (const [submissionId, stored] of this.previousSubmissions) {
      // Skip own submissions
      if (stored.studentId === studentId) {
        continue;
      }

      const similarity = this.calculateFingerpraintSimilarity(currentFingerprint, stored.fingerprint);

      if (similarity >= 0.7) {
        // Report if >= 70% similar
        matches.push({
          submissionId,
          studentId: stored.studentId,
          similarity,
          commonTokenCount: this.countCommonTokens(currentFingerprint, stored.fingerprint),
        });
      }
    }

    // Sort by similarity descending
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity between two fingerprints.
   */
  private calculateFingerpraintSimilarity(fp1: string[], fp2: string[]): number {
    const common = this.countCommonTokens(fp1, fp2);
    const total = Math.max(fp1.length, fp2.length);
    return total === 0 ? 0 : common / total;
  }

  /**
   * Count common tokens between fingerprints.
   */
  private countCommonTokens(fp1: string[], fp2: string[]): number {
    const set1 = new Set(fp1);
    let common = 0;

    for (const token of fp2) {
      if (set1.has(token)) {
        common++;
        set1.delete(token);
      }
    }

    return common;
  }

  /**
   * Batch analyze multiple submissions.
   */
  async batchAnalyze(
    submissions: Array<{ id: string; code: string; studentId: string }>,
  ): Promise<
    Array<{
      submissionId: string;
      isPlagiarized: boolean;
      similarityScore: number;
      riskLevel: 'low' | 'medium' | 'high';
    }>
  > {
    const results = [];

    for (const submission of submissions) {
      const result = await this.analyzeSubmission(submission.id, submission.code, submission.studentId);
      results.push({
        submissionId: submission.id,
        isPlagiarized: result.isPlagiarized,
        similarityScore: result.similarityScore,
        riskLevel: result.riskLevel,
      });
    }

    return results;
  }

  /**
   * Clear analysis history.
   */
  clearHistory(): void {
    this.previousSubmissions.clear();
    this.logger.log('Plagiarism detection history cleared');
  }
}

interface SubmissionFingerprint {
  fingerprint: string[];
  studentId: string;
  code: string;
  timestamp: number;
}

interface MatchDetail {
  submissionId: string;
  studentId: string;
  similarity: number;
  commonTokenCount: number;
}
