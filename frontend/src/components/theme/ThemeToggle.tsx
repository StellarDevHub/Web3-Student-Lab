'use client';

import { useThemeMode } from '@/hooks/useThemeMode';
import { ANIMATION_TOKENS } from '@/lib/animations/animationTokens';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import React from 'react';

interface ThemeToggleProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'icon';
  showLabel?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  size = 'md',
  variant = 'icon',
  showLabel = false,
  className = '',
}) => {
  const { theme, isDark, mounted, toggleTheme } = useThemeMode();

  if (!mounted) {
    // Return placeholder to prevent FOUC
    return <div className={`h-10 w-10 rounded-lg bg-gray-900 ${className}`} />;
  }

  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const iconSizeMap = {
    sm: 20,
    md: 24,
    lg: 28,
  };

  if (variant === 'button') {
    return (
      <motion.button
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

  // Icon variant
  return (
    <motion.button
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

// Internal component for animated icon
const AnimatedThemeIcon: React.FC<{ isDark: boolean; size: 'sm' | 'md' | 'lg' }> = ({
  isDark,
  size,
}) => {
  const iconSizeMap = {
    sm: 20,
    md: 24,
    lg: 28,
  };

  const iconSize = iconSizeMap[size];

  return (
    <motion.div
      initial={false}
      animate={{
        scale: [1, 0.8],
        opacity: [1, 0],
        rotate: isDark ? 0 : 180,
      }}
      exit={{
        scale: [0.8, 1],
        opacity: [0, 1],
        rotate: isDark ? 180 : 0,
      }}
      transition={{
        duration: ANIMATION_TOKENS.durations.short,
        ease: ANIMATION_TOKENS.easing.easeInOut,
      }}
      key={isDark ? 'moon' : 'sun'}
      className="absolute"
    >
      {isDark ? (
        <Moon size={iconSize} className="text-amber-300" />
      ) : (
        <Sun size={iconSize} className="text-amber-400" />
      )}
    </motion.div>
  );
};

// Compact version for navigation bars
export const ThemeToggleCompact: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isDark, mounted, toggleTheme } = useThemeMode();

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
