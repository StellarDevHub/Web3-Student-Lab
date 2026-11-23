import { useEffect } from 'react';

export const useKeyboardNavigation = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close modals, dropdowns, etc.
        document.querySelectorAll('[data-esc-close]').forEach(el => {
          (el as HTMLElement).click();
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
