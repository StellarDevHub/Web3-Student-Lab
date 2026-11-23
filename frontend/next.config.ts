import type { NextConfig } from 'next';
import path from 'path';

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config: NextConfig) => config;

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
          charts: {
            test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2|recharts|d3-[\w-]+)[\\/]/,
            name: 'async-charts',
            chunks: 'async',
            priority: 40,
          },
          wasm: {
            test: /[\\/]node_modules[\\/](wabt|ethers|@ethersproject)[\\/]/,
            name: 'async-wasm-evm',
            chunks: 'async',
            priority: 40,
            enforce: true,
          },
          stellar: {
            test: /[\\/]node_modules[\\/]@stellar[\\/]/,
            name: 'stellar',
            chunks: 'all',
            priority: 20,
          },
          d3: {
            test: /[\\/]node_modules[\\/]d3[\\/]/,
            name: 'd3',
            chunks: 'all',
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
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            priority: 5,
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
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
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
    optimizePackageImports: ['d3', 'lucide-react', 'date-fns', 'framer-motion', 'recharts', 'react-chartjs-2'],
  },
};

export default withBundleAnalyzer(nextConfig);
