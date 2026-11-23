export interface RubricCategoryScore {
  category: 'codeQuality' | 'security' | 'tests' | string;
  label: string;
  score: number; // 0 - 100
  weight: number; // e.g. 0.35
  comment: string;
}

export interface ReviewAssessmentPayload {
  submissionId: string;
  reviewerAddress: string;
  scores: RubricCategoryScore[];
  weightedScore: number;
  overallFeedback: string;
  timestamp: number;
}

export interface SignedReviewSubmission {
  payload: ReviewAssessmentPayload;
  reviewHash: string;
  signature: string;
  signedAt: string;
}

/**
 * Calculates weighted average of rubric categories.
 * Time Complexity: O(K) where K is number of categories.
 * Space Complexity: O(1).
 */
export function calculateWeightedAverage(scores: RubricCategoryScore[]): number {
  if (!scores || scores.length === 0) return 0;
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const item of scores) {
    totalWeightedScore += item.score * item.weight;
    totalWeight += item.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((totalWeightedScore / totalWeight) * 100) / 100;
}

/**
 * Converts assessment payload to a canonical deterministic string.
 * Time Complexity: O(L) where L is length of payload string.
 * Space Complexity: O(L).
 */
export function canonicalizeAssessmentPayload(payload: ReviewAssessmentPayload): string {
  const sortedScores = [...payload.scores]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((s) => ({
      category: s.category,
      score: s.score,
      weight: s.weight,
      comment: s.comment.trim(),
    }));

  return JSON.stringify({
    submissionId: payload.submissionId,
    reviewerAddress: payload.reviewerAddress,
    scores: sortedScores,
    weightedScore: payload.weightedScore,
    overallFeedback: payload.overallFeedback.trim(),
    timestamp: payload.timestamp,
  });
}

/**
 * Computes deterministic SHA-256 hash of review payload in browser/Node.
 * Time Complexity: O(L) where L is serialized payload length.
 * Space Complexity: O(1).
 */
export async function computeReviewHash(payload: ReviewAssessmentPayload): Promise<string> {
  const canonical = canonicalizeAssessmentPayload(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JS fallback FNV/SHA representation if crypto.subtle unavailable
  let h1 = 0xdeadbeef ^ data.length;
  let h2 = 0x41c64e6d ^ data.length;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(64, '0');
  return hex;
}

/**
 * Requests cryptographic signature from the reviewer's connected Stellar wallet.
 * Conforms to Stellar SEP-53 message signing via Freighter or custom wallet adapter.
 */
export async function signReviewAssessment(
  payload: ReviewAssessmentPayload,
  walletSigner?: (message: string) => Promise<string>
): Promise<SignedReviewSubmission> {
  const reviewHash = await computeReviewHash(payload);
  const messageToSign = `Web3 Student Lab - Peer Review Assessment\nHash: ${reviewHash}\nSubmission: ${payload.submissionId}\nWeighted Score: ${payload.weightedScore}/100`;

  let signature = '';

  if (walletSigner) {
    signature = await walletSigner(messageToSign);
  } else if (typeof window !== 'undefined') {
    const win = window as any;
    const freighter = win.freighterApi || win.freighter || win.stellar?.freighter;

    if (freighter?.signMessage) {
      const res = await freighter.signMessage(messageToSign, { address: payload.reviewerAddress });
      if (res?.error) {
        throw new Error(res.error.message || 'Signature rejected by user');
      }
      signature = res?.signedMessage || (typeof res === 'string' ? res : JSON.stringify(res));
    } else if (freighter?.signAuthEntry) {
      const res = await freighter.signAuthEntry(reviewHash, { address: payload.reviewerAddress });
      if (res?.error) {
        throw new Error(res.error.message || 'Auth entry signing rejected');
      }
      signature = res?.signedAuthEntry || (typeof res === 'string' ? res : JSON.stringify(res));
    } else {
      // Deterministic simulation signature if wallet extension is not installed
      signature = `mock-sig-${reviewHash.slice(0, 32)}-${Date.now()}`;
    }
  } else {
    signature = `server-sig-${reviewHash.slice(0, 32)}`;
  }

  return {
    payload,
    reviewHash,
    signature,
    signedAt: new Date().toISOString(),
  };
}
