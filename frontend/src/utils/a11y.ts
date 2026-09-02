// WCAG 2.1 Color Contrast Checker Helper
export const getContrastRatio = (color1: string, color2: string): number => {
  // Implementation using tinycolor2 or similar
  return 4.5; // placeholder - implement properly
};

// Skip link component
export const SkipToContent = () => (
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only fixed top-4 left-4 bg-blue-600 text-white px-4 py-2 rounded z-50"
  >
    Skip to main content
  </a>
);
