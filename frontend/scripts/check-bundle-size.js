#!/usr/bin/env node
/**
 * Bundle budget gate (FE-076).
 *
 * Usage:  npm run build && npm run check:bundle [-- --json report.json]
 *
 * Reads `.next/build-manifest.json` and the `.next/heavy-modules-manifest.json`
 * written by `scripts/bundle/heavy-modules-plugin.js`, reconstructs every App
 * Router route's first-load JS (root main files + layout chain + page entry),
 * gzips each file and enforces:
 *
 *   1. Landing page ("/") core first-load JS  ≤ 85 KB gzipped
 *      ("core" = everything except the React / Next.js runtime, which every
 *       route pays and no app change can remove)
 *   2. Every route's total first-load JS        ≤ 300 KB gzipped
 *   3. No heavy charting / web3-math library (d3, chart.js, recharts, ethers,
 *      bignumber.js — see scripts/bundle/heavy-libraries.js) in any route's
 *      first-load chunks: they must arrive via next/dynamic / import().
 *
 * Exits 1 on any violation.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { HEAVY_LIBRARIES } = require('./bundle/heavy-libraries');

const KB = 1024;

const BUDGETS = {
  landingCoreGzip: 85 * KB,
  routeFirstLoadGzip: 300 * KB,
};

// ── Pure analysis (unit-tested) ─────────────────────────────────────────────

/** "app/analytics/(group)/page" → "/analytics" ; "app/page" → "/" */
function routeFromEntry(entry) {
  const m = /^app\/(.*?)\/?page$/.exec(entry);
  if (!m) return null;
  const segments = m[1]
    .split('/')
    .filter(Boolean)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'));
  return `/${segments.join('/')}`;
}

/** Layout entries that wrap a page entry, outermost first. */
function layoutChain(pageEntry, entrypoints) {
  const parts = pageEntry.replace(/\/page$/, '').split('/'); // ["app", "analytics", ...]
  const chain = [];
  for (let i = 1; i <= parts.length; i++) {
    const layout = `${parts.slice(0, i).join('/')}/layout`;
    if (entrypoints[layout]) chain.push(layout);
  }
  return chain;
}

/**
 * @param {{
 *   buildManifest: { rootMainFiles: string[] },
 *   heavyManifest: { entrypoints: Record<string,string[]>, chunks: Array<{files:string[], initial:boolean, libraries:Record<string,number>, frameworkRatio?:number, name?:string|null}> },
 *   gzipSize: (file: string) => number,
 *   budgets?: typeof BUDGETS,
 * }} input
 */
function analyzeBuild({ buildManifest, heavyManifest, gzipSize, budgets = BUDGETS }) {
  const fileInfo = new Map();
  for (const chunk of heavyManifest.chunks) {
    for (const file of chunk.files) {
      fileInfo.set(file, {
        libraries: Object.keys(chunk.libraries || {}),
        frameworkRatio: chunk.frameworkRatio || 0,
        initial: chunk.initial,
        name: chunk.name || null,
      });
    }
  }

  const sizeCache = new Map();
  const gz = (file) => {
    if (!sizeCache.has(file)) sizeCache.set(file, gzipSize(file));
    return sizeCache.get(file);
  };

  const routes = [];
  const violations = [];
  const rootMain = buildManifest.rootMainFiles || [];

  for (const entry of Object.keys(heavyManifest.entrypoints).sort()) {
    const route = routeFromEntry(entry);
    if (route === null) continue;

    const files = new Set(rootMain);
    for (const layout of layoutChain(entry, heavyManifest.entrypoints)) {
      for (const f of heavyManifest.entrypoints[layout]) files.add(f);
    }
    for (const f of heavyManifest.entrypoints[entry]) files.add(f);

    let total = 0;
    let framework = 0;
    const heavy = {};
    for (const file of files) {
      const size = gz(file);
      const info = fileInfo.get(file);
      total += size;
      framework += size * (info ? info.frameworkRatio : 0);
      for (const lib of info ? info.libraries : []) (heavy[lib] = heavy[lib] || []).push(file);
    }
    const core = Math.round(total - framework);
    const result = { route, entry, files: [...files], totalGzip: total, frameworkGzip: Math.round(framework), coreGzip: core, heavy };
    routes.push(result);

    if (route === '/' && core > budgets.landingCoreGzip) {
      violations.push({
        kind: 'landing-core',
        route,
        message: `Landing page core first-load JS is ${fmt(core)} gzipped (budget ${fmt(budgets.landingCoreGzip)}).`,
      });
    }
    if (total > budgets.routeFirstLoadGzip) {
      violations.push({
        kind: 'route-first-load',
        route,
        message: `${route} first-load JS is ${fmt(total)} gzipped (budget ${fmt(budgets.routeFirstLoadGzip)}).`,
      });
    }
    for (const [lib, libFiles] of Object.entries(heavy)) {
      const label = HEAVY_LIBRARIES.find((l) => l.id === lib)?.label ?? lib;
      violations.push({
        kind: 'heavy-in-initial',
        route,
        library: lib,
        message: `${label} is in ${route}'s first-load JS (${libFiles.join(', ')}). Load it with next/dynamic or import().`,
      });
    }
  }

  // Where the heavy libraries actually live (should be their async chunks).
  const asyncHeavyChunks = heavyManifest.chunks
    .filter((c) => !c.initial && Object.keys(c.libraries || {}).length > 0)
    .map((c) => ({ name: c.name, files: c.files, libraries: Object.keys(c.libraries) }));

  return { budgets, routes, violations, asyncHeavyChunks };
}

