import { createHash } from 'crypto';
import logger from '../utils/logger.js';

/**
 * Plagiarism / anti-cheat heuristics for exercise submissions (BE-098).
 *
 * Pipeline:
 *   1. Tokenize source into a lexical stream (keywords, punctuation, literals,
 *      identifiers). Identifiers are normalized to positional placeholders and
 *      comments/whitespace are discarded, so renamed variables and edited
 *      comments do not defeat detection.
 *   2. Build a normalized structural signature: the token stream is reduced to
 *      a sequence of canonical tokens, from which an abstract shape (AST-like
 *      token sequence) is derived by collapsing identifiers and literals.
 *   3. Compare submissions using a normalized Levenshtein distance over the
 *      structural sequences and a Jaccard similarity over k-gram fingerprints.
 *      The final structural similarity is the max of the two signals, which
 *      keeps detection robust to both local edits and reordered blocks.
 *   4. Submissions at or above SIMILARITY_FLAG_THRESHOLD (85%) against any
 *      other submission for the same exercise are flagged for instructor review.
 */

export const SIMILARITY_FLAG_THRESHOLD = 0.85;

/** Hard upper bound on source length compared, to guarantee latency budgets. */
export const MAX_COMPARABLE_TOKENS = 4000;

const K_GRAM_SIZE = 5;

const KEYWORDS = new Set([
  'abstract', 'as', 'assert', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'delete', 'do', 'else', 'emit', 'enum', 'event', 'export', 'external',
  'for', 'function', 'if', 'import', 'in', 'indexed', 'interface', 'internal', 'let',
  'library', 'mapping', 'memory', 'modifier', 'new', 'override', 'payable', 'pragma',
  'private', 'public', 'pure', 'require', 'return', 'returns', 'revert', 'storage',
  'struct', 'throw', 'try', 'type', 'unchecked', 'using', 'var', 'view', 'virtual',
  'while', 'contract', 'constructor', 'fn', 'pub', 'mut', 'impl', 'struct', 'let',
  'return', 'if', 'else', 'loop', 'match', 'true', 'false', 'null', 'undefined',
  'const', 'var', 'function', 'async', 'await', 'export', 'import', 'from', 'this',
]);

export type TokenKind = 'keyword' | 'identifier' | 'literal' | 'punct';

export interface Token {
  kind: TokenKind;
  value: string;
}

export interface SimilarityResult {
  score: number;
  levenshteinSimilarity: number;
  fingerprintSimilarity: number;
}

export interface SimilarityMatch {
  otherSubmissionId: string;
  score: number;
}

export interface AntiCheatReport {
  submissionId: string;
  flagged: boolean;
  maxScore: number;
  matches: SimilarityMatch[];
  durationMs: number;
}

export interface ExerciseSubmissionSource {
  id: string;
  source: string;
}

/**
 * Lexer producing a language-agnostic token stream. Comments and whitespace
 * are dropped; identifiers and literals are kept as kinds so they can be
 * normalized independently of their concrete spelling.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // Hash-style comment (Rust attributes are not comments, but `#` line
    // comments are common in other exercise languages).
    if (ch === '#' && !/[\[!]/.test(source[i + 1] ?? '')) {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      tokens.push({ kind: 'literal', value: 'STR' });
      continue;
    }

    // Numeric literal (incl. hex)
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9a-fA-FxX_.]/.test(source[i])) i++;
      tokens.push({ kind: 'literal', value: 'NUM' });
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i])) i++;
      const word = source.slice(start, i);
      if (KEYWORDS.has(word)) {
        tokens.push({ kind: 'keyword', value: word });
      } else {
        tokens.push({ kind: 'identifier', value: word });
      }
      continue;
    }

    // Punctuation / operators (single char granularity keeps structure intact)
    tokens.push({ kind: 'punct', value: ch });
    i++;
  }

  return tokens;
}

/**
 * Normalizes a token stream into an abstract structural sequence. Identifiers
 * are replaced by their first-appearance index (alpha-renaming invariance),
 * literals collapse to their kind, and keywords/punctuation are preserved.
 */
