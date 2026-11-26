'use client';

import dynamic from 'next/dynamic';

/**
 * Layout-level widgets that are never part of first paint (FE-050).
 *
 * `next/dynamic` with `ssr: false` is not allowed in the server-component
 * root layout, so the lazy boundaries live in this client module. Each widget
 * is fetched after hydration, keeping the command index (fuse.js + route
 * catalogue) and modal code out of the initial JS shared by every route.
 */
export const DeferredCommandPalette = dynamic(
  () => import('@/components/common/CommandPalette').then((mod) => mod.CommandPalette),
  { ssr: false },
);

export const DeferredRenderWarningModal = dynamic(() => import('@/components/layout/RenderWarningModal'), {
  ssr: false,
});

export const DeferredOfflineNotification = dynamic(
  () => import('@/components/notifications/OfflineNotification').then((mod) => mod.OfflineNotification),
  { ssr: false },
);

/**
 * Course notification socket bridge. Renders nothing until the socket drops,
 * so connecting after hydration is invisible — and keeps socket.io-client out
 * of every route's first-load JS (FE-076).
 */
export const DeferredCourseNotificationListener = dynamic(
  () =>
    import('@/components/notifications/CourseNotificationListener').then(
      (mod) => mod.CourseNotificationListener,
    ),
  { ssr: false },
);
