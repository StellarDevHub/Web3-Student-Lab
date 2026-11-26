import type { NextConfig } from 'next';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HEAVY_LIBRARIES, packagesRegExp } = require('./scripts/bundle/heavy-libraries');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HeavyModulesManifestPlugin } = require('./scripts/bundle/heavy-modules-plugin');

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config: NextConfig) => config;

/** One enforced async cacheGroup per heavy library family. */
function heavyLibraryCacheGroups() {
  const groups: Record<string, object> = {};
  for (const lib of HEAVY_LIBRARIES as Array<{ id: string; chunkName: string; packages: string[] }>) {
    groups[`heavy-${lib.id}`] = {
      test: packagesRegExp(lib.packages),
      name: lib.chunkName,
      chunks: 'async',
      priority: 50,
      enforce: true,
      reuseExistingChunk: true,
    };
  }
  return groups;
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ['recharts'],

  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ['node_modules']),
    ];

    config.plugins = config.plugins || [];

    if (config.output) {
      config.output.environment = {
        ...config.output.environment,
        asyncFunction: true,
      };
    }

    // Client-only: server bundles are not shipped to the browser (FE-050).
    if (!isServer) {
      // Records which heavy libraries end up in initial vs async chunks so
      // `npm run check:bundle` can fail the build on a regression (FE-076).
      if (!dev) config.plugins.push(new HeavyModulesManifestPlugin());

      if (!config.optimization.splitChunks) {
        config.optimization.splitChunks = {};
      }
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
        cacheGroups: {
          // Heavy editor/canvas/chart/crypto libraries are only reachable through
          // next/dynamic boundaries. `chunks: 'async'` + top priority guarantees
          // they never get hoisted into an initial (render-blocking) chunk.
          monaco: {
            test: /[\\/]node_modules[\\/](monaco-editor|@monaco-editor|monaco-languageclient|y-monaco|vscode-[\w-]+)[\\/]/,
            name: 'async-monaco',
            chunks: 'async',
            priority: 40,
            enforce: true,
          },
          canvas: {
            test: /[\\/]node_modules[\\/](tldraw|@tldraw|reactflow|@reactflow|html2canvas|jspdf)[\\/]/,
            name: 'async-canvas',
            chunks: 'async',
            priority: 40,
            enforce: true,
          },
          // Charting & web3-math libraries (FE-076): one async chunk per family
          // (async-d3, async-chartjs, async-recharts, async-web3-math), built
          // from the same registry `check:bundle` enforces. `chunks: 'async'`
          // means they can only be reached through next/dynamic / import().
          ...heavyLibraryCacheGroups(),
          wasm: {
            test: /[\\/]node_modules[\\/]wabt[\\/]/,
            name: 'async-wasm',
            chunks: 'async',
            priority: 40,
            enforce: true,
          },
          // The Stellar SDK (~250 KB gzipped) is shared by many tool routes but
          // must not ride along on every page. A named `chunks: 'all'` group
          // used to merge it with the tiny @stellar/freighter-api the root
          // layout needs, putting the whole SDK into everyone's first load
          // (FE-076). Async-only now; static users get it via normal splitting.
          stellar: {
            test: /[\\/]node_modules[\\/]@stellar[\\/]stellar-(sdk|base)[\\/]/,
            name: 'async-stellar',
            chunks: 'async',
            priority: 20,
          },
          // React runtime shared by every route — one long-lived cacheable chunk.
          framework: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'framework',
            chunks: 'all',
            priority: 30,
            enforce: true,
          },
          // Remaining vendor code for first paint. No fixed `name`, so webpack
          // emits one chunk per set of routes sharing it instead of a single
          // global vendors file every page must download.
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            chunks: 'initial',
            priority: 10,
            reuseExistingChunk: true,
          },
          yjs: {
            test: /[\\/]node_modules[\\/](yjs|[\\/]@yjs)[\\/]/,
            name: 'async-yjs',
            chunks: 'async',
            priority: 35,
          },
          // Code shared by 2+ chunks. No fixed `name` (FE-076): a single global
          // "common" chunk was part of every route's first load (~130 KB
          // gzipped) regardless of whether the route used any of it.
          common: {
            minChunks: 2,
            chunks: 'all',
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // Next's optimizer negotiates AVIF first and WebP for broader compatibility.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    maximumRedirects: 2,
    maximumResponseBody: 10_000_000,
  },
  // Immutable CDN cache headers for static assets — FE-HARD-50
  async headers() {
    return [
      {
        // Next.js hashed static chunks — safe to cache forever
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Public folder assets (images, fonts, manifest)
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        // Fonts — long-lived
        source: '/:path*.woff2',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  experimental: {
    // Barrel-file tree shaking for icon/util/animation libraries (FE-050).
    optimizePackageImports: ['d3', 'lucide-react', 'date-fns', 'framer-motion', 'recharts', 'react-chartjs-2', 'ethers'],
  },
};

export default withBundleAnalyzer(nextConfig);
