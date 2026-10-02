'use client';

/**
 * Backwards-compatible re-export.
 * The canonical Cmd+K implementation lives in
 * `@/components/navigation/CommandPalette` (FE-HARD-36); this module preserves
 * the existing `@/components/common/CommandPalette` import path used by
 * `src/app/layout.tsx` and older tests.
 */
export {
  CommandPalette,
  CommandPaletteTrigger,
  buildCommandIndex,
  filterCommands,
  NAV_ROUTES,
} from '@/components/navigation/CommandPalette';
export type {
  CommandCategory,
  CommandItem,
  CommandPaletteProps,
} from '@/components/navigation/CommandPalette';

import { CommandPalette as NavigationPalette } from '@/components/navigation/CommandPalette';

export default NavigationPalette;
