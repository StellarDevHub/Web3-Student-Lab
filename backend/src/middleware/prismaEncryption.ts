import { Prisma } from '@prisma/client';
import { securityService } from '../services/securityService.js';
import logger from '../utils/logger.js';

const ENCRYPTED_FIELDS = new Map<string, string[]>([
  ['Student', ['githubAccessToken', 'email']],
  ['Certificate', ['studentId']],
]);

export function encryptionMiddleware() {
  return Prisma.getExtension?.(() => ({
    query: {
      $allModels: {
        async create({ model, args, query }: any) {
          const fields = ENCRYPTED_FIELDS.get(model);
          if (fields && args?.data) {
            for (const field of fields) {
              if (args.data[field] && typeof args.data[field] === 'string') {
                args.data[field] = securityService.encryptField(args.data[field]);
              }
            }
          }
          return query(args);
        },
        async update({ model, args, query }: any) {
          const fields = ENCRYPTED_FIELDS.get(model);
          if (fields && args?.data) {
            for (const field of fields) {
              if (args.data[field] && typeof args.data[field] === 'string') {
                args.data[field] = securityService.encryptField(args.data[field]);
              }
            }
          }
          return query(args);
        },
        async findFirst({ model, args, query }: any) {
          const result = await query(args);
          const fields = ENCRYPTED_FIELDS.get(model);
          if (fields && result) {
            for (const field of fields) {
              if (result[field] && typeof result[field] === 'string') {
                try {
                  result[field] = securityService.decryptField(result[field]);
                } catch {
                  result[field] = result[field];
                }
              }
            }
          }
          return result;
        },
        async findUnique({ model, args, query }: any) {
          const result = await query(args);
          const fields = ENCRYPTED_FIELDS.get(model);
          if (fields && result) {
            for (const field of fields) {
              if (result[field] && typeof result[field] === 'string') {
                try {
                  result[field] = securityService.decryptField(result[field]);
                } catch {
                  result[field] = result[field];
                }
              }
            }
          }
          return result;
        },
        async findMany({ model, args, query }: any) {
          const results = await query(args);
          const fields = ENCRYPTED_FIELDS.get(model);
          if (fields && Array.isArray(results)) {
            for (const result of results) {
              for (const field of fields) {
                if (result[field] && typeof result[field] === 'string') {
                  try {
                    result[field] = securityService.decryptField(result[field]);
                  } catch {
                    result[field] = result[field];
                  }
                }
              }
            }
          }
          return results;
        },
      },
    },
  }));
}