export function normalizeTokens(tokens: Token[]): string[] {
  const slots = new Map<string, number>();
  const out: string[] = [];

  for (const tok of tokens.slice(0, MAX_COMPARABLE_TOKENS)) {
    switch (tok.kind) {
      case 'identifier': {
        let slot = slots.get(tok.value);
        if (slot === undefined) {
          slot = slots.size;
          slots.set(tok.value, slot);
        }
        out.push(`ID${slot}`);
        break;
      }
      case 'literal':
        out.push(`LIT:${tok.value}`);
        break;
      case 'keyword':
        out.push(`KW:${tok.value}`);
        break;
      case 'punct':
        out.push(tok.value);
        break;
    }
  }

  return out;
}

/** Normalized Levenshtein similarity in [0, 1]. */
export function levenshteinSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  const distance = prev[b.length];
  return 1 - distance / maxLen;
}

/** Set of hashed k-gram fingerprints over the normalized sequence. */
export function fingerprint(seq: string[], k: number = K_GRAM_SIZE): Set<string> {
  const prints = new Set<string>();
  if (seq.length < k) {
    if (seq.length > 0) prints.add(hashGram(seq));
    return prints;
  }
  for (let i = 0; i + k <= seq.length; i++) {
    prints.add(hashGram(seq.slice(i, i + k)));
  }
  return prints;
}

function hashGram(gram: string[]): string {
  return createHash('sha1').update(gram.join('\u0000')).digest('hex').slice(0, 16);
}

/** Jaccard similarity over fingerprint sets, in [0, 1]. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Computes the structural similarity between two sources. The score is the
 * maximum of the edit-distance signal and the fingerprint signal, so either
 * a near-verbatim copy or a copy with reordered blocks is caught.
 */
export function computeSimilarity(sourceA: string, sourceB: string): SimilarityResult {
  const seqA = normalizeTokens(tokenize(sourceA));
  const seqB = normalizeTokens(tokenize(sourceB));

  const levenshteinSim = levenshteinSimilarity(seqA, seqB);
  const fpSim = jaccardSimilarity(fingerprint(seqA), fingerprint(seqB));

  return {
    score: Math.max(levenshteinSim, fpSim),
    levenshteinSimilarity: levenshteinSim,
    fingerprintSimilarity: fpSim,
  };
}

/**
 * Compares a single submission against all prior submissions for the same
 * exercise and reports any that meet or exceed the flag threshold.
 */
export function analyzeSubmission(
  target: ExerciseSubmissionSource,
  others: ExerciseSubmissionSource[]
): AntiCheatReport {
  const started = process.hrtime.bigint();

  const targetSeq = normalizeTokens(tokenize(target.source));
  const targetPrints = fingerprint(targetSeq);

  const matches: SimilarityMatch[] = [];
  let maxScore = 0;

  for (const other of others) {
    if (other.id === target.id) continue;
    const otherSeq = normalizeTokens(tokenize(other.source));
    const levenshteinSim = levenshteinSimilarity(targetSeq, otherSeq);
    const fpSim = jaccardSimilarity(targetPrints, fingerprint(otherSeq));
    const score = Math.max(levenshteinSim, fpSim);
    maxScore = Math.max(maxScore, score);
    if (score >= SIMILARITY_FLAG_THRESHOLD) {
      matches.push({ otherSubmissionId: other.id, score: round(score) });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;

  if (durationMs > 500) {
    logger.warn('[antiCheat] Comparison exceeded latency budget', {
      submissionId: target.id,
      durationMs,
      comparisons: others.length,
    });
  }

  const report: AntiCheatReport = {
    submissionId: target.id,
    flagged: matches.length > 0,
    maxScore: round(maxScore),
    matches,
    durationMs: round(durationMs),
  };

  if (report.flagged) {
    logger.warn('[antiCheat] Submission flagged for similarity', {
      submissionId: target.id,
      maxScore: report.maxScore,
      matchCount: matches.length,
    });
  }

  return report;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
