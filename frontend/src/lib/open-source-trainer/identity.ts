export type IdentityVerificationMethod = 'stellar-wallet-attestation' | 'github-contributor-proof';

export interface DecentralizedIdentityProfile {
  did: string;
  walletAddress: string;
  githubHandle: string;
  contributorTier: 'newcomer' | 'reviewer' | 'maintainer';
  skills: string[];
}

export interface IdentityVerificationAttestation {
  id: string;
  issuer: string;
  method: IdentityVerificationMethod;
  challenge: string;
  subject: DecentralizedIdentityProfile;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export interface IdentityVerificationResult {
  isValid: boolean;
  reason: string;
  checks: {
    did: boolean;
    walletAddress: boolean;
    githubHandle: boolean;
    chronology: boolean;
    signature: boolean;
  };
}

const STORAGE_KEY = 'open_source_identity_verification';
const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;
const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;
const GITHUB_HANDLE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const DEFAULT_ISSUER = 'did:web:web3studentlab.dev';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function canonicalizeProfile(profile: DecentralizedIdentityProfile): string {
  return JSON.stringify({
    did: normalizeDid(profile.did),
    walletAddress: profile.walletAddress.trim().toUpperCase(),
    githubHandle: profile.githubHandle.trim().replace(/^@/, '').toLowerCase(),
    contributorTier: profile.contributorTier,
    skills: [...profile.skills].map((skill) => skill.trim().toLowerCase()).sort(),
  });
}

function createAttestationId(): string {
  return `att_${Math.random().toString(36).slice(2, 14)}`;
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeDid(did: string): string {
  return did.trim().toLowerCase();
}

export function isValidDid(did: string): boolean {
  return DID_PATTERN.test(normalizeDid(did));
}

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_PUBLIC_KEY_PATTERN.test(address.trim().toUpperCase());
}

export function isValidGithubHandle(handle: string): boolean {
  return GITHUB_HANDLE_PATTERN.test(handle.trim().replace(/^@/, ''));
}

export async function createIdentityChallenge(profile: DecentralizedIdentityProfile): Promise<string> {
  const fingerprint = await sha256(canonicalizeProfile(profile));
  return `verify:${normalizeDid(profile.did)}:${fingerprint.slice(0, 16)}`;
}

export async function createIdentityAttestation(
  profile: DecentralizedIdentityProfile,
  options?: {
    issuer?: string;
    method?: IdentityVerificationMethod;
    now?: number;
    ttlMs?: number;
  }
): Promise<IdentityVerificationAttestation> {
  const now = options?.now ?? Date.now();
  const challenge = await createIdentityChallenge(profile);
  const issuedAt = now;
  const expiresAt = now + (options?.ttlMs ?? DEFAULT_TTL_MS);
  const issuer = options?.issuer ?? DEFAULT_ISSUER;
  const method = options?.method ?? 'stellar-wallet-attestation';
  const normalizedProfile: DecentralizedIdentityProfile = {
    ...profile,
    did: normalizeDid(profile.did),
    walletAddress: profile.walletAddress.trim().toUpperCase(),
    githubHandle: profile.githubHandle.trim().replace(/^@/, ''),
    skills: profile.skills.map((skill) => skill.trim()).filter(Boolean),
  };

  const signature = await sha256(
    JSON.stringify({
      challenge,
      issuer,
      method,
      issuedAt,
      expiresAt,
      subject: canonicalizeProfile(normalizedProfile),
    })
  );

  return {
    id: createAttestationId(),
    issuer,
    method,
    challenge,
    subject: normalizedProfile,
    issuedAt,
    expiresAt,
    signature,
  };
}

export async function verifyIdentityAttestation(
  attestation: IdentityVerificationAttestation,
  now = Date.now()
): Promise<IdentityVerificationResult> {
  const checks = {
    did: isValidDid(attestation.subject.did),
    walletAddress: isValidStellarAddress(attestation.subject.walletAddress),
    githubHandle: isValidGithubHandle(attestation.subject.githubHandle),
    chronology:
      attestation.issuedAt <= now &&
      attestation.expiresAt > now &&
      attestation.expiresAt > attestation.issuedAt,
    signature: false,
  };

  const expectedSignature = await sha256(
    JSON.stringify({
      challenge: attestation.challenge,
      issuer: attestation.issuer,
      method: attestation.method,
      issuedAt: attestation.issuedAt,
      expiresAt: attestation.expiresAt,
      subject: canonicalizeProfile(attestation.subject),
    })
  );

  checks.signature = expectedSignature === attestation.signature;

  const isValid = Object.values(checks).every(Boolean);
  const reason = isValid
    ? 'Identity attestation is valid and ready for contribution workflows.'
    : !checks.did
      ? 'Invalid DID format.'
      : !checks.walletAddress
        ? 'Invalid Stellar wallet address.'
        : !checks.githubHandle
          ? 'Invalid GitHub handle.'
          : !checks.chronology
            ? 'Attestation is expired or has inconsistent timestamps.'
            : 'Attestation signature does not match the payload.';

  return { isValid, reason, checks };
}

export const IdentityVerificationStore = {
  load(): IdentityVerificationAttestation | null {
    if (typeof window === 'undefined') return null;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as IdentityVerificationAttestation;
    } catch {
      return null;
    }
  },

  save(attestation: IdentityVerificationAttestation): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attestation));
  },

  clear(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
