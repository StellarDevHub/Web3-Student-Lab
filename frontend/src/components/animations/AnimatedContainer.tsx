'use client';

import { ANIMATION_TOKENS, ANIMATION_VARIANTS } from '@/lib/animations/animationTokens';
import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';

interface AnimatedContainerProps {
  children: React.ReactNode;
  variant?:
    | 'fadeIn'
    | 'slideInUp'
    | 'slideInDown'
    | 'slideInLeft'
    | 'slideInRight'
    | 'scaleIn'
    | 'stagger';
  delay?: number;
  duration?: number;
  className?: string;
  animated?: boolean;
}

export const AnimatedContainer = React.forwardRef<HTMLDivElement, AnimatedContainerProps>(
  ({ children, variant = 'fadeIn', delay = 0, duration, className = '', animated = true }, ref) => {
    if (!animated) {
      return (
        <div ref={ref} className={className}>
          {children}
        </div>
      );
    }

    const variants = ANIMATION_VARIANTS[variant as keyof typeof ANIMATION_VARIANTS];
    const animationDuration = duration || ANIMATION_TOKENS.durations.entrance;

    if (variant === 'stagger') {
      return (
        <motion.div
          ref={ref}
          className={className}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={{
            animate: {
              transition: {
                staggerChildren: 0.1,
                delayChildren: delay,
              },
            },
          }}
        >
          {React.Children.map(children, (child) => (
            <motion.div
              variants={ANIMATION_VARIANTS.stagger.item}
              transition={{
                duration: ANIMATION_TOKENS.durations.normal,
                ease: ANIMATION_TOKENS.easing.easeOut,
              }}
            >
              {child}
            </motion.div>
          ))}
        </motion.div>
      );
    }

    return (
      <motion.div
        ref={ref}
        variants={variants as any}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          duration: animationDuration,
          ease: ANIMATION_TOKENS.easing.easeOut,
          delay,
        }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);

AnimatedContainer.displayName = 'AnimatedContainer';

// Wrapper component for AnimatePresence
export const AnimatedContainerWithPresence: React.FC<
  AnimatedContainerProps & { isVisible: boolean }
> = ({ isVisible, ...props }) => {
  return (
    <AnimatePresence mode="wait">{isVisible && <AnimatedContainer {...props} />}</AnimatePresence>
  );
};
