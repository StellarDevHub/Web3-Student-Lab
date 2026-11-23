import { SkipToContent } from './utils/a11y';
import { useKeyboardNavigation } from './hooks/useAccessibility';

function MainLayout() {
  useKeyboardNavigation();

  return (
    <>
      <SkipToContent />
      <main id="main-content" tabIndex={-1}>
        {/* Your existing content */}
      </main>
    </>
  );
}
