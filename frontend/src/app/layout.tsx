import { QueryProvider } from '@/lib/query/QueryProvider';
import { KeyboardShortcutsProvider } from '@/components/keyboard/KeyboardShortcutsProvider';
import Navbar from '@/components/layout/Navbar';
import {
  DeferredCommandPalette,
  DeferredOfflineNotification,
  DeferredRenderWarningModal,
} from '@/components/layout/DeferredLayoutWidgets';
import ResiliencyBanner from '@/components/layout/ResiliencyBanner';
import WalletGate from '@/components/layout/WalletGate';
import { CourseNotificationListener, ToastContainer } from '@/components/notifications';
import { OfflineSyncHandler } from '@/components/OfflineSyncHandler';
import { SkipLink } from '@/components/ui/SkipLink';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { Providers as ThemeProvider } from '@/lib/theme/providers';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { Web3OnboardingProvider } from '@/contexts/Web3OnboardingContext';
import { I18nProvider } from '@/i18n';
import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

// Self-hosted at build time: no render-blocking Google Fonts stylesheet or
// extra origin connections on the critical path (FE-050 / LCP).
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Web3 Student Lab',
  description:
    'An open-source educational platform for blockchain, smart contracts, open-source collaboration, and hackathon project development.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${outfit.variable} overflow-x-hidden`}
    >
      <body className="bg-background text-foreground min-h-screen antialiased overflow-x-hidden" suppressHydrationWarning>
        <QueryProvider>
          <ThemeProvider>
          <WalletProvider>
            <AuthProvider>
              <I18nProvider>
                <NotificationProvider>
                  <CourseNotificationListener />
                  <Web3OnboardingProvider>
                    <KeyboardShortcutsProvider>
                      <TutorialProvider>
                        <SkipLink
                          targets={[
                            { id: 'main-content', label: 'Skip to main content' },
                            { id: 'primary-navigation', label: 'Skip to navigation' },
                          ]}
                        />
                        <Navbar />
                        <ResiliencyBanner />
                        <DeferredRenderWarningModal />
                        <OfflineSyncHandler />
                        <main id="main-content" className="flex-grow outline-none" tabIndex={-1}>
                          <WalletGate>{children}</WalletGate>
                        </main>
                        <ToastContainer />
                        <DeferredCommandPalette />
                        <DeferredOfflineNotification />
                      </TutorialProvider>
                    </KeyboardShortcutsProvider>
                  </Web3OnboardingProvider>
                </NotificationProvider>
              </I18nProvider>
            </AuthProvider>
          </WalletProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
export const dynamic = 'force-dynamic';
