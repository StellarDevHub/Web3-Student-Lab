import { CommandPalette } from '@/components/common/CommandPalette';
import { KeyboardShortcutsProvider } from '@/components/keyboard/KeyboardShortcutsProvider';
import Navbar from '@/components/layout/Navbar';
import RenderWarningModal from '@/components/layout/RenderWarningModal';
import ResiliencyBanner from '@/components/layout/ResiliencyBanner';
import WalletGate from '@/components/layout/WalletGate';
import { OfflineNotification, CourseNotificationListener, ToastContainer } from '@/components/notifications';
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
import './globals.css';

export const metadata: Metadata = {
  title: 'Web3 Student Lab',
  description:
    'An open-source educational platform for blockchain, smart contracts, open-source collaboration, and hackathon project development.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased" suppressHydrationWarning>
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
                        <RenderWarningModal />
                        <OfflineSyncHandler />
                        <main id="main-content" className="flex-grow outline-none" tabIndex={-1}>
                          <WalletGate>{children}</WalletGate>
                        </main>
                        <ToastContainer />
                        <CommandPalette />
                        <OfflineNotification />
                      </TutorialProvider>
                    </KeyboardShortcutsProvider>
                  </Web3OnboardingProvider>
                </NotificationProvider>
              </I18nProvider>
            </AuthProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
export const dynamic = 'force-dynamic';
