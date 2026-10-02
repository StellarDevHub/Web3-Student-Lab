import type { NextConfig } from 'next';
import path from 'path';

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config: NextConfig) => config;

const nextConfig: NextConfig = {
  // Enable standalone output for minimal Docker images — FE-HARD-50
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../'),
  reactCompiler: true,
  transpilePackages: ['recharts'],

  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ['node_modules']),
    ];

    if (config.output) {
      config.output.environment = {
        ...config.output.environment,
        asyncFunction: true,
      };
    }

    if (!config.optimization.splitChunks) {
      config.optimization.splitChunks = {};
    }
    config.optimization.splitChunks = {
      ...config.optimization.splitChunks,
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
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
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
        },
      },
    };

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
    optimizePackageImports: ['@stellar/stellar-sdk', 'd3', 'lucide-react'],
  },
};

export default withBundleAnalyzer(nextConfig);
