// Animation design tokens for consistent, professional animations
export const ANIMATION_TOKENS = {
  // Durations (in seconds)
  durations: {
    instant: 0.1,
    micro: 0.15,
    short: 0.2,
    normal: 0.3,
    medium: 0.4,
    long: 0.6,
    entrance: 0.5,
    exit: 0.3,
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'easeIn',
    easeOut: 'easeOut',
    easeInOut: 'easeInOut',
    circIn: 'circIn',
    circOut: 'circOut',
    circInOut: 'circInOut',
    backIn: 'backIn',
    backOut: 'backOut',
    backInOut: 'backInOut',
    anticipate: 'anticipate',
  },

  // Standard transitions
  transitions: {
    button: {
      duration: 0.2,
      ease: 'easeOut',
    },
    hover: {
      duration: 0.2,
      ease: 'easeOut',
    },
    tap: {
      duration: 0.1,
      ease: 'easeOut',
    },
    entrance: {
      duration: 0.5,
      ease: 'easeOut',
    },
    exit: {
      duration: 0.3,
      ease: 'easeIn',
    },
    feedback: {
      duration: 0.3,
      ease: 'easeOut',
    },
    loading: {
      duration: 1.5,
      ease: 'linear',
    },
  },

  // Opacity values
  opacity: {
    disabled: 0.5,
    hover: 0.9,
    active: 1,
  },

  // Scale values
  scale: {
    hover: 1.02,
    active: 0.98,
    disabled: 1,
    exit: 0.95,
  },

  // Y-axis movement (for entrance/exit)
  y: {
    initial: 20,
    exit: -10,
  },
};

// Preset animation variants
export const ANIMATION_VARIANTS = {
  // Button interactions
  button: {
    initial: { scale: 1 },
    hover: { scale: ANIMATION_TOKENS.scale.hover },
    tap: { scale: ANIMATION_TOKENS.scale.active },
  },

  // Container entrances
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },

  slideInUp: {
    initial: { opacity: 0, y: ANIMATION_TOKENS.y.initial },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: ANIMATION_TOKENS.y.exit },
  },

  slideInDown: {
    initial: { opacity: 0, y: -ANIMATION_TOKENS.y.initial },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -ANIMATION_TOKENS.y.exit },
  },

  slideInLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },

  slideInRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },

  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },

  // Staggered children
  stagger: {
    container: {
      initial: 'initial',
      animate: 'animate',
      exit: 'exit',
    },
    item: {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 10 },
    },
  },

  // Loading animations
  pulse: {
    initial: { opacity: 0.6 },
    animate: { opacity: 1 },
  },

  spin: {
    animate: { rotate: 360 },
  },

  bounce: {
    animate: { y: [0, -10, 0] },
  },

  // Success/Failure feedback
  checkmark: {
    initial: { scale: 0, rotate: -45 },
    animate: { scale: 1, rotate: 0 },
  },

  errorShake: {
    animate: { x: [-10, 10, -10, 10, 0] },
  },

  successBounce: {
    animate: { y: [0, -5, 0], scale: [1, 1.05, 1] },
  },
};
