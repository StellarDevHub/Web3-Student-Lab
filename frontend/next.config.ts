import type { NextConfig } from 'next';
import path from 'path';
import { cspDirectivesToString, getCSPConfig } from './src/lib/security/csp-config';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '.'),
  reactCompiler: true,
  // Disable Turbopack and use Webpack (required for custom webpack config)
  // turbopack: {}, // Uncomment this line if you want to use Turbopack instead

  // Content Security Policy with nonce-based script loading
  async headers() {
    const cspConfig = getCSPConfig();
    const cspValue = cspDirectivesToString(cspConfig.directives);
    const headerKey = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: headerKey,
            value: cspValue,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },

  // Bundle optimization and tree-shaking configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Tree-shaking for Stellar SDK
    config.resolve.alias = {
      ...config.resolve.alias,
    };

    // Enable Module Federation host/remote configuration for micro-frontends
    config.plugins.push(
      new webpack.container.ModuleFederationPlugin({
        name: 'frontend_host',
        filename: 'remoteEntry.js',
        exposes: {
          './SharedUi': './src/microfrontends/shared/index.tsx',
          './LabRemote': './src/microfrontends/remote/LabRemoteModule.tsx',
        },
        remotes: {
          lab_remote: 'lab_remote@http://localhost:3000/remoteEntry.js',
        },
        /* shared: {
          react: { singleton: true, eager: false, requiredVersion: false },
          'react-dom': { singleton: true, eager: false, requiredVersion: false },
          zustand: { singleton: true, eager: false, requiredVersion: false },
          d3: { singleton: true, eager: false, requiredVersion: false },
          axios: { singleton: true, eager: false, requiredVersion: false },
          '@stellar/stellar-sdk': { singleton: true, eager: false, requiredVersion: false },
        }, */
      })
    );

    // Suppress warnings about async/await in external script modules
    if (config.output) {
      config.output.environment = {
        ...config.output.environment,
        asyncFunction: true,
      };
    }

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
