import { buildLinkHeader, decodeCursor, encodeCursor, paginateKeyset } from '../src/search/PaginationHelper.js';

describe('Cursor-Based Keyset Pagination (Issue #1120)', () => {
  test('encodeCursor and decodeCursor correctly serialize and deserialize payloads', () => {
    const payload = { id: 'cert-101', timestamp: '2026-08-29' };
    const token = encodeCursor(payload);

    expect(typeof token).toBe('string');
    expect(decodeCursor(token)).toEqual(payload);
  });

  test('decodeCursor throws on malformed token string', () => {
    expect(() => decodeCursor('not-valid-base64-json!')).toThrow('Invalid cursor');
  });

  test('buildLinkHeader constructs RFC compliant REST Link header', () => {
    const nextCursor = encodeCursor({ id: 'item-20' });
    const prevCursor = encodeCursor({ id: 'item-1' });

    const header = buildLinkHeader('/api/courses', { take: '20' }, nextCursor, prevCursor);

    expect(header).toContain('/api/courses?take=20&cursor=');
    expect(header).toContain('rel="next"');
    expect(header).toContain('rel="prev"');
  });

  test('paginateKeyset executes bidirectional pagination over mock item set', async () => {
    const mockData = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i + 1}`,
      title: `Item ${i + 1}`,
    }));

    const page1 = await paginateKeyset(
      async (args) => {
        let filtered = [...mockData];
        if (args.cursor?.id) {
          const idx = filtered.findIndex((x) => x.id === args.cursor?.id);
          if (idx !== -1) {
            filtered = filtered.slice(idx + (args.skip || 0));
          }
        }
        return filtered.slice(0, args.take);
      },
      { take: 10 }
    );

    expect(page1.items.length).toBe(10);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await paginateKeyset(
      async (args) => {
        let filtered = [...mockData];
        if (args.cursor?.id) {
          const idx = filtered.findIndex((x) => x.id === args.cursor?.id);
          if (idx !== -1) {
            filtered = filtered.slice(idx + (args.skip || 0));
          }
        }
        return filtered.slice(0, args.take);
      },
      { take: 10, cursor: page1.nextCursor! }
    );

    expect(page2.items.length).toBe(10);
    expect(page2.items[0]!.id).toBe('item-11');
    expect(page2.prevCursor).not.toBeNull();
  });
});
