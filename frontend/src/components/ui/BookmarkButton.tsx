'use client';

import React, { useCallback } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores/userStore';

interface BookmarkButtonProps {
  type: 'lesson' | 'exercise' | 'resource';
  title: string;
  url: string;
  tags?: string[];
  className?: string;
  variant?: 'icon' | 'full';
  size?: 'sm' | 'md' | 'lg';
}

export function BookmarkButton({
  type,
  title,
  url,
  tags = [],
  className,
  variant = 'icon',
  size = 'md',
}: BookmarkButtonProps) {
  const bookmarks = useUserStore((state) => state.learningPath.bookmarks);
  const addBookmark = useUserStore((state) => state.addBookmark);
  const removeBookmark = useUserStore((state) => state.removeBookmark);

  const isBookmarked = bookmarks.some((b) => b.url === url);

  const handleToggle = useCallback(() => {
    if (isBookmarked) {
      const bookmark = bookmarks.find((b) => b.url === url);
      if (bookmark) {
        removeBookmark(bookmark.id);
      }
    } else {
      addBookmark({ type, title, url, tags });
    }
  }, [isBookmarked, bookmarks, url, addBookmark, removeBookmark, type, title, tags]);

  const sizeClasses = {
    sm: variant === 'icon' ? 'h-8 w-8' : 'gap-1.5 px-2.5 py-1 text-xs',
    md: variant === 'icon' ? 'h-9 w-9' : 'gap-2 px-3.5 py-2 text-sm',
    lg: variant === 'icon' ? 'h-10 w-10' : 'gap-2 px-4 py-2.5 text-sm',
  };

  const iconSizes = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleToggle}
        className={cn(
          'inline-flex items-center justify-center rounded-xl border transition-colors',
          isBookmarked
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            : 'border-white/8 bg-white/4 text-[var(--muted)] hover:border-white/15 hover:text-[var(--text-strong)]',
          sizeClasses[size],
          className
        )}
        aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        {isBookmarked ? (
          <BookmarkCheck className={iconSizes[size]} />
        ) : (
          <Bookmark className={iconSizes[size]} />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className={cn(
        'inline-flex items-center rounded-xl border font-medium transition-colors',
        isBookmarked
          ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
          : 'border-white/8 bg-white/4 text-[var(--muted)] hover:border-white/15 hover:text-[var(--text-strong)]',
        sizeClasses[size],
        className
      )}
    >
      {isBookmarked ? (
        <BookmarkCheck className={iconSizes[size]} />
      ) : (
        <Bookmark className={iconSizes[size]} />
      )}
      <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
    </button>
  );
}
