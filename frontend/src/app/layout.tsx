import { QueryProvider } from '@/lib/query/QueryProvider';
import { KeyboardShortcutsProvider } from '@/components/keyboard/KeyboardShortcutsProvider';
import Navbar from '@/components/layout/Navbar';
import {
  DeferredCommandPalette,
  DeferredCourseNotificationListener,
  DeferredOfflineNotification,
  DeferredRenderWarningModal,
} from '@/components/layout/DeferredLayoutWidgets';
import ResiliencyBanner from '@/components/layout/ResiliencyBanner';
import WalletGate from '@/components/layout/WalletGate';
// Direct module import (not the notifications barrel) so unrelated exports
// are not pulled into the root layout bundle (FE-076).
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { OfflineSyncHandler } from '@/components/OfflineSyncHandler';
import { SkipLink } from '@/components/ui/SkipLink';
import { TelemetryContextBridge } from '@/components/telemetry/TelemetryContextBridge';
import { AuthProvider } from '@/contexts/AuthContext';
import { CSPNonceProvider } from '@/contexts/CSPNonceContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { Providers as ThemeProvider } from '@/lib/theme/providers';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { Web3OnboardingProvider } from '@/contexts/Web3OnboardingContext';
import { I18nProvider, type Locale, getDir } from '@/i18n';
import { WebVitalsReporter } from '@/lib/telemetry/WebVitalsReporter';
import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { SocketWorkerProvider } from './providers';
import './globals.css';

/** RTL locale BCP-47 tags used to detect direction from Accept-Language. */
const RTL_LANG_PREFIXES = ['ar', 'he', 'fa'];

/**
 * Determine the visitor's locale at request time (server-side) so we can set
 * the correct `lang` and `dir` attributes before the first paint, avoiding a
 * direction flash on RTL languages.
 *
 * Priority: `app:locale` cookie → `Accept-Language` header → 'en'.
 */
function resolveServerLocale(): { locale: Locale; dir: 'ltr' | 'rtl'; langTag: string } {
  const localeTagMap: Record<Locale, string> = {
    en: 'en-US', es: 'es-ES', zh: 'zh-CN', ar: 'ar-SA', he: 'he-IL', fa: 'fa-IR',
  };
  const validLocales = new Set<Locale>(['en', 'es', 'zh', 'ar', 'he', 'fa']);

  let locale: Locale = 'en';

  try {
    const cookieStore = cookies();
    const cookieVal = cookieStore.get('app:locale')?.value;
    if (cookieVal && validLocales.has(cookieVal as Locale)) {
      locale = cookieVal as Locale;
    } else {
      const headerStore = headers();
      const acceptLang = headerStore.get('accept-language') ?? '';
      const primary = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (primary.startsWith('ar')) locale = 'ar';
      else if (primary.startsWith('he')) locale = 'he';
      else if (primary.startsWith('fa')) locale = 'fa';
      else if (primary.startsWith('es')) locale = 'es';
      else if (primary.startsWith('zh')) locale = 'zh';
    }
  } catch {
    // During static generation cookies/headers are unavailable; fall back to 'en'.
  }

  const dir = RTL_LANG_PREFIXES.some((p) => locale.startsWith(p)) ? 'rtl' : 'ltr';
  return { locale, dir, langTag: localeTagMap[locale] };
}

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { langTag, dir } = resolveServerLocale();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang={langTag}
      dir={dir}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${outfit.variable} overflow-x-hidden`}
    >
      {/* Render-blocking inline script: sets data-theme before paint to
      eliminate FOUC. Runs before React hydration. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var k='web3-lab-theme';var t=localStorage.getItem(k);var d='dark';if(t==='light'||t==='dark'||t==='oled'){d=t;}else if(t==='system'||!t){try{d=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(e){}}document.documentElement.setAttribute('data-theme',d);document.documentElement.classList.add(d);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
        }}
      />
      <body className="bg-background text-foreground min-h-screen antialiased overflow-x-hidden" suppressHydrationWarning>
        <CSPNonceProvider nonce={nonce}>
        <QueryProvider>
          <SocketWorkerProvider>
            <ThemeProvider>
              <WebVitalsReporter />
          <WalletProvider>
            <TelemetryContextBridge />
            <AuthProvider>
              <I18nProvider>
                <NotificationProvider>
                  <DeferredCourseNotificationListener />
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
          </SocketWorkerProvider>
        </QueryProvider>
        </CSPNonceProvider>

      </body>
    </html>
  );
}