function fmt(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const distDir = path.resolve(__dirname, '..', argValue(argv, '--dir') || '.next');
  const buildManifestPath = path.join(distDir, 'build-manifest.json');
  const heavyManifestPath = path.join(distDir, 'heavy-modules-manifest.json');

  if (!fs.existsSync(buildManifestPath) || !fs.existsSync(heavyManifestPath)) {
    console.error(
      `✖ Missing build output in ${path.relative(process.cwd(), distDir) || distDir}.\n` +
        '  Run `npm run build` (production, webpack) before `npm run check:bundle`.'
    );
    return 1;
  }

  const report = analyzeBuild({
    buildManifest: JSON.parse(fs.readFileSync(buildManifestPath, 'utf8')),
    heavyManifest: JSON.parse(fs.readFileSync(heavyManifestPath, 'utf8')),
    gzipSize: (file) => {
      const full = path.join(distDir, file);
      return fs.existsSync(full) ? zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length : 0;
    },
  });

  printReport(report);

  const jsonOut = argValue(argv, '--json');
  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${jsonOut}`);
  }

  return report.violations.length > 0 ? 1 : 0;
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}

function printReport({ budgets, routes, violations, asyncHeavyChunks }) {
  const landing = routes.find((r) => r.route === '/');
  console.log('First-load JS per route (gzipped)\n');
  console.log(`${'route'.padEnd(36)} ${'total'.padStart(10)} ${'core'.padStart(10)} ${'runtime'.padStart(10)}`);
  for (const r of [...routes].sort((a, b) => b.totalGzip - a.totalGzip)) {
    const flag = Object.keys(r.heavy).length ? '  ⚠ heavy' : '';
    console.log(
      `${r.route.padEnd(36)} ${fmt(r.totalGzip).padStart(10)} ${fmt(r.coreGzip).padStart(10)} ${fmt(r.frameworkGzip).padStart(10)}${flag}`
    );
  }

  console.log('\nHeavy libraries (async chunks)');
  for (const lib of HEAVY_LIBRARIES) {
    const chunks = asyncHeavyChunks.filter((c) => c.libraries.includes(lib.id));
    console.log(`  ${lib.label.padEnd(24)} ${chunks.length ? chunks.map((c) => c.name || c.files[0]).join(', ') : '(not used)'}`);
  }

  console.log('\nBudgets');
  if (landing) {
    console.log(`  landing core   ${fmt(landing.coreGzip)} / ${fmt(budgets.landingCoreGzip)}`);
  }
  const worst = routes.reduce((m, r) => (r.totalGzip > (m?.totalGzip ?? -1) ? r : m), null);
  if (worst) console.log(`  largest route  ${worst.route} ${fmt(worst.totalGzip)} / ${fmt(budgets.routeFirstLoadGzip)}`);

  if (violations.length) {
    console.log(`\n✖ ${violations.length} bundle budget violation(s):`);
    for (const v of violations) console.log(`  - ${v.message}`);
  } else {
    console.log('\n✔ All bundle budgets met.');
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { analyzeBuild, routeFromEntry, layoutChain, BUDGETS };
