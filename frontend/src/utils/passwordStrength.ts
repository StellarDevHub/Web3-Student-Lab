export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  entropy: number;
  warning: string | null;
  suggestions: string[];
  isValid: boolean;
}

const COMMON_PATTERNS = [
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'admin',
  'letmein',
  'welcome',
  'stellar',
  'soroban',
  'blockchain',
  'crypto',
  'web3lab',
];

/**
 * Calculates password strength score (0 to 4) based on zxcvbn entropy principles.
 * Registration requires a score of at least 3.
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      entropy: 0,
      warning: 'Password is required.',
      suggestions: ['Enter a passphrase with at least 10 characters using mixed case, numbers, and symbols.'],
      isValid: false,
    };
  }

  const length = password.length;
  let poolSize = 0;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasDigit) poolSize += 10;
  if (hasSymbol) poolSize += 33;

  // Base entropy calculation: E = length * log2(poolSize)
  let entropy = poolSize > 0 ? length * Math.log2(poolSize) : 0;

  const lowerPassword = password.toLowerCase();
  const suggestions: string[] = [];
  let warning: string | null = null;

  // Penalize common patterns
  for (const pattern of COMMON_PATTERNS) {
    if (lowerPassword.includes(pattern)) {
      entropy -= 20;
      warning = `Avoid common words like "${pattern}".`;
      suggestions.push('Avoid using common words, names, or predictable patterns.');
      break;
    }
  }

  // Penalize repeating characters (e.g., "aaaaa" or "11111")
  if (/(.)\1{2,}/.test(password)) {
    entropy -= 15;
    if (!warning) warning = 'Avoid repeating characters.';
    suggestions.push('Avoid repeating identical characters consecutively.');
  }

  // Penalize sequential characters (e.g., "abc", "123")
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
    entropy -= 10;
    if (!warning) warning = 'Avoid sequential letters or numbers.';
    suggestions.push('Mix non-sequential characters throughout your passphrase.');
  }

  // Determine score (0-4) based on entropy and length requirements
  let score: 0 | 1 | 2 | 3 | 4 = 0;

  if (length < 6 || entropy < 25) {
    score = 0;
  } else if (length < 8 || entropy < 38) {
    score = 1;
  } else if (length < 10 || entropy < 52) {
    score = 2;
  } else if (entropy < 68) {
    score = 3;
  } else {
    score = 4;
  }

  // Mandatory checks for score 3 and score 4
  const charTypesCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (score >= 3 && (length < 10 || charTypesCount < 3)) {
    score = 2;
  }

  // Suggestions based on score
  if (!hasUpper) suggestions.push('Include uppercase letters.');
  if (!hasLower) suggestions.push('Include lowercase letters.');
  if (!hasDigit) suggestions.push('Include numbers.');
  if (!hasSymbol) suggestions.push('Include special characters or symbols.');
  if (length < 12) suggestions.push('Make your passphrase at least 12 characters long for maximum strength.');

  const isValid = score >= 3;

  return {
    score,
    entropy: Math.max(0, Math.round(entropy)),
    warning,
    suggestions: Array.from(new Set(suggestions)),
    isValid,
  };
}
