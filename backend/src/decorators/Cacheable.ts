import cacheService from '../cache/CacheService.js';

interface CacheableOptions {
  key: (...args: unknown[]) => string;
  ttl: number;
}

export function Cacheable(options: CacheableOptions) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const cacheKey = options.key(...args);

      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await cacheService.set(cacheKey, result, options.ttl);

      return result;
    };

    return descriptor;
  };
}
