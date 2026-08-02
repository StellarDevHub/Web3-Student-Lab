import { KeyboardShortcutsProvider } from '@/components/keyboard/KeyboardShortcutsProvider';
import Navbar from '@/components/layout/Navbar';
import RenderWarningModal from '@/components/layout/RenderWarningModal';
import ResiliencyBanner from '@/components/layout/ResiliencyBanner';
import WalletGate from '@/components/layout/WalletGate';
import { OfflineNotification, ToastContainer } from '@/components/notifications';
import { OfflineSyncHandler } from '@/components/OfflineSyncHandler';
import { SkipLink } from '@/components/ui/SkipLink';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
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
        <script
          nonce="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('web3-lab-theme');
                  var isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <ThemeProvider>
          <WalletProvider>
            <AuthProvider>
              <I18nProvider>
                <NotificationProvider>
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
