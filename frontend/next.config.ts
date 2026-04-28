import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  i18n: {
    locales: ["en", "es", "zh"],
    defaultLocale: "en",
    localeDetection: true,
  },
  // Bundle optimization and tree-shaking configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Optimize bundle size
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
      splitChunks: {
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
      },
    };

    // Tree-shaking for Stellar SDK
    config.resolve.alias = {
      ...config.resolve.alias,
      '@stellar/stellar-sdk': '@stellar/stellar-sdk/esm',
    };

    // Minimize bundle size
    config.optimization.minimize = true;

    return config;
  },
  // Enable compression
  compress: true,
  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  // Experimental features for better performance
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@stellar/stellar-sdk', 'd3', 'lucide-react'],
  },
};

export default nextConfig;
