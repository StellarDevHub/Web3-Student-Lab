#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const NEXT_DIR = path.join(__dirname, '..', '.next');
const STATIC_DIR = path.join(NEXT_DIR, 'static');
const BUDGET_KB = Number(process.env.BUNDLE_SIZE_LIMIT_KB || 150);
const BUDGET_BYTES = BUDGET_KB * 1024;
const STRICT_BUDGET = process.env.BUNDLE_SIZE_STRICT === 'true';
const COMPRESSIBLE = /\.(?:js|mjs|css|json|svg|txt|xml)$/i;
const JAVASCRIPT = /\.m?js$/i;

const ROUTES = [
  { name: '/', keys: ['/', '/page', '/layout', '/_app'] },
  { name: '/dashboard', keys: ['/dashboard', '/dashboard/page', '/dashboard/layout', '/layout', '/_app'] },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadManifests() {
  return ['app-build-manifest.json', 'build-manifest.json']
    .map((name) => readJson(path.join(NEXT_DIR, name)))
    .filter(Boolean);
}

function resolveAsset(file) {
  const normalized = file.replace(/^\/_next\//, '').replace(/^\/+/, '');
  const candidate = path.join(NEXT_DIR, normalized);
  return fs.existsSync(candidate) ? candidate : null;
}

function initialAssets(manifests, keys) {
  const files = new Set();
  for (const manifest of manifests) {
    // App Router root chunks are shared by every route, including / and /dashboard.
    for (const file of manifest.rootMainFiles || []) files.add(file);
    for (const key of keys) {
      for (const file of manifest.pages?.[key] || []) {
        if (typeof file === 'string') files.add(file);
      }
    }
  }
  return [...files].map(resolveAsset).filter(Boolean);
}

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file), { level: zlib.constants.Z_BEST_COMPRESSION }).length;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function countPrecompressedAssets() {
  let total = 0;
  let missing = 0;

  if (!fs.existsSync(STATIC_DIR)) return { total, missing };

  for (const file of walk(STATIC_DIR)) {
    if (!COMPRESSIBLE.test(file) || /\.(?:br|gz|map)$/i.test(file)) continue;
    total += 1;
    if (!fs.existsSync(`${file}.br`) || !fs.existsSync(`${file}.gz`)) missing += 1;
  }

  return { total, missing };
}

function main() {
  if (!fs.existsSync(NEXT_DIR)) {
    console.error('FE-100: .next not found. Run `pnpm build` before checking the bundle.');
    process.exit(1);
  }

  const manifests = loadManifests();
  if (manifests.length === 0) {
    console.error('FE-100: no Next.js build manifests found. Run `pnpm build` first.');
    process.exit(1);
  }

  let failed = false;
  console.log(`FE-100 bundle check (initial JS budget: ${BUDGET_KB} KB gzip)`);

  for (const route of ROUTES) {
    const assets = initialAssets(manifests, route.keys);
    const javascript = assets.filter((file) => JAVASCRIPT.test(file));
    const total = javascript.reduce((sum, file) => sum + gzipSize(file), 0);
    const missing = assets.filter((file) => !fs.existsSync(`${file}.br`) || !fs.existsSync(`${file}.gz`));
    const withinBudget = total <= BUDGET_BYTES;
    const precompressed = missing.length === 0;

    const budgetStatus = withinBudget
      ? 'budget OK'
      : STRICT_BUDGET
        ? 'OVER BUDGET'
        : 'OVER BUDGET (warning; set BUNDLE_SIZE_STRICT=true to fail)';

    console.log(
      `  ${route.name.padEnd(12)} ${(total / 1024).toFixed(1).padStart(7)} KB gzip  ` +
        `${budgetStatus}  ${precompressed ? 'br/gz OK' : `missing br/gz: ${missing.length}`}`,
    );

    if (javascript.length === 0 || (STRICT_BUDGET && !withinBudget) || !precompressed) failed = true;
  }

  const { total, missing } = countPrecompressedAssets();
  console.log(`Pre-compressed static assets: ${total - missing}/${total} have .br and .gz siblings`);
  if (total === 0 || missing > 0) failed = true;

  if (failed) {
    console.error('FE-100: bundle budget or pre-compression verification failed.');
    process.exit(1);
  }

  console.log('FE-100: PASS');
}

main();
