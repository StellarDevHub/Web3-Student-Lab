'use client';

import { useMemo, useState } from 'react';
import { BookmarkCheck, ExternalLink, Search, Tag, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useUserStore } from '@/stores/userStore';
import { formatDistanceToNow } from '@/lib/utils';

const BOOKMARK_TYPES = ['lesson', 'exercise', 'resource'] as const;

export default function BookmarksPage() {
  const bookmarks = useUserStore((state) => state.learningPath.bookmarks);
  const removeBookmark = useUserStore((state) => state.removeBookmark);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    bookmarks.forEach((b) => b.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((b) => {
      if (searchQuery && !b.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedType && b.type !== selectedType) {
        return false;
      }
      if (selectedTag && !b.tags?.includes(selectedTag)) {
        return false;
      }
      return true;
    });
  }, [bookmarks, searchQuery, selectedType, selectedTag]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <span className="eyebrow">Learning tools</span>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
          Bookmarks
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--muted)]">
          Save and organize your favorite learning resources, code examples, and documentation pages.
        </p>
      </div>

      <div className="mb-8 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookmarks..."
            className="w-full rounded-2xl border border-white/8 bg-white/4 py-3 pl-11 pr-4 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedType(null)}
            className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              !selectedType
                ? 'border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10 text-[var(--brand-strong)]'
                : 'border-white/8 bg-white/4 text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            All
          </button>
          {BOOKMARK_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                selectedType === type
                  ? 'border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10 text-[var(--brand-strong)]'
                  : 'border-white/8 bg-white/4 text-[var(--muted)] hover:text-[var(--text-strong)]'
              }`}
            >
              {type}s
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-[var(--muted)]" />
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedTag === tag
                    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                    : 'border-white/8 bg-white/4 text-[var(--muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                {tag}
                {selectedTag === tag && <X className="h-3 w-3" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {bookmarks.length === 0 && (
        <div className="surface-card flex flex-col items-center rounded-2xl p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-500/10">
            <BookmarkCheck className="h-7 w-7 text-yellow-400" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)]">No bookmarks yet</h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-[var(--muted)]">
            Start bookmarking lessons, exercises, and resources as you learn. Use the bookmark button
            on any page to save it here.
          </p>
          <Link
            href="/courses"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-5 py-2.5 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
          >
            Browse courses
          </Link>
        </div>
      )}

      {bookmarks.length > 0 && filteredBookmarks.length === 0 && (
        <div className="surface-card flex flex-col items-center rounded-2xl p-12 text-center">
          <Search className="mb-4 h-8 w-8 text-[var(--muted)]" />
          <h2 className="text-xl font-semibold text-[var(--text-strong)]">No matching bookmarks</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Try adjusting your search or filters.
          </p>
        </div>
      )}

      {filteredBookmarks.length > 0 && (
        <div className="grid gap-4">
          {filteredBookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="surface-card flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/4 p-5 transition-colors hover:border-white/15"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                      bookmark.type === 'lesson'
                        ? 'bg-blue-500/10 text-blue-400'
                        : bookmark.type === 'exercise'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-purple-500/10 text-purple-400'
                    }`}
                  >
                    {bookmark.type}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {formatDistanceToNow(bookmark.addedAt)}
                  </span>
                </div>

                <h3 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">
                  {bookmark.title}
                </h3>

                {bookmark.tags && bookmark.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bookmark.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-[var(--muted)]"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-strong)] hover:underline"
                >
                  Open resource
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <button
                onClick={() => removeBookmark(bookmark.id)}
                className="shrink-0 rounded-xl border border-white/8 bg-white/4 p-2.5 text-[var(--muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Remove bookmark: ${bookmark.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
