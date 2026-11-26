/**
 * Webpack plugin (client compilation only) that writes
 * `.next/heavy-modules-manifest.json`: for every emitted JS chunk, whether it
 * can be part of an initial (render-blocking) load and which heavy libraries'
 * modules it contains. `scripts/check-bundle-size.js` uses it to prove that
 * charting / web3-math code only ever arrives through `next/dynamic`.
 */

const { classifyModule } = require('./heavy-libraries');

const MANIFEST = 'heavy-modules-manifest.json';

/**
 * React + Next.js client runtime, including helpers Next itself always ships
 * (styled-jsx, @swc/helpers): a fixed cost on every route, not app code.
 */
const FRAMEWORK_RE = /[\\/]node_modules[\\/](react|react-dom|scheduler|next|styled-jsx|@swc[\\/]helpers)[\\/]/;

/** "…/node_modules/@scope/pkg/x.js" → "@scope/pkg"; app sources → "src/<top dir>". */
function packageOf(resource) {
  if (!resource) return '(runtime)';
  const nm = resource.split(/[\\/]node_modules[\\/]/);
  if (nm.length > 1) {
    const parts = nm[nm.length - 1].split(/[\\/]/);
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const src = resource.split(/[\\/]src[\\/]/);
  return src.length > 1 ? `src/${src[src.length - 1].split(/[\\/]/)[0]}` : '(app)';
}

class HeavyModulesManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('HeavyModulesManifestPlugin', (compilation) => {
      const { Compilation, sources } = compiler.webpack;
      compilation.hooks.processAssets.tap(
        { name: 'HeavyModulesManifestPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          const chunks = [];
          for (const chunk of compilation.chunks) {
            const libraries = {};
            const packages = {};
            let totalSize = 0;
            let frameworkSize = 0;
            for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
              // Concatenated (scope-hoisted) modules wrap their originals.
              const parts = Array.isArray(module.modules) && module.modules.length ? module.modules : [module];
              for (const part of parts) {
                const size = typeof part.size === 'function' ? part.size() : 0;
                totalSize += size;
                if (part.resource && FRAMEWORK_RE.test(part.resource)) frameworkSize += size;
                const pkg = packageOf(part.resource);
                packages[pkg] = (packages[pkg] || 0) + size;
                const lib = classifyModule(part.resource);
                if (lib) libraries[lib] = (libraries[lib] || 0) + 1;
              }
            }
            const files = Array.from(chunk.files).filter((f) => f.endsWith('.js'));
            if (files.length === 0) continue;
            chunks.push({
              name: chunk.name || null,
              files,
              initial: chunk.canBeInitial(),
              libraries,
              // Share of the chunk's source that is React / Next.js runtime.
              // The webpack bootstrap chunk holds only runtime code (no modules).
              frameworkRatio: totalSize
                ? Number((frameworkSize / totalSize).toFixed(4))
                : chunk.hasRuntime()
                  ? 1
                  : 0,
              // Largest contributors (uncompressed source bytes) for diagnosing regressions.
              topPackages: Object.entries(packages)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([name, bytes]) => ({ name, bytes })),
            });
          }
          // Entrypoints ("app/layout", "app/analytics/page", "pages/_app", …)
          // with every JS file webpack loads up-front for them.
          const entrypoints = {};
          for (const [name, entrypoint] of compilation.entrypoints) {
            entrypoints[name] = entrypoint.getFiles().filter((f) => f.endsWith('.js'));
          }
          const json = JSON.stringify({ version: 1, entrypoints, chunks }, null, 2);
          // The client output path is the dist dir, so this lands in `.next/` next to build-manifest.json.
          compilation.emitAsset(MANIFEST, new sources.RawSource(json));
        }
      );
    });
  }
}

module.exports = { HeavyModulesManifestPlugin, MANIFEST };
