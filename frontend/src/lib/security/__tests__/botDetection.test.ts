import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  classifyUserAgent,
  evaluateBotPolicy,
  isPublicIndexableRoute,
  isReadOnlyMethod,
} from '../botDetection';
import { middleware } from '../../../middleware';

describe('botDetection (FE-062)', () => {
  describe('classifyUserAgent', () => {
    it('classifies verified search engine crawlers', () => {
      const searchUAs = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1)',
      ];

      for (const ua of searchUAs) {
        const result = classifyUserAgent(ua);
        expect(result.category).toBe('verified_crawler');
        expect(result.isAutomated).toBe(true);
      }
    });

    it('classifies verified social media / OpenGraph preview scrapers', () => {
      const socialUAs = [
        'Twitterbot/1.0',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
        'WhatsApp/2.23.20.0',
        'TelegramBot (like TwitterBot)',
      ];

      for (const ua of socialUAs) {
        const result = classifyUserAgent(ua);
        expect(result.category).toBe('social_crawler');
        expect(result.isAutomated).toBe(true);
      }
    });

    it('classifies malicious headless scrapers and spoofed crawlers', () => {
      const scraperUAs = [
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
        'Scrapy/2.11.0 (+https://scrapy.org)',
        'python-requests/2.31.0',
        'curl/8.4.0',
        'Mozilla/5.0 Puppeteer',
        'Googlebot/2.1 HeadlessChrome/120.0.0.0',
      ];

      for (const ua of scraperUAs) {
        const result = classifyUserAgent(ua);
        expect(result.category).toBe('malicious_scraper');
        expect(result.isAutomated).toBe(true);
      }
    });

    it('classifies regular human browsers as human', () => {
      const result = classifyUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      );
      expect(result.category).toBe('human');
      expect(result.isAutomated).toBe(false);
    });
  });

  describe('isPublicIndexableRoute & isReadOnlyMethod', () => {
    it('allows public indexing and OG routes', () => {
      expect(isPublicIndexableRoute('/')).toBe(true);
      expect(isPublicIndexableRoute('/courses')).toBe(true);
      expect(isPublicIndexableRoute('/courses/soroban-101')).toBe(true);
      expect(isPublicIndexableRoute('/blog')).toBe(true);
      expect(isPublicIndexableRoute('/blog/stellar-security')).toBe(true);
      expect(isPublicIndexableRoute('/certificates/verify/cert-123')).toBe(true);
      expect(isPublicIndexableRoute('/api/og/certificate')).toBe(true);
      expect(isPublicIndexableRoute('/courses/soroban-101/opengraph-image')).toBe(true);
      expect(isPublicIndexableRoute('/robots.txt')).toBe(true);
      expect(isPublicIndexableRoute('/sitemap.xml')).toBe(true);
      expect(isPublicIndexableRoute('/sitemap-0.xml')).toBe(true);
    });

    it('excludes private and admin routes from public indexable routes', () => {
      expect(isPublicIndexableRoute('/admin')).toBe(false);
      expect(isPublicIndexableRoute('/admin/users')).toBe(false);
      expect(isPublicIndexableRoute('/dashboard')).toBe(false);
      expect(isPublicIndexableRoute('/api/submissions')).toBe(false);
    });

    it('identifies read-only HTTP methods', () => {
      expect(isReadOnlyMethod('GET')).toBe(true);
      expect(isReadOnlyMethod('HEAD')).toBe(true);
      expect(isReadOnlyMethod('OPTIONS')).toBe(true);
      expect(isReadOnlyMethod('POST')).toBe(false);
      expect(isReadOnlyMethod('PUT')).toBe(false);
      expect(isReadOnlyMethod('DELETE')).toBe(false);
    });
  });

  describe('evaluateBotPolicy', () => {
    it('allows verified crawlers read-only access to public pages', () => {
      const decision = evaluateBotPolicy({
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        pathname: '/courses/stellar-basics',
        method: 'GET',
      });

      expect(decision.action).toBe('allow');
      expect(decision.strictRateLimit).toBe(false);
    });

    it('blocks verified crawlers on mutating endpoints', () => {
      const decision = evaluateBotPolicy({
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        pathname: '/courses/stellar-basics',
        method: 'POST',
      });

      expect(decision.action).toBe('block');
      expect(decision.status).toBe(403);
      expect(decision.strictRateLimit).toBe(true);
    });

    it('blocks verified crawlers on non-public routes', () => {
      const decision = evaluateBotPolicy({
        userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        pathname: '/admin/settings',
        method: 'GET',
      });

      expect(decision.action).toBe('block');
      expect(decision.status).toBe(403);
    });

    it('blocks malicious headless scrapers on public routes', () => {
      const decision = evaluateBotPolicy({
        userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0',
        pathname: '/courses',
        method: 'GET',
      });

      expect(decision.action).toBe('block');
      expect(decision.status).toBe(403);
      expect(decision.strictRateLimit).toBe(true);
    });
  });

  describe('Edge middleware integration', () => {
    it('returns HTTP 200 for Googlebot on public indexing pages', async () => {
      const req = new NextRequest('http://localhost:3000/courses', {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('returns HTTP 200 for Twitterbot fetching certificate verification & OG tags', async () => {
      const req = new NextRequest('http://localhost:3000/certificates/verify/abc-123', {
        method: 'GET',
        headers: {
          'user-agent': 'Twitterbot/1.0',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('returns HTTP 403 for malicious headless scrapers', async () => {
      const req = new NextRequest('http://localhost:3000/courses', {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/122.0.0.0 Safari/537.36',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(403);
      expect(res.headers.get('X-Bot-Category')).toBe('malicious_scraper');
    });

    it('returns HTTP 403 for verified crawler attempting a POST request', async () => {
      const req = new NextRequest('http://localhost:3000/courses', {
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(403);
    });
  });
});
