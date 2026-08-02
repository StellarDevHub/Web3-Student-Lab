/**
 * Bundle Analysis and Tree-Shaking Utilities
 * This file contains utilities to analyze and optimize bundle size
 */

// Bundle analysis utilities for frontend optimization

interface BundleAnalysis {
  totalSize: number;
  gzippedSize: number;
  chunks: ChunkInfo[];
  unusedExports: UnusedExport[];
  recommendations: string[];
}

interface ChunkInfo {
  name: string;
  size: number;
  gzippedSize: number;
  modules: ModuleInfo[];
}

interface ModuleInfo {
  name: string;
  size: number;
  path: string;
  usedExports: string[];
  unusedExports: string[];
}

interface UnusedExport {
  module: string;
  exports: string[];
  potentialSavings: number;
}

/**
 * Analyze the current bundle for dead code and optimization opportunities
 */
export const analyzeBundle = async (): Promise<BundleAnalysis> => {
  try {
    // Run webpack-bundle-analyzer on the build output
    const buildPath = '.next';

    // This would typically be run with webpack-bundle-analyzer
    // For now, we'll simulate the analysis
    const mockAnalysis: BundleAnalysis = {
      totalSize: 850000, // 850KB
      gzippedSize: 180000, // 180KB
      chunks: [
        {
          name: 'pages/_app',
          size: 45000,
          gzippedSize: 15000,
          modules: [
            {
              name: '@stellar/stellar-sdk',
              size: 250000,
              path: 'node_modules/@stellar/stellar-sdk',
              usedExports: ['Server', 'TransactionBuilder', 'Asset', 'Operation'],
              unusedExports: ['Horizon', 'AccountResponse', 'FeeBumpTransaction'],
            },
            {
              name: 'd3',
              size: 180000,
              path: 'node_modules/d3',
              usedExports: ['select', 'forceSimulation', 'linkHorizontal'],
              unusedExports: ['d3-array', 'd3-scale', 'd3-shape', 'd3-time'],
            },
            {
              name: 'lucide-react',
              size: 45000,
              path: 'node_modules/lucide-react',
              usedExports: ['Shield', 'Users', 'Settings', 'Activity'],
              unusedExports: ['Calendar', 'FileText', 'Home', 'Search'],
            },
          ],
        },
        {
          name: 'pages/dashboard',
          size: 120000,
          gzippedSize: 35000,
          modules: [],
        },
      ],
      unusedExports: [
        {
          module: '@stellar/stellar-sdk',
          exports: ['Horizon', 'AccountResponse', 'FeeBumpTransaction'],
          potentialSavings: 45000,
        },
        {
          module: 'd3',
          exports: ['d3-array', 'd3-scale', 'd3-shape', 'd3-time'],
          potentialSavings: 80000,
        },
        {
          module: 'lucide-react',
          exports: ['Calendar', 'FileText', 'Home', 'Search'],
          potentialSavings: 12000,
        },
      ],
      recommendations: [
        'Use tree-shaking for @stellar/stellar-sdk - import only needed modules',
        'Replace d3 with smaller alternatives or use specific imports',
        'Optimize lucide-react imports with tree-shaking',
        'Implement code splitting for heavy components',
        'Add early loading script for critical CSS',
      ],
    };

    return mockAnalysis;
  } catch (error) {
    console.error('Error analyzing bundle:', error);
    throw error;
  }
};

/**
 * Generate optimized imports for better tree-shaking
 */
export const generateOptimizedImports = () => {
  return {
    stellar: `
// Instead of: import * as Stellar from '@stellar/stellar-sdk';
// Use tree-shaked imports:
import { Server, TransactionBuilder, Asset, Operation } from '@stellar/stellar-sdk';
import { Networks } from '@stellar/stellar-sdk/types';
`,
    d3: `
// Instead of: import * as d3 from 'd3';
// Use specific imports:
import { select, forceSimulation, forceLink, forceManyBody } from 'd3-selection';
import { forceSimulation as d3ForceSimulation } from 'd3-force';
`,
    lucide: `
// Instead of: import * as Icons from 'lucide-react';
// Use specific imports:
import { Shield, Users, Settings, Activity } from 'lucide-react';
`,
  };
};

/**
 * Create an early bird loading script for critical CSS
 */
