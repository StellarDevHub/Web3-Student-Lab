/**
 * SEO-Safe Crawler Classification & Anti-Scraper Policy (FE-062)
 *
 * Classifies incoming User-Agent strings into verified search engine crawlers,
 * social media / OpenGraph preview scrapers, suspicious headless scrapers,
 * generic unverified bots, or regular human browsers.
 *
 * Designed for Next.js Edge Middleware (zero Node-only dependencies).
 */

export type BotCategory =
  | 'verified_crawler'
  | 'social_crawler'
  | 'malicious_scraper'
  | 'unknown_bot'
  | 'human';

export interface BotClassification {
  category: BotCategory;
  matchedRule?: string;
  isAutomated: boolean;
}

export type BotPolicyAction = 'allow' | 'block' | 'challenge';

export interface BotPolicyDecision {
  action: BotPolicyAction;
  status?: 403;
  reason: string;
  classification: BotClassification;
  strictRateLimit: boolean;
}

export interface BotPolicyInput {
  userAgent: string;
  pathname: string;
  method: string;
}

/**
 * Verified search engine crawlers allowed read-only access to public indexing routes.
 */
export const VERIFIED_SEARCH_CRAWLERS: readonly string[] = [
  'googlebot',
  'google-inspectiontool',
  'storebot-google',
  'mediapartners-google',
  'adsbot-google',
  'bingbot',
  'bingpreview',
  'msnbot',
  'adidxbot',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'yandeximages',
  'slurp',
  'applebot',
  'sogou',
  'exabot',
  'ia_archiver',
];

/**
 * Verified social media & OpenGraph card preview scrapers.
 */
export const VERIFIED_SOCIAL_CRAWLERS: readonly string[] = [
  'twitterbot',
  'linkedinbot',
  'facebookexternalhit',
  'facebot',
  'slackbot',
  'discordbot',
  'whatsapp',
  'telegrambot',
  'pinterestbot',
  'pinterest/',
  'redditbot',
  'embedly',
  'vkshare',
];

/**
 * Suspicious headless browsers, scraping frameworks, and security scanners.
 * Checked before allowlists so spoofed UAs (e.g. "Googlebot HeadlessChrome") are still rejected.
 */
export const SUSPICIOUS_SCRAPER_PATTERNS: readonly string[] = [
  'headlesschrome',
  'headless',
  'phantomjs',
  'puppeteer',
  'playwright',
  'selenium',
  'webdriver',
  'scrapy',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'httpx',
  'go-http-client',
  'curl/',
  'wget/',
  'libwww-perl',
  'nikto',
  'sqlmap',
  'nmap',
  'masscan',
  'zgrab',
  'httrack',
  'scraper',
];

/**
 * Fallback generic bot indicators for unverified automated clients.
 */
const GENERIC_BOT_PATTERNS: readonly string[] = [
  'bot',
  'crawler',
  'spider',
];

/**
 * Public route prefixes that verified search and social crawlers may read.
 */
export const PUBLIC_INDEXABLE_PREFIXES: readonly string[] = [
  '/courses',
  '/blog',
  '/certificates/verify',
  '/api/og',
];

/**
 * Exact public SEO / metadata paths accessible to verified crawlers.
 */
const PUBLIC_EXACT_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/manifest.webmanifest',
  '/opengraph-image',
  '/twitter-image',
]);

const READ_ONLY_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isReadOnlyMethod(method: string): boolean {
  return READ_ONLY_METHODS.has(method.toUpperCase());
}

export function isPublicIndexableRoute(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  if (PUBLIC_EXACT_PATHS.has(normalized)) {
    return true;
  }

  // Match dynamic sitemap files like /sitemap-0.xml
  if (/^\/sitemap-[\w-]+\.xml$/i.test(normalized)) {
    return true;
  }

  // Match Next.js file-based OpenGraph / Twitter image routes on any public page
  if (/\/(opengraph-image|twitter-image)(\.[a-z0-9]+)?$/i.test(normalized)) {
    return true;
  }

  return PUBLIC_INDEXABLE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function classifyUserAgent(userAgent: string): BotClassification {
  const ua = userAgent.trim().toLowerCase();

  if (!ua) {
    return { category: 'human', isAutomated: false };
  }

  // 1. Reject suspicious headless scrapers & scanners first (prevents UA spoofing)
  const scraperMatch = SUSPICIOUS_SCRAPER_PATTERNS.find((pattern) => ua.includes(pattern));
  if (scraperMatch) {
    return {
      category: 'malicious_scraper',
      matchedRule: scraperMatch,
      isAutomated: true,
    };
  }

  // 2. Allowlist verified search engine crawlers
  const searchMatch = VERIFIED_SEARCH_CRAWLERS.find((pattern) => ua.includes(pattern));
  if (searchMatch) {
    return {
      category: 'verified_crawler',
      matchedRule: searchMatch,
      isAutomated: true,
    };
  }

  // 3. Allowlist verified social / OpenGraph preview scrapers
  const socialMatch = VERIFIED_SOCIAL_CRAWLERS.find((pattern) => ua.includes(pattern));
  if (socialMatch) {
    return {
      category: 'social_crawler',
      matchedRule: socialMatch,
      isAutomated: true,
    };
  }

  // 4. Catch remaining unverified generic bots
  const genericMatch = GENERIC_BOT_PATTERNS.find((pattern) => ua.includes(pattern));
  if (genericMatch) {
    return {
      category: 'unknown_bot',
      matchedRule: genericMatch,
      isAutomated: true,
    };
  }

  return { category: 'human', isAutomated: false };
}

export function evaluateBotPolicy({
  userAgent,
  pathname,
  method,
}: BotPolicyInput): BotPolicyDecision {
  const classification = classifyUserAgent(userAgent);
  const readOnly = isReadOnlyMethod(method);
  const publicRoute = isPublicIndexableRoute(pathname);

  if (classification.category === 'human') {
    return {
      action: 'allow',
      reason: 'Regular user agent',
      classification,
      strictRateLimit: false,
    };
  }

  if (classification.category === 'malicious_scraper') {
    return {
      action: 'block',
      status: 403,
      reason: `Suspicious automated scraper detected (${classification.matchedRule})`,
      classification,
      strictRateLimit: true,
    };
  }

  if (
    classification.category === 'verified_crawler' ||
    classification.category === 'social_crawler'
  ) {
    if (!readOnly) {
      return {
        action: 'block',
        status: 403,
        reason: `Crawlers are not permitted on mutating ${method.toUpperCase()} requests`,
        classification,
        strictRateLimit: true,
      };
    }

    if (publicRoute) {
      return {
        action: 'allow',
        reason: `Verified ${classification.category} allowed on public route`,
        classification,
        strictRateLimit: false,
      };
    }

    return {
      action: 'block',
      status: 403,
      reason: `Verified crawler restricted from non-public route (${pathname})`,
      classification,
      strictRateLimit: true,
    };
  }

  // Unverified / unknown bots
  return {
    action: 'block',
    status: 403,
    reason: `Unverified bot detected (${classification.matchedRule})`,
    classification,
    strictRateLimit: true,
  };
}
