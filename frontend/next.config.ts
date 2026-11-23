import type { NextConfig } from 'next';
import path from 'path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'zlib';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PUBLIC_SWR_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=604800';

const COMPRESSIBLE_ASSET = /\.(?:js|mjs|css|json|svg|txt|xml)$/i;

const COMPRESSED_CONTENT_TYPES: Record<string, string> = {
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
};

// FE-100: emit .br/.gz siblings for every text asset so the CDN (or the
// middleware content negotiation) can serve pre-compressed payloads instead of
// compressing the same chunks again on every origin request.
class PrecompressedAssetsPlugin {
  apply(compiler: any): void {
    const { Compilation, sources } = compiler.webpack;

    compiler.hooks.thisCompilation.tap('PrecompressedAssetsPlugin', (compilation: any) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'PrecompressedAssetsPlugin',
          stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
        },
        (assets: Record<string, any>) => {
          for (const [name, asset] of Object.entries(assets)) {
            if (!COMPRESSIBLE_ASSET.test(name) || /\.(?:br|gz|map)$/i.test(name)) {
              continue;
            }

            const source = asset.source();
            const input = Buffer.isBuffer(source) ? source : Buffer.from(String(source ?? ''));
            if (input.length === 0) continue;

            const brotli = brotliCompressSync(input, {
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 6,
                [zlibConstants.BROTLI_PARAM_SIZE_HINT]: input.length,
              },
            });
            const gzip = gzipSync(input, { level: 9 });

            compilation.emitAsset(`${name}.br`, new sources.RawSource(brotli));
            compilation.emitAsset(`${name}.gz`, new sources.RawSource(gzip));
          }
        },
      );
    });
  }
}

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({
      enabled: true,
      analyzerMode: 'static',
      openAnalyzer: false,
      generateStatsFile: true,
      statsFilename: 'client-stats.json',
    })
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

    // FE-100: pre-compress only client assets emitted by a production build.
    if (!dev && !isServer) {
      config.plugins.push(new PrecompressedAssetsPlugin());
    }

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
  // FE-100: immutable hashed chunks, pre-compressed variants and SWR for
  // dynamic public endpoints.
  async headers() {
    const immutableHeaders = [
      { key: 'Cache-Control', value: IMMUTABLE_CACHE_CONTROL },
      { key: 'Vary', value: 'Accept-Encoding' },
    ];

    const precompressedHeaders = (encoding: 'br' | 'gzip') => [
      ...immutableHeaders,
      { key: 'Content-Encoding', value: encoding },
    ];

    // Middleware rewrites these URLs to the .br/.gz sibling emitted at build
    // time. Next.js forbids middleware from setting Content-Encoding, so the
    // encoding header is attached here using the same Accept-Encoding match.
    const negotiatedEncodingHeaders = ['js', 'mjs', 'css', 'json', 'svg', 'txt', 'xml'].flatMap(
      (extension) => [
        {
          source: `/_next/static/:path*.${extension}`,
          has: [
            {
              type: 'header' as const,
              key: 'Accept-Encoding',
              value: '^(?!.*br).*gzip.*',
            },
          ],
          headers: [{ key: 'Content-Encoding', value: 'gzip' }],
        },
        {
          source: `/_next/static/:path*.${extension}`,
          has: [{ type: 'header' as const, key: 'Accept-Encoding', value: '.*br.*' }],
          headers: [{ key: 'Content-Encoding', value: 'br' }],
        },
      ],
    );

    const publicApiRoutes = [
      '/api/courses/:path*',
      '/api/public/:path*',
      '/api/seo/:path*',
      '/api/tokenomics/:path*',
      '/api/certificates/explorer/:path*',
      '/api/triage/leaderboard',
      '/api/v1/courses/:path*',
      '/api/v1/certificates/:path*',
      '/api/v1/health/:path*',
    ];

    return [
      {
        // Next.js hashed static chunks — safe to cache forever
        source: '/_next/static/:path*',
        headers: immutableHeaders,
      },
      ...negotiatedEncodingHeaders,
      {
        // Pre-compressed variants emitted by PrecompressedAssetsPlugin
        source: '/_next/static/:path*.br',
        headers: precompressedHeaders('br'),
      },
      {
        source: '/_next/static/:path*.gz',
        headers: precompressedHeaders('gzip'),
      },
      ...Object.entries(COMPRESSED_CONTENT_TYPES).flatMap(([extension, contentType]) => [
        {
          source: `/_next/static/:path*.${extension}.br`,
          headers: [{ key: 'Content-Type', value: contentType }],
        },
        {
          source: `/_next/static/:path*.${extension}.gz`,
          headers: [{ key: 'Content-Type', value: contentType }],
        },
      ]),
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
            value: IMMUTABLE_CACHE_CONTROL,
          },
        ],
      },
      ...publicApiRoutes.map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: PUBLIC_SWR_CACHE_CONTROL,
          },
        ],
      })),
    ];
  },
  experimental: {
    // Barrel-file tree shaking for icon/util/animation libraries (FE-050).
    optimizePackageImports: ['d3', 'lucide-react', 'date-fns', 'framer-motion', 'recharts', 'react-chartjs-2'],
  },
};

export default withBundleAnalyzer(nextConfig);
