import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analyzeBuild, layoutChain, routeFromEntry } = require('../check-bundle-size.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyModule, packagesRegExp } = require('../bundle/heavy-libraries.js');

const KB = 1024;

function fixture(overrides: { chunks?: unknown[]; entrypoints?: Record<string, string[]> } = {}) {
  const sizes: Record<string, number> = {
    'static/chunks/webpack.js': 2 * KB,
    'static/chunks/framework.js': 60 * KB,
    'static/chunks/main-app.js': 1 * KB,
    'static/chunks/app/layout.js': 30 * KB,
    'static/chunks/app/page.js': 5 * KB,
    'static/chunks/app/analytics/page.js': 10 * KB,
    'static/chunks/async-recharts.js': 90 * KB,
    'static/chunks/leaky.js': 70 * KB,
  };
  return {
    buildManifest: {
      rootMainFiles: ['static/chunks/webpack.js', 'static/chunks/framework.js', 'static/chunks/main-app.js'],
    },
    heavyManifest: {
      entrypoints: overrides.entrypoints ?? {
        'app/layout': ['static/chunks/app/layout.js'],
        'app/page': ['static/chunks/app/page.js'],
        'app/analytics/page': ['static/chunks/app/analytics/page.js'],
        'app/api/health/route': ['static/chunks/app/page.js'],
      },
      chunks: overrides.chunks ?? [
        { name: 'framework', files: ['static/chunks/framework.js'], initial: true, libraries: {}, frameworkRatio: 1 },
        { name: 'app/layout', files: ['static/chunks/app/layout.js'], initial: true, libraries: {}, frameworkRatio: 0 },
        { name: 'app/page', files: ['static/chunks/app/page.js'], initial: true, libraries: {}, frameworkRatio: 0 },
        { name: 'app/analytics/page', files: ['static/chunks/app/analytics/page.js'], initial: true, libraries: {} },
        { name: 'async-recharts', files: ['static/chunks/async-recharts.js'], initial: false, libraries: { recharts: 40 } },
      ],
    },
    gzipSize: (file: string) => sizes[file] ?? 0,
  };
}

describe('route helpers', () => {
  it('maps App Router entries to routes, dropping groups and parallel slots', () => {
    expect(routeFromEntry('app/page')).toBe('/');
    expect(routeFromEntry('app/analytics/page')).toBe('/analytics');
    expect(routeFromEntry('app/(marketing)/about/page')).toBe('/about');
    expect(routeFromEntry('app/certificates/[id]/page')).toBe('/certificates/[id]');
    expect(routeFromEntry('app/api/health/route')).toBeNull();
    expect(routeFromEntry('pages/_app')).toBeNull();
  });

  it('collects the layout chain that wraps a page', () => {
    const entrypoints = { 'app/layout': [], 'app/admin/layout': [], 'app/admin/users/page': [] };
    expect(layoutChain('app/admin/users/page', entrypoints)).toEqual(['app/layout', 'app/admin/layout']);
  });
});

describe('heavy library registry', () => {
  it('classifies modules by package, including d3 sub-packages and Windows paths', () => {
    expect(classifyModule('/repo/node_modules/d3-scale/src/linear.js')).toBe('d3');
    expect(classifyModule('C:\\repo\\node_modules\\d3\\src\\index.js')).toBe('d3');
    expect(classifyModule('/repo/node_modules/chart.js/dist/chart.js')).toBe('chartjs');
    expect(classifyModule('/repo/node_modules/recharts/es6/index.js')).toBe('recharts');
    expect(classifyModule('/repo/node_modules/@ethersproject/abi/lib/index.js')).toBe('web3-math');
    expect(classifyModule('/repo/node_modules/bignumber.js/bignumber.mjs')).toBe('web3-math');
    expect(classifyModule('/repo/node_modules/react/index.js')).toBeUndefined();
    expect(classifyModule('/repo/node_modules/d3fake/index.js')).toBeUndefined();
  });

  it('builds cacheGroup regexes that only match whole package names', () => {
    const re = packagesRegExp(['chart.js']);
    expect(re.test('/node_modules/chart.js/auto.js')).toBe(true);
    expect(re.test('/node_modules/chartXjs/auto.js')).toBe(false);
  });
});

describe('analyzeBuild', () => {
  it('passes when heavy libraries are async and budgets are met', () => {
    const report = analyzeBuild(fixture());
    expect(report.violations).toEqual([]);

    const landing = report.routes.find((r: { route: string }) => r.route === '/');
    expect(landing.totalGzip).toBe(98 * KB);
    expect(landing.frameworkGzip).toBe(60 * KB);
    expect(landing.coreGzip).toBe(38 * KB);
    expect(report.routes.map((r: { route: string }) => r.route).sort()).toEqual(['/', '/analytics']);
    expect(report.asyncHeavyChunks).toEqual([
      { name: 'async-recharts', files: ['static/chunks/async-recharts.js'], libraries: ['recharts'] },
    ]);
  });

  it('flags a heavy library that leaks into a route first-load chunk', () => {
    const base = fixture();
    const report = analyzeBuild(
      fixture({
        entrypoints: { ...base.heavyManifest.entrypoints, 'app/analytics/page': ['static/chunks/app/analytics/page.js', 'static/chunks/leaky.js'] },
        chunks: [
          ...base.heavyManifest.chunks,
          { name: null, files: ['static/chunks/leaky.js'], initial: true, libraries: { d3: 12 } },
        ],
      })
    );
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({ kind: 'heavy-in-initial', route: '/analytics', library: 'd3' });
    expect(report.violations[0].message).toMatch(/next\/dynamic/);
  });

  it('enforces the landing core and per-route budgets', () => {
    const report = analyzeBuild({
      ...fixture(),
      budgets: { landingCoreGzip: 20 * KB, routeFirstLoadGzip: 100 * KB },
    });
    const kinds = report.violations.map((v: { kind: string; route: string }) => `${v.kind}:${v.route}`);
    expect(kinds).toEqual(['route-first-load:/analytics', 'landing-core:/']);
  });
});
