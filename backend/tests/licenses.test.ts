import express, { type Express } from 'express';
import request from 'supertest';
import { licenses } from '../src/licenses/data.js';
import licenseRoutes from '../src/licenses/license.routes.js';
import * as licenseService from '../src/licenses/license.service.js';
import type { License } from '../src/licenses/types.js';

// Minimal Express app using only the license router
function createTestApp(): Express {
  const app = express();
  app.use('/api/v1/licenses', licenseRoutes);
  return app;
}

const app = createTestApp();

// ============================================================
// License Service Unit Tests (no database required)
// ============================================================

describe('License Service', () => {
  describe('getLicenses', () => {
    it('returns all licenses with pagination by default', () => {
      const result = licenseService.getLicenses();
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
      expect(result.pagination!.total).toBe(licenses.length);
      expect(result.pagination!.page).toBe(1);
    });

    it('filters licenses by category', () => {
      const result = licenseService.getLicenses({ category: 'permissive' });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.category).toBe('permissive');
      });
    });

    it('filters licenses by copyleft category', () => {
      const result = licenseService.getLicenses({ category: 'copyleft' });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.category).toBe('copyleft');
      });
    });

    it('filters licenses by use case suitability', () => {
      const result = licenseService.getLicenses({ useCase: 'commercial' });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.useCaseSuitability.commercial).not.toBe('restricted');
      });
    });

    it('searches licenses by name', () => {
      const result = licenseService.getLicenses({ search: 'MIT' });
      expect(result.status).toBe('success');
      expect(result.data!.length).toBeGreaterThan(0);
    });

    it('filters by commercial use permission', () => {
      const result = licenseService.getLicenses({ allowsCommercial: true });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.permissions.commercialUse).toBe(true);
      });
    });

    it('filters by modification permission', () => {
      const result = licenseService.getLicenses({ allowsModification: true });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.permissions.modification).toBe(true);
      });
    });

    it('filters by source disclosure requirement', () => {
      const result = licenseService.getLicenses({ requiresDisclosure: true });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.conditions.discloseSource).toBe(true);
      });
    });

    it('filters by same-license requirement', () => {
      const result = licenseService.getLicenses({ requiresSameLicense: true });
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.conditions.sameLicense).toBe(true);
      });
    });

    it('supports pagination', () => {
      const result = licenseService.getLicenses(undefined, 1, 3);
      expect(result.status).toBe('success');
      expect(result.data!.length).toBeLessThanOrEqual(3);
      expect(result.pagination!.page).toBe(1);
      expect(result.pagination!.limit).toBe(3);
      expect(result.pagination!.total).toBe(licenses.length);
    });

    it('handles page overflow gracefully', () => {
      const result = licenseService.getLicenses(undefined, 999, 50);
      expect(result.status).toBe('success');
      expect(result.pagination!.page).toBeLessThanOrEqual(result.pagination!.totalPages);
    });
  });

  describe('getLicenseById', () => {
    it('returns a license by its id', () => {
      const result = licenseService.getLicenseById('mit');
      expect(result.status).toBe('success');
      expect(result.data!.id).toBe('mit');
      expect(result.data!.name).toBe('MIT License');
    });

    it('returns error for unknown license id', () => {
      const result = licenseService.getLicenseById('non-existent');
      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    });
  });

  describe('getLicenseBySpdxId', () => {
    it('returns a license by its SPDX ID', () => {
      const result = licenseService.getLicenseBySpdxId('MIT');
      expect(result.status).toBe('success');
      expect(result.data!.spdxId).toBe('MIT');
    });

    it('returns error for unknown SPDX ID', () => {
      const result = licenseService.getLicenseBySpdxId('UNKNOWN');
      expect(result.status).toBe('error');
    });
  });

  describe('getCategories', () => {
    it('returns all categories with counts', () => {
      const result = licenseService.getCategories();
      expect(result.status).toBe('success');
      expect(result.data!.length).toBeGreaterThan(0);
      result.data!.forEach((cat) => {
        expect(cat.category).toBeDefined();
        expect(cat.count).toBeGreaterThan(0);
      });
      const categories = result.data!.map((c) => c.category);
      expect(categories).toContain('permissive');
      expect(categories).toContain('copyleft');
      expect(categories).toContain('weak-copyleft');
      expect(categories).toContain('network-copyleft');
    });
  });

  describe('compareLicenses', () => {
    it('compares two licenses and returns similarities and differences', () => {
      const result = licenseService.compareLicenses('mit', 'gpl-3.0');
      expect(result.status).toBe('success');
      expect(result.data!.licenseA.id).toBe('mit');
      expect(result.data!.licenseB.id).toBe('gpl-3.0');
      expect(result.data!.similarities.length).toBeGreaterThan(0);
      expect(result.data!.differences.length).toBeGreaterThan(0);
      expect(result.data!.recommendation).toBeDefined();
    });

    it('compares two similar licenses', () => {
      const result = licenseService.compareLicenses('mit', 'bsd-2-clause');
      expect(result.status).toBe('success');
      expect(result.data!.similarities.length).toBeGreaterThan(0);
    });

    it('returns error for missing license', () => {
      const result = licenseService.compareLicenses('mit', 'non-existent');
      expect(result.status).toBe('error');
    });

    it('compares GPLv2 and Apache 2.0 as incompatible', () => {
      const result = licenseService.compareLicenses('apache-2.0', 'gpl-2.0');
      expect(result.status).toBe('success');
      expect(result.data!.compatibility.compatibility).toBe('incompatible');
    });

    it('compares MIT and GPLv3 as compatible', () => {
      const result = licenseService.compareLicenses('mit', 'gpl-3.0');
      expect(result.status).toBe('success');
      expect(result.data!.compatibility.compatibility).toBe('compatible');
    });
  });

  describe('getRecommendations', () => {
    it('returns recommendations for commercial use', () => {
      const result = licenseService.getRecommendations('commercial');
      expect(result.status).toBe('success');
      expect(result.data!.useCase).toBe('commercial');
      expect(result.data!.topPicks.length).toBeGreaterThan(0);
      expect(result.data!.warnings.length).toBeGreaterThan(0);
    });

    it('returns recommendations for saas use', () => {
      const result = licenseService.getRecommendations('saas');
      expect(result.status).toBe('success');
      expect(result.data!.useCase).toBe('saas');
      expect(result.data!.topPicks.length).toBeGreaterThan(0);
    });

    it('returns error for unknown use case', () => {
      const result = licenseService.getRecommendations('unknown' as any);
      expect(result.status).toBe('error');
    });

    it('returns recommendations for library use', () => {
      const result = licenseService.getRecommendations('library');
      expect(result.status).toBe('success');
      const ids = result.data!.topPicks.map((l: License) => l.id);
      expect(ids).toContain('mit');
      expect(ids).toContain('lgpl-3.0');
    });
  });

  describe('checkCompatibility', () => {
    it('returns compatible for MIT and Apache 2.0', () => {
      const result = licenseService.checkCompatibility('mit', 'apache-2.0');
      expect(result.status).toBe('success');
      expect(result.data!.compatibility).toBe('compatible');
    });

    it('returns incompatible for Apache 2.0 and GPLv2', () => {
      const result = licenseService.checkCompatibility('apache-2.0', 'gpl-2.0');
      expect(result.status).toBe('success');
      expect(result.data!.compatibility).toBe('incompatible');
    });

    it('returns conditional for unknown pair', () => {
      const result = licenseService.checkCompatibility('zlib', 'bsl-1.1');
      expect(result.status).toBe('success');
      expect(result.data!.compatibility).toBe('conditional');
    });
  });

  describe('getGuideMeta', () => {
    it('returns guide metadata', () => {
      const result = licenseService.getGuideMeta();
      expect(result.status).toBe('success');
      expect(result.data!.totalLicenses).toBe(licenses.length);
      expect(result.data!.categories.length).toBeGreaterThan(0);
      expect(result.data!.useCases.length).toBeGreaterThan(0);
      expect(result.data!.version).toBeDefined();
      expect(result.data!.lastUpdated).toBeDefined();
    });
  });

  describe('getLicensesByCategory', () => {
    it('groups licenses by category', () => {
      const result = licenseService.getLicensesByCategory();
      expect(result.status).toBe('success');
      const categories = Object.keys(result.data!);
      expect(categories).toContain('permissive');
      expect(categories).toContain('copyleft');
      for (const category of categories) {
        expect(result.data![category as keyof typeof result.data].length).toBeGreaterThan(0);
      }
    });
  });

  describe('quickRecommend', () => {
    it('recommends permissive licenses for commercial without copyleft', () => {
      const result = licenseService.quickRecommend(true, true, false, false, false);
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.permissions.commercialUse).toBe(true);
        expect(l.category === 'permissive' || l.category === 'public-domain').toBe(true);
      });
    });

    it('includes copyleft licenses when user accepts them', () => {
      const result = licenseService.quickRecommend(true, true, false, true, false);
      expect(result.status).toBe('success');
      const hasCopyleft = result.data!.some((l: License) =>
        l.category === 'copyleft' || l.category === 'weak-copyleft' || l.category === 'network-copyleft'
      );
      expect(hasCopyleft).toBe(true);
    });

    it('filters by patent protection requirement', () => {
      const result = licenseService.quickRecommend(true, true, true, true, false);
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.permissions.patentUse).toBe(true);
      });
    });

    it('filters out strong copyleft for libraries', () => {
      const result = licenseService.quickRecommend(true, true, false, true, true);
      expect(result.status).toBe('success');
      result.data!.forEach((l: License) => {
        expect(l.category).not.toBe('copyleft');
        expect(l.category).not.toBe('network-copyleft');
      });
    });
  });

  describe('getCompatibleLicenses', () => {
    it('returns compatibility info for all other licenses', () => {
      const result = licenseService.getCompatibleLicenses('mit');
      expect(result.status).toBe('success');
      expect(result.data!.length).toBe(licenses.length - 1);
      expect(result.data![0].compatibility.compatibility).toBe('compatible');
    });

    it('returns error for unknown license', () => {
      const result = licenseService.getCompatibleLicenses('unknown');
      expect(result.status).toBe('error');
    });
  });
});

