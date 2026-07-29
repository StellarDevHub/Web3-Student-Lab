import { describe, expect, it } from '@jest/globals';
import { SimulatorSeoService } from '../src/services/seo/simulatorSeo.service.js';

describe('SimulatorSeoService', () => {
  it('generates meta tags for a known simulator slug', async () => {
    const service = new SimulatorSeoService({
      cache: {
        get: async () => null,
        setex: async () => undefined,
      },
    });

    const meta = await service.getMetaTags('consensus-lab');
    expect(meta).not.toBeNull();
    expect(meta?.title).toContain('Consensus Failure Recovery Simulator');
    expect(meta?.canonical).toContain('/simulator/consensus-lab');
    expect(meta?.ogType).toBe('article');
  });

  it('returns null for unknown slugs', async () => {
    const service = new SimulatorSeoService({
      cache: {
        get: async () => null,
        setex: async () => undefined,
      },
    });

    await expect(service.getMetaTags('missing-lab')).resolves.toBeNull();
  });

  it('parses sitemap loc URLs without crashing on empty captures', async () => {
    const service = new SimulatorSeoService({
      cache: {
        get: async () => null,
        setex: async () => undefined,
      },
      fetchSitemapXml: async () =>
        `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc></loc></url></urlset>`,
    });

    const urls = await service.getSitemapUrls();
    expect(urls).toEqual(['https://example.com/a']);
  });
});
