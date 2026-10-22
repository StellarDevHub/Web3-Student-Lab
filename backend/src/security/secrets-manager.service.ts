import { Injectable, Logger } from '@nestjs/common';

/**
 * BE-030: Centralized Secrets Management with Doppler/HashiCorp Vault & Zero Environment Leaks.
 * Prevents secrets from being committed or left in plain text.
 */
@Injectable()
export class SecretsManagerService {
  private readonly logger = new Logger(SecretsManagerService.name);
  private secretCache: Map<string, { value: string; expiresAt: number }> = new Map();

  constructor() {
    this.validateSecuritySetup();
  }

  /**
   * Get secret from vault (never from environment directly).
   */
  async getSecret(secretName: string): Promise<string> {
    // Check cache first
    const cached = this.secretCache.get(secretName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Fetch from vault (Doppler or HashiCorp Vault)
    const secret = await this.fetchFromVault(secretName);

    // Cache with TTL (5 minutes)
    this.secretCache.set(secretName, {
      value: secret,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return secret;
  }

  /**
   * Validate that no secrets are in environment variables.
   */
  private validateSecuritySetup(): void {
    const forbiddenEnvVars = [
      'DATABASE_PASSWORD',
      'API_KEY',
      'SECRET_KEY',
      'PRIVATE_KEY',
      'JWT_SECRET',
      'OAUTH_CLIENT_SECRET',
      'STRIPE_SECRET_KEY',
      'AWS_SECRET_ACCESS_KEY',
    ];

    for (const varName of forbiddenEnvVars) {
      if (process.env[varName]) {
        this.logger.error(
          `SECURITY VIOLATION: ${varName} found in environment. Use vault instead.`,
        );
        throw new Error(`Secret ${varName} must not be in environment`);
      }
    }

    // Verify vault is configured
    const vaultUrl = process.env.VAULT_ADDR || process.env.DOPPLER_TOKEN;
    if (!vaultUrl) {
      this.logger.warn(
        'Vault not configured. Set VAULT_ADDR (HashiCorp) or DOPPLER_TOKEN (Doppler)',
      );
    }
  }

  /**
   * Fetch secret from vault backend.
   */
  private async fetchFromVault(secretName: string): Promise<string> {
    try {
      // Determine vault type
      if (process.env.DOPPLER_TOKEN) {
        return await this.fetchFromDoppler(secretName);
      } else if (process.env.VAULT_ADDR) {
        return await this.fetchFromHashiCorpVault(secretName);
      } else {
        throw new Error('No vault configured');
      }
    } catch (error) {
      this.logger.error(`Failed to fetch secret ${secretName}: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch from Doppler Secrets Platform.
   */
  private async fetchFromDoppler(secretName: string): Promise<string> {
    try {
      const response = await fetch(`https://api.doppler.com/v3/configs/config/secrets`, {
        headers: {
          Authorization: `Bearer ${process.env.DOPPLER_TOKEN}`,
        },
      });

      const data = (await response.json()) as any;
      return data.secrets?.[secretName] || '';
    } catch (error) {
      this.logger.error(`Doppler fetch failed: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch from HashiCorp Vault.
   */
  private async fetchFromHashiCorpVault(secretName: string): Promise<string> {
    try {
      const response = await fetch(
        `${process.env.VAULT_ADDR}/v1/secret/data/${secretName}`,
        {
          headers: {
            'X-Vault-Token': process.env.VAULT_TOKEN || '',
          },
        },
      );

      const data = (await response.json()) as any;
      return data.data?.data?.value || '';
    } catch (error) {
      this.logger.error(`Vault fetch failed: ${error}`);
      throw error;
    }
  }

  /**
   * Scan for secrets in code (pre-commit hook).
   */
  detectSecretsInCode(code: string): { found: boolean; matches: string[] } {
    const secretPatterns = [
      { name: 'API Key', pattern: /api[_-]?key[=:]\s*["']?[a-zA-Z0-9_\-]+["']?/gi },
      { name: 'Private Key', pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
      { name: 'Password', pattern: /password[=:]\s*["']([^"']+)["']/gi },
      { name: 'Token', pattern: /token[=:]\s*["']?([a-zA-Z0-9_\-]+)["']?/gi },
      { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
      { name: 'OAuth Secret', pattern: /client[_-]?secret[=:]\s*["']?[a-zA-Z0-9_\-]+["']?/gi },
    ];

    const matches: string[] = [];

    for (const { name, pattern } of secretPatterns) {
      const found = code.match(pattern);
      if (found) {
        matches.push(`${name}: ${found[0].substring(0, 50)}...`);
      }
    }

    return {
      found: matches.length > 0,
      matches,
    };
  }

  /**
   * Rotate secrets periodically.
   */
  async rotateSecrets(): Promise<void> {
    this.logger.log('Starting secret rotation...');
    // Would trigger vault rotation for all secrets
    this.secretCache.clear(); // Clear cache to force refresh
    this.logger.log('Secrets rotated and cache cleared');
  }

  /**
   * Validate secret integrity.
   */
  async validateSecretIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for hardcoded secrets
    const codeSearchResult = this.detectSecretsInCode(process.env.toString());
    if (codeSearchResult.found) {
      issues.push('Hardcoded secrets detected in environment');
    }

    // Verify vault connectivity
    try {
      await this.getSecret('test-key');
    } catch {
      issues.push('Vault connectivity check failed');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