// ============================================================
// License API Route Integration Tests
// ============================================================

describe('License API Routes', () => {
  describe('GET /api/v1/licenses', () => {
    it('returns all licenses', async () => {
      const response = await request(app).get('/api/v1/licenses').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toBeDefined();
    });

    it('filters by category', async () => {
      const response = await request(app)
        .get('/api/v1/licenses?category=permissive')
        .expect(200);
      expect(response.body.status).toBe('success');
      response.body.data.forEach((l: any) => {
        expect(l.category).toBe('permissive');
      });
    });

    it('supports search', async () => {
      const response = await request(app)
        .get('/api/v1/licenses?search=MIT')
        .expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('filters by commercial use', async () => {
      const response = await request(app)
        .get('/api/v1/licenses?allowsCommercial=true')
        .expect(200);
      expect(response.body.status).toBe('success');
      response.body.data.forEach((l: any) => {
        expect(l.permissions.commercialUse).toBe(true);
      });
    });
  });

  describe('GET /api/v1/licenses/meta', () => {
    it('returns guide metadata', async () => {
      const response = await request(app).get('/api/v1/licenses/meta').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.totalLicenses).toBeGreaterThan(0);
      expect(response.body.data.version).toBe('1.0.0');
    });
  });

  describe('GET /api/v1/licenses/categories', () => {
    it('returns categories with counts', async () => {
      const response = await request(app).get('/api/v1/licenses/categories').expect(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/licenses/by-category', () => {
    it('returns licenses grouped by category', async () => {
      const response = await request(app).get('/api/v1/licenses/by-category').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.permissive).toBeDefined();
      expect(response.body.data.copyleft).toBeDefined();
      expect(response.body.data['weak-copyleft']).toBeDefined();
    });
  });

  describe('GET /api/v1/licenses/use-cases', () => {
    it('returns all use cases', async () => {
      const response = await request(app).get('/api/v1/licenses/use-cases').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.commercial).toBeDefined();
      expect(response.body.data.library).toBeDefined();
    });
  });

  describe('GET /api/v1/licenses/recommend/:useCase', () => {
    it('returns recommendations for a valid use case', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/recommend/commercial')
        .expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.useCase).toBe('commercial');
      expect(response.body.data.topPicks.length).toBeGreaterThan(0);
    });

    it('returns 400 for invalid use case', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/recommend/invalid')
        .expect(400);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/licenses/quick-recommend', () => {
    it('returns filtered recommendations', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/quick-recommend?wantsCommercial=true&acceptsCopyleft=false')
        .expect(200);
      expect(response.body.status).toBe('success');
      response.body.data.forEach((l: any) => {
        expect(l.permissions.commercialUse).toBe(true);
      });
    });
  });

  describe('GET /api/v1/licenses/compare', () => {
    it('compares two licenses', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/compare?a=mit&b=gpl-3.0')
        .expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.licenseA.id).toBe('mit');
      expect(response.body.data.licenseB.id).toBe('gpl-3.0');
      expect(response.body.data.differences.length).toBeGreaterThan(0);
    });

    it('returns 400 when missing params', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/compare')
        .expect(400);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/licenses/compatibility', () => {
    it('checks compatibility between two licenses', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/compatibility?a=mit&b=apache-2.0')
        .expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.compatibility).toBe('compatible');
    });

    it('returns error for missing license', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/compatibility?a=mit&b=nonexistent')
        .expect(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/licenses/:licenseId', () => {
    it('returns a license by ID', async () => {
      const response = await request(app).get('/api/v1/licenses/mit').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe('mit');
    });

    it('returns 404 for unknown license', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/unknown')
        .expect(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/licenses/spdx/:spdxId', () => {
    it('returns a license by SPDX ID', async () => {
      const response = await request(app).get('/api/v1/licenses/spdx/MIT').expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.spdxId).toBe('MIT');
    });
  });

  describe('GET /api/v1/licenses/:licenseId/compatible', () => {
    it('returns all compatible licenses for MIT', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/mit/compatible')
        .expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].compatibility.compatibility).toBe('compatible');
    });

    it('returns 404 for unknown license', async () => {
      const response = await request(app)
        .get('/api/v1/licenses/unknown/compatible')
        .expect(404);
      expect(response.body.status).toBe('error');
    });
  });
});
