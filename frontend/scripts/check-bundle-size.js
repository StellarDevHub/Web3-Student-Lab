const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const buildDir = path.join(process.cwd(), '.next');
const manifestPath = path.join(buildDir, 'build-manifest.json');
const budgetBytes = 150 * 1024;
const routes = ['/', '/dashboard'];

if (!fs.existsSync(manifestPath)) {
  console.error(`Next.js build manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const appManifestPath = path.join(buildDir, 'app-build-manifest.json');
const appManifest = fs.existsSync(appManifestPath)
  ? JSON.parse(fs.readFileSync(appManifestPath, 'utf8'))
  : { pages: {} };
let failed = false;

for (const route of routes) {
  const segments = route.split('/').filter(Boolean);
  const appEntries = ['/layout'];
  for (let i = 1; i <= segments.length; i += 1) {
    appEntries.push(`/${segments.slice(0, i).join('/')}/layout`);
  }
  appEntries.push(`/${segments.length ? `${segments.join('/')}/` : ''}page`);
  const appFiles = appEntries.flatMap((entry) => appManifest.pages?.[entry] ?? []);
  const routeEntry = `${segments.length ? `${segments.join('/')}/` : ''}page`;
  const clientReferenceManifestPath = path.join(
    buildDir,
    'server',
    'app',
    `${routeEntry}_client-reference-manifest.js`
  );
  const files = new Set();

  if (fs.existsSync(clientReferenceManifestPath)) {
    // Next 16 no longer emits app-build-manifest.json. Read the app route's
    // client reference manifest instead; build-manifest.json describes the
    // legacy Pages Router and must not be charged to App Router pages.
    const sandbox = {};
    vm.runInNewContext(fs.readFileSync(clientReferenceManifestPath, 'utf8'), sandbox);
    const appRoute = `/${routeEntry}`;
    const clientModules = sandbox.__RSC_MANIFEST?.[appRoute]?.clientModules ?? {};
    for (const module of Object.values(clientModules)) {
      if (module.async) continue;
      for (const chunk of module.chunks ?? []) {
        if (chunk.endsWith('.js')) files.add(chunk);
      }
    }
  } else {
    for (const file of [
      ...(manifest.rootMainFiles ?? []),
      ...(manifest.pages?.[route] ?? []),
      ...appFiles,
    ]) {
      files.add(file);
    }
  }
  const scripts = [...files].filter((file) => file.endsWith('.js'));
  if (scripts.length === 0) {
    console.error(`${route}: no initial JavaScript files were listed in the build manifest.`);
    failed = true;
    continue;
  }

  const totals = scripts.reduce(
    (result, file) => {
      const contents = fs.readFileSync(path.join(buildDir, file));
      result.raw += contents.length;
      result.gzip += zlib.gzipSync(contents).length;
      return result;
    },
    { raw: 0, gzip: 0 }
  );
  const withinBudget = totals.gzip <= budgetBytes;
  console.log(
    `${route}: ${(totals.gzip / 1024).toFixed(1)} KB gzipped initial JS (budget: 150 KB)`
  );
  if (!withinBudget) failed = true;
}

if (failed) process.exit(1);
