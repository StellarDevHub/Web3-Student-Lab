/**
 * Heavy client libraries that must never be part of a route's first-load JS
 * (FE-076). Shared by `next.config.ts` (splitChunks cacheGroups + manifest
 * plugin) and `scripts/check-bundle-size.js` (budget enforcement) so the two
 * can never drift apart.
 *
 * Each family gets its own async chunk: a route that only needs d3 does not
 * also download recharts.
 */

/** @typedef {{ id: string; chunkName: string; label: string; packages: string[] }} HeavyLibrary */

/** @type {HeavyLibrary[]} */
const HEAVY_LIBRARIES = [
  {
    id: 'd3',
    chunkName: 'async-d3',
    label: 'd3',
    // d3 plus the packages its modules pull in.
    packages: ['d3', 'd3-*', 'internmap', 'delaunator', 'robust-predicates'],
  },
  {
    id: 'chartjs',
    chunkName: 'async-chartjs',
    label: 'chart.js',
    packages: ['chart.js', 'react-chartjs-2', '@kurkle/color'],
  },
  {
    id: 'recharts',
    chunkName: 'async-recharts',
    label: 'recharts',
    // General-purpose deps recharts shares with app code (immer, reselect…)
    // are deliberately not listed, so they are never misreported.
    packages: ['recharts', 'recharts-scale', 'victory-vendor', 'decimal.js-light', 'react-smooth'],
  },
  {
    id: 'web3-math',
    chunkName: 'async-web3-math',
    label: 'ethers / bignumber.js',
    packages: ['ethers', '@ethersproject/*', '@adraffy/ens-normalize', 'bignumber.js'],
  },
];

function escape(segment) {
  return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^\\\\/]+');
}

/** RegExp matching any module inside one of `packages` in node_modules. */
function packagesRegExp(packages) {
  return new RegExp(`[\\\\/]node_modules[\\\\/](${packages.map(escape).join('|')})[\\\\/]`);
}

/** Which heavy library (if any) a module resource path belongs to. */
function classifyModule(resource) {
  if (!resource) return undefined;
  for (const lib of HEAVY_LIBRARIES) {
    if (packagesRegExp(lib.packages).test(resource)) return lib.id;
  }
  return undefined;
}

module.exports = { HEAVY_LIBRARIES, packagesRegExp, classifyModule };
