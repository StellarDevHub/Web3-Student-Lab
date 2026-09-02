'use client';

import { useThemeMode } from '@/hooks/useThemeMode';
import { ANIMATION_TOKENS } from '@/lib/animations/animationTokens';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import React from 'react';

/**
 * Props for ThemeToggle component
 *
 * @interface ThemeToggleProps
 * @property {('sm'|'md'|'lg')} [size='md'] - Button size variant
 * @property {('button'|'icon')} [variant='icon'] - Display variant
 * @property {boolean} [showLabel=false] - Show theme text label
 * @property {string} [className=''] - Additional CSS classes
 */
interface ThemeToggleProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'icon';
  showLabel?: boolean;
  className?: string;
}

/**
 * ThemeToggle Component
 *
 * A flexible, accessible theme toggle button with multiple variants
 * and smooth animations.
 *
 * Features:
 * - Icon variant: Compact button with animated sun/moon icon
 * - Button variant: Button with optional text label
 * - Multiple sizes: sm, md, lg
 * - Smooth animations using Framer Motion
 * - Full accessibility (ARIA labels, keyboard support)
 * - Prevents FOUC by checking hydration state
 *
 * Why this component?
 * - Provides consistent theme toggle across the app
 * - Handles loading state properly (prevents FOUC)
 * - Includes accessibility features by default
 * - Smooth, polished user experience
 *
 * @param {ThemeToggleProps} props - Component props
 * @returns {JSX.Element} Theme toggle button
 *
 * @example
 * // Icon variant (default, small)
 * <ThemeToggle size="sm" />
 *
 * @example
 * // Button variant with label
 * <ThemeToggle variant="button" showLabel={true} />
 *
 * @example
 * // Large icon variant with custom styles
 * <ThemeToggle size="lg" className="ml-auto" />
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  size = 'md',
  variant = 'icon',
  showLabel = false,
  className = '',
}) => {
  // Get theme state and utilities from the hook
  // mounted: whether component is hydrated (prevents FOUC)
  // isDark: current theme is dark
  // toggleTheme: function to switch themes
  const { theme, isDark, mounted, toggleTheme } = useThemeMode();

  // Show placeholder while hydrating
  // This prevents mismatches between server and client
  // The placeholder matches the expected button size
  if (!mounted) {
    // Return placeholder to prevent FOUC
    return <div className={`h-10 w-10 rounded-lg bg-gray-900 ${className}`} />;
  }

  // Map size prop to CSS size classes
  // Using Tailwind's sizing utilities for consistency
  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  // Icon sizes in pixels
  // Used for lucide-react icons which take a size prop
  const iconSizeMap = {
    sm: 20,
    md: 24,
    lg: 28,
  };

  // Button variant: Shows icon + optional text label
  if (variant === 'button') {
    return (
      <motion.button
        // Add subtle scale animation on interaction
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleTheme}
        className={`flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-black focus:outline-none dark:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-200 dark:hover:text-gray-700 dark:focus:ring-offset-white ${className} `}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        <AnimatedThemeIcon isDark={isDark} size={size} />
        {showLabel && <span className="text-sm font-medium">{isDark ? 'Dark' : 'Light'}</span>}
      </motion.button>
    );
  }

  // Icon variant (default): Compact button with just the animated icon
  // This is ideal for navigation bars and headers
  return (
    <motion.button
      // Animation for hover/tap states
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={toggleTheme}
      className={`relative flex items-center justify-center rounded-lg ${sizeMap[size]} bg-gray-900 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-black focus:outline-none dark:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-200 dark:hover:text-gray-700 dark:focus:ring-offset-white ${className} `}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      type="button"
    >
      <AnimatedThemeIcon isDark={isDark} size={size} />
    </motion.button>
  );
};

/**
 * AnimatedThemeIcon Component
 *
 * Internal component that renders an animated sun or moon icon
 * based on the current theme state.
 *
 * The animation:
 * 1. On theme change: icon scales down and fades out while rotating
 * 2. Opposite icon fades in while scaling up (due to exit/enter animation)
 * 3. Creates a smooth, polished transition effect
 *
 * Why animate?
 * - Provides visual feedback of state change
 * - Makes the interface feel more responsive
 * - Improves user experience and engagement
 *
 * @internal Used internally by ThemeToggle
 */
const AnimatedThemeIcon: React.FC<{ isDark: boolean; size: 'sm' | 'md' | 'lg' }> = ({
  isDark,
  size,
}) => {
  // Icon sizes for different button sizes
  const iconSizeMap = {
    sm: 20,
    md: 24,
    lg: 28,
  };

  const iconSize = iconSizeMap[size];

  // Motion div with enter/exit animations
  // This creates the smooth icon transition effect
  return (
    <motion.div
      // Don't animate on initial render
      initial={false}
      // Animation while this icon is visible
      animate={{
        scale: [1, 0.8], // Shrink
        opacity: [1, 0], // Fade out
        rotate: isDark ? 0 : 180, // Rotate based on theme
      }}
      // Animation as this icon exits (when theme changes)
      exit={{
        scale: [0.8, 1], // Grow
        opacity: [0, 1], // Fade in
        rotate: isDark ? 180 : 0,
      }}
      // Use timing from animation tokens for consistency
      transition={{
        duration: ANIMATION_TOKENS.durations.short,
        ease: ANIMATION_TOKENS.easing.easeInOut,
      }}
      // Use isDark as key so icon re-mounts on change
      // This ensures exit animation plays before icon switches
      key={isDark ? 'moon' : 'sun'}
      className="absolute"
    >
      {isDark ? (
        // Show moon icon in dark mode with amber color
        <Moon size={iconSize} className="text-amber-300" />
      ) : (
        // Show sun icon in light mode with brighter amber
        <Sun size={iconSize} className="text-amber-400" />
      )}
    </motion.div>
  );
};

// Compact version for navigation bars
export const ThemeToggleCompact: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isDark, mounted, toggleTheme } = useThemeMode();

  // Return null while hydrating to avoid layout shift
  // This is better than showing a placeholder for compact version
  if (!mounted) {
    return null;
  }

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={toggleTheme}
      className={`rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-900 hover:text-gray-300 focus:ring-2 focus:ring-purple-500 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white ${className} `}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <motion.div
        animate={{ rotate: isDark ? 180 : 0 }}
        transition={{
          duration: ANIMATION_TOKENS.durations.short,
          ease: ANIMATION_TOKENS.easing.easeInOut,
        }}
      >
        {isDark ? (
          <Moon size={20} className="text-amber-300" />
        ) : (
          <Sun size={20} className="text-amber-400" />
        )}
      </motion.div>
    </motion.button>
  );
};
