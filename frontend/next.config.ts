import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '.'),
  reactCompiler: true,
  // Disable Turbopack and use Webpack (required for custom webpack config)
  // turbopack: {}, // Uncomment this line if you want to use Turbopack instead

  // Bundle optimization and tree-shaking configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Tree-shaking for Stellar SDK
    config.resolve.alias = {
      ...config.resolve.alias,
    };

    // Split chunks for better caching
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
  // Enable compression
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['@stellar/stellar-sdk', 'd3', 'lucide-react'],
  },
};

export default nextConfig;
