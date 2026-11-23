import { z } from 'zod';

/**
 * Server-side output contract for AI-generated hackathon project ideas
 * (#908). Every field the model is asked to produce is validated
 * against this schema before it is ever returned to the frontend —
 * malformed or out-of-contract output is rejected, never passed
 * through.
 */
export const ProjectIdeaSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(2000),
    keyFeatures: z.array(z.string().trim().min(3).max(300)).min(2).max(8),
    recommendedTech: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  })
  .strict();

export type ProjectIdea = z.infer<typeof ProjectIdeaSchema>;

/**
 * A minimal, deliberately conservative denylist of terms that must
 * never appear in a project idea returned to (largely student-age)
 * learners. This is not a general-purpose content-safety classifier —
 * it is a last-resort guardrail that rejects the most obviously
 * unsafe/off-platform outputs (e.g. a prompt-injected model trying to
 * describe how to build malware or scam infrastructure) so they are
 * replaced with a safe fallback instead of ever reaching the client.
 */
const UNSAFE_CONTENT_PATTERNS: RegExp[] = [
  /\bmalware\b/i,
  /\bransomware\b/i,
  /\bkeylogger\b/i,
  /\bphishing\b/i,
  /\brug\s*pull\b/i,
  /\bponzi\b/i,
  /\bexploit\s+(a\s+)?vulnerab/i,
  /\bddos\b/i,
  /\bhow to (hack|steal)\b/i,
  /\bweapon(s|ize|ization)?\b/i,
  /\bself[- ]harm\b/i,
  /\bexplicit\s+(sexual|adult)\b/i,
];

export interface IdeaSafetyCheck {
  safe: boolean;
  reason?: string;
}

/**
 * Scans a validated idea's free-text fields for the unsafe-content
 * denylist. Runs AFTER schema validation so we only ever content-check
 * well-formed structured data.
 */
export function checkIdeaSafety(idea: ProjectIdea): IdeaSafetyCheck {
  const haystack = [idea.title, idea.description, ...idea.keyFeatures, ...idea.recommendedTech]
    .join(' \n ')
    .toLowerCase();

  for (const pattern of UNSAFE_CONTENT_PATTERNS) {
    if (pattern.test(haystack)) {
      return { safe: false, reason: `Content matched unsafe pattern: ${pattern.source}` };
    }
  }

  return { safe: true };
}

/**
 * Parses and validates raw model output (typically `JSON.parse`d
 * response text) against the idea schema. Never throws on malformed
 * input — callers use the discriminated result to decide whether to
 * serve the idea or fall back to a safe default.
 */
export type IdeaValidationResult =
  | { valid: true; idea: ProjectIdea }
  | { valid: false; reason: string };

export function validateGeneratedIdea(raw: unknown): IdeaValidationResult {
  const parsed = ProjectIdeaSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, reason: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const safety = checkIdeaSafety(parsed.data);
  if (!safety.safe) {
    return { valid: false, reason: safety.reason ?? 'Content failed safety check' };
  }

  return { valid: true, idea: parsed.data };
}