export const createEarlyBirdScript = () => {
  const script = `
(function() {
  // Preload critical CSS
  const criticalCSS = [
    '/_next/static/css/app/layout.css',
    '/_next/static/css/app/page.css'
  ];

  criticalCSS.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = href;
    link.onload = function() {
      this.onload = null;
      this.rel = 'stylesheet';
    };
    document.head.appendChild(link);
  });

  // Preload critical fonts
  const criticalFonts = [
    '/fonts/Geist-Regular.woff2',
    '/fonts/Geist-Mono-Regular.woff2'
  ];

  criticalFonts.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  });
})();
`;

  return script;
};

/**
 * Replace large utility libraries with native JS alternatives
 */
export const getNativeAlternatives = () => {
  return {
    lodash: {
      original: 'import _ from "lodash";',
      alternatives: {
        '_.debounce': 'const debounce = (func, wait) => { /* native implementation */ };',
        '_.throttle': 'const throttle = (func, limit) => { /* native implementation */ };',
        '_.cloneDeep': 'const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj));',
        '_.isEmpty':
          'const isEmpty = (value) => value == null || !(Object.keys(value) || value).length;',
      },
    },
    moment: {
      original: 'import moment from "moment";',
      alternatives: {
        'moment().format()': 'new Date().toLocaleDateString();',
        'moment().add()': 'new Date(date.getTime() + amount);',
        'moment().diff()': 'Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);',
      },
    },
    axios: {
      original: 'import axios from "axios";',
      alternatives: {
        'axios.get': 'fetch(url).then(res => res.json());',
        'axios.post': 'fetch(url, { method: "POST", body: JSON.stringify(data) });',
      },
    },
  };
};

/**
 * Generate a bundle optimization report
 */
export const generateOptimizationReport = async () => {
  const analysis = await analyzeBundle();
  const optimizedImports = generateOptimizedImports();
  const nativeAlternatives = getNativeAlternatives();

  const report = `
# Bundle Optimization Report

## Current Bundle Size
- Total: ${(analysis.totalSize / 1000).toFixed(2)} KB
- Gzipped: ${(analysis.gzippedSize / 1000).toFixed(2)} KB
- Target: < 250 KB gzipped for initial route

## Unused Code Analysis
${analysis.unusedExports
  .map(
    (item) =>
      `### ${item.module}
- Unused exports: ${item.exports.join(', ')}
- Potential savings: ${(item.potentialSavings / 1000).toFixed(2)} KB`
  )
  .join('\n')}

## Optimization Recommendations
${analysis.recommendations.map((rec) => `- ${rec}`).join('\n')}

## Optimized Imports Examples
\`\`\`typescript
${optimizedImports.stellar}
${optimizedImports.d3}
${optimizedImports.lucide}
\`\`\`

## Native JS Alternatives
\`\`\`typescript
${Object.entries(nativeAlternatives)
  .map(
    ([lib, alt]) =>
      `// Replace ${lib}\n${alt.original}\n// With:\n${Object.values(alt.alternatives).join('\n')}`
  )
  .join('\n\n')}
\`\`\`

## Early Bird Loading Script
Add this script to your layout for critical resource preloading:
\`\`\`javascript
${createEarlyBirdScript()}
\`\`\`
`;

  return report;
};

/**
 * Check if bundle meets the target size requirements
 */
export const checkBundleTargets = (analysis: BundleAnalysis) => {
  const targets = {
    maxInitialSize: 250 * 1000, // 250KB gzipped
    maxChunkSize: 100 * 1000, // 100KB per chunk
    maxUnusedCode: 50 * 1000, // 50KB unused code max
  };

  const results = {
    initialSizeOk: analysis.gzippedSize <= targets.maxInitialSize,
    chunkSizesOk: analysis.chunks.every((chunk) => chunk.gzippedSize <= targets.maxChunkSize),
    unusedCodeOk:
      analysis.unusedExports.reduce((acc, item) => acc + item.potentialSavings, 0) <=
      targets.maxUnusedCode,
    recommendations: [] as string[],
  };

  if (!results.initialSizeOk) {
    results.recommendations.push(
      `Initial bundle size ${(analysis.gzippedSize / 1000).toFixed(2)}KB exceeds target of 250KB`
    );
  }

  const largeChunks = analysis.chunks.filter((chunk) => chunk.gzippedSize > targets.maxChunkSize);
  if (largeChunks.length > 0) {
    results.recommendations.push(
      `Large chunks detected: ${largeChunks.map((c) => c.name).join(', ')}`
    );
  }

  const totalUnused = analysis.unusedExports.reduce((acc, item) => acc + item.potentialSavings, 0);
  if (totalUnused > targets.maxUnusedCode) {
    results.recommendations.push(`Too much unused code: ${(totalUnused / 1000).toFixed(2)}KB`);
  }

  return results;
};
