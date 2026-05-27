/**
 * Optimized imports for better tree-shaking
 * Use these specific imports instead of importing entire libraries
 */

// Stellar SDK - Tree-shaked imports
export {
  Server,
  TransactionBuilder,
  Asset,
  Operation,
  Account,
  Keypair,
  Networks,
  StrKey,
  Horizon,
} from '@stellar/stellar-sdk';

// D3.js - Specific imports for visualization
export { select, selectAll } from 'd3-selection';

export { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

export { scaleLinear, scaleBand } from 'd3-scale';

export { line, area, arc } from 'd3-shape';

// Lucide React - Specific icon imports
export {
  Shield,
  Users,
  Settings,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  HelpCircle,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react';

// Native JavaScript utilities to replace large libraries
export const nativeUtils = {
  // Replace lodash debounce
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  // Replace lodash throttle
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  // Replace lodash cloneDeep
  cloneDeep: <T>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (obj instanceof Array) return obj.map((item) => nativeUtils.cloneDeep(item)) as unknown as T;
    if (typeof obj === 'object') {
      const clonedObj = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = nativeUtils.cloneDeep(obj[key]);
        }
      }
      return clonedObj;
    }
    return obj;
  },

  // Replace lodash isEmpty
  isEmpty: (value: any): boolean => {
    if (value == null) return true;
    if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },

  // Replace axios get
  get: async (url: string, options?: RequestInit): Promise<any> => {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Replace axios post
  post: async (url: string, data?: any, options?: RequestInit): Promise<any> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Replace moment date formatting
  formatDate: (date: Date, format: string = 'default'): string => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    switch (format) {
      case 'short':
        return date.toLocaleDateString('en-US', { ...options, year: '2-digit' });
      case 'long':
        return date.toLocaleDateString('en-US', {
          ...options,
          weekday: 'long',
          hour: '2-digit',
          minute: '2-digit',
        });
      case 'time':
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      default:
        return date.toLocaleDateString('en-US', options);
    }
  },

  // Replace moment date arithmetic
  addTime: (date: Date, amount: number, unit: 'days' | 'hours' | 'minutes' | 'seconds'): Date => {
    const newDate = new Date(date);
    switch (unit) {
      case 'days':
        newDate.setDate(newDate.getDate() + amount);
        break;
      case 'hours':
        newDate.setHours(newDate.getHours() + amount);
        break;
      case 'minutes':
        newDate.setMinutes(newDate.getMinutes() + amount);
        break;
      case 'seconds':
        newDate.setSeconds(newDate.getSeconds() + amount);
        break;
    }
    return newDate;
  },

  // Replace moment date diff
  dateDiff: (
    date1: Date,
    date2: Date,
    unit: 'days' | 'hours' | 'minutes' | 'seconds' = 'days'
  ): number => {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    switch (unit) {
      case 'days':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case 'hours':
        return Math.floor(diffMs / (1000 * 60 * 60));
      case 'minutes':
        return Math.floor(diffMs / (1000 * 60));
      case 'seconds':
        return Math.floor(diffMs / 1000);
      default:
        return diffMs;
    }
  },
};

// Early bird loading script for critical resources
export const earlyBirdScript = `
(function() {
  // Preload critical CSS
  const criticalCSS = [
    '/_next/static/css/app/layout.css',
    '/_next/static/css/app/page.css'
  ];
  
  criticalCSS.forEach(function(href) {
    var link = document.createElement('link');
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
  var criticalFonts = [
    '/fonts/Geist-Regular.woff2',
    '/fonts/Geist-Mono-Regular.woff2'
  ];
  
  criticalFonts.forEach(function(href) {
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  });
  
  // Preload critical JavaScript
  var criticalJS = [
    '/_next/static/chunks/webpack.js',
    '/_next/static/chunks/framework.js'
  ];
  
  criticalJS.forEach(function(href) {
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = href;
    document.head.appendChild(link);
  });
})();
`;

// Bundle size monitoring utilities
export const bundleMonitor = {
  // Check if bundle size meets targets
  checkBundleSize: (currentSize: number, maxSize: number): boolean => {
    return currentSize <= maxSize;
  },

  // Log bundle size warnings
  logSizeWarning: (currentSize: number, maxSize: number, bundleName: string): void => {
    if (currentSize > maxSize) {
      console.warn(
        `⚠️ Bundle ${bundleName} size ${(currentSize / 1000).toFixed(2)}KB exceeds target ${(maxSize / 1000).toFixed(2)}KB`
      );
    }
  },

  // Calculate compression ratio
  getCompressionRatio: (originalSize: number, compressedSize: number): number => {
    return ((originalSize - compressedSize) / originalSize) * 100;
  },
};
