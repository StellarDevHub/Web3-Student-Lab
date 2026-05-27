# Internationalization (i18n) Strategy for Web3 Student Lab

## Overview

This document outlines the comprehensive internationalization strategy for making the Web3 Student
Lab accessible to a global audience through multiple languages. The strategy focuses on scalability,
maintainability, and ease of contribution for translators.

## Recommended Library: next-intl

After evaluating various i18n solutions for Next.js, we recommend **next-intl** as our
internationalization library. Here's why:

### Why next-intl?

- **Next.js Native**: Built specifically for Next.js with full App Router support
- **Performance Optimized**: Works seamlessly with Server Components and static rendering
- **Type Safety**: Excellent TypeScript support with minimal configuration
- **Simplicity**: Clean API with minimal boilerplate
- **Flexibility**: Supports both static and dynamic message loading
- **Community**: Well-maintained with active community support

### Alternative Libraries Considered

- **next-i18next**: Feature-rich but complex setup, better for Pages Router
- **react-i18next**: Powerful but requires more configuration for Next.js App Router
- **Intlayer**: Newer option with interesting features but less mature ecosystem

## Implementation Architecture

### Directory Structure

```
frontend/
├── messages/
│   ├── en.json          # English (default)
│   ├── es.json          # Spanish
│   ├── fr.json          # French
│   ├── zh.json          # Chinese
│   └── ...
├── i18n/
│   └── request.ts       # Request configuration
├── src/app/
│   ├── [locale]/        # Dynamic locale routing
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── layout.tsx       # Root layout
└── next.config.ts       # Next.js configuration
```

### Core Components

#### 1. Message Files (`messages/`)

JSON files containing translations organized by namespaces:

```json
{
  "HomePage": {
    "title": "Web3 Student Lab",
    "description": "Learn blockchain development through hands-on projects",
    "getStarted": "Get Started"
  },
  "Navigation": {
    "home": "Home",
    "playground": "Playground",
    "simulator": "Simulator",
    "roadmap": "Roadmap"
  },
  "Common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "retry": "Retry"
  }
}
```

#### 2. Request Configuration (`i18n/request.ts`)

Handles locale detection and message loading:

```typescript
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../messages/${locale}.json`)).default,
}));
```

#### 3. Dynamic Routing (`src/app/[locale]/`)

Locale-based routing structure for SEO-friendly URLs.

#### 4. Provider Setup

Root layout wraps children with `NextIntlClientProvider`.

## Supported Languages

### Phase 1: Core Languages

- **English (en)** - Default/source language
- **Spanish (es)** - Large Spanish-speaking developer community
- **French (fr)** - Strong European Web3 presence
- **Chinese (zh)** - Major blockchain market

### Phase 2: Expansion

- **Japanese (ja)**
- **Korean (ko)**
- **German (de)**
- **Portuguese (pt)**

### Phase 3: Additional Languages

- **Russian (ru)**
- **Arabic (ar)**
- **Hindi (hi)**

## Translation Workflow for Contributors

### 1. Setup for Translators

#### Prerequisites

- Basic JSON knowledge
- Understanding of the Web3 domain (helpful but not required)
- GitHub account

#### Tools Provided

- **Translation Templates**: Empty JSON files with English keys
- **Validation Scripts**: Automated checks for missing translations
- **Preview Environment**: Staging site to preview translations

### 2. Translation Process

#### Step 1: Claim Language

- Create an issue in the repository announcing your intent to translate
- Include your language code and estimated completion time (max 2 days)

#### Step 2: Setup Local Environment

```bash
# Clone repository
git clone https://github.com/gracekenn/Web3-Student-Lab.git
cd Web3-Student-Lab/frontend

# Install dependencies
npm install

# Copy English template
cp messages/en.json messages/[your-locale].json
```

#### Step 3: Translate Content

- Open `messages/[your-locale].json`
- Translate all values while keeping keys unchanged
- Maintain JSON structure and formatting
- Preserve placeholders like `{variable}`

#### Step 4: Validate Translations

```bash
# Run validation script
npm run validate:i18n

# Test locally
npm run dev
```

#### Step 5: Submit Pull Request

- Create PR with descriptive title: `i18n: Add [Language] translations`
- Fill out translation checklist in PR description
- Request review from maintainers

### 3. Translation Guidelines

#### Best Practices

- **Maintain Tone**: Keep educational and encouraging tone
- **Web3 Terminology**: Use established translations for technical terms
- **Cultural Adaptation**: Adapt examples and references when appropriate
- **Consistency**: Use same terminology throughout all translations

#### What to Translate

- UI text and labels
- Error messages
- Navigation items
- Tutorial content
- Form placeholders

#### What NOT to Translate

- Code examples
- API endpoints
- Variable names
- Technical identifiers
- URLs and email addresses

### 4. Quality Assurance

#### Automated Checks

- JSON syntax validation
- Missing key detection
- Placeholder preservation
- Character encoding verification

#### Manual Review

- Language accuracy
- Cultural appropriateness
- Contextual relevance
- Technical terminology consistency

## Technical Implementation

### 1. Installation

```bash
npm install next-intl
```

### 2. Configuration Updates

#### `next.config.ts`

```typescript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig = {
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
```

#### `i18n/request.ts`

```typescript
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  const supportedLocales = ['en', 'es', 'fr', 'zh'];
  if (!supportedLocales.includes(locale)) {
    notFound();
  }

  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

#### `src/app/layout.tsx`

```typescript
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';

export default async function RootLayout({
  children,
  params: {locale}
}: {
  children: React.ReactNode;
  params: {locale: string};
}) {
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

### 3. Usage in Components

#### Server Components

```typescript
import {getTranslations} from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('HomePage');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
```

#### Client Components

```typescript
'use client';

import {useTranslations} from 'next-intl';

export default function InteractiveComponent() {
  const t = useTranslations('Common');

  return <button>{t('getStarted')}</button>;
}
```

### 4. Locale Detection

#### URL Structure

- `/en/playground` - English (default)
- `/es/playground` - Spanish
- `/fr/playground` - French

#### Automatic Detection

- Browser `Accept-Language` header
- User preference cookies
- Geographic location (fallback)

## Maintenance Strategy

### 1. Content Updates

#### New Features

1. Update English messages first
2. Mark new keys with `// NEW:` comment
3. Notify translators via GitHub issues
4. Track translation progress in project board

#### Content Changes

1. Update source messages in `en.json`
2. Use semantic versioning for breaking changes
3. Provide migration guides for translators
4. Deprecate old keys gracefully

### 2. Translation Management

#### Translation Completeness

- Dashboard showing translation progress per language
- Automated alerts for missing translations
- Weekly translation status reports

#### Quality Metrics

- Translation accuracy scores
- Community feedback integration
- Regular translation reviews

### 3. Performance Optimization

#### Message Loading

- Static generation for supported locales
- Dynamic loading for new languages
- Caching strategies for translation files

#### Bundle Size

- Tree-shaking unused translations
- Lazy loading message namespaces
- Compression of translation files

## Rollout Plan

### Phase 1: Foundation (Week 1-2)

- [ ] Set up next-intl infrastructure
- [ ] Create English message files
- [ ] Implement locale routing
- [ ] Add translation validation scripts

### Phase 2: Core Languages (Week 3-4)

- [ ] Translate to Spanish, French, Chinese
- [ ] Test language switching
- [ ] Implement locale detection
- [ ] Add language selector UI

### Phase 3: Expansion (Week 5-6)

- [ ] Add additional languages
- [ ] Optimize performance
- [ ] Create translator documentation
- [ ] Set up translation workflow

### Phase 4: Polish (Week 7-8)

- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Community onboarding

## Success Metrics

### Technical Metrics

- **Page Load Time**: < 2 seconds for all locales
- **Bundle Size**: < 100KB increase per language
- **Build Time**: < 5 minutes for all locales
- **Error Rate**: < 0.1% translation-related errors

### Community Metrics

- **Translation Coverage**: 100% for core languages
- **Contributor Growth**: 5+ active translators
- **Translation Quality**: 95%+ accuracy rating
- **User Engagement**: Increased international user base

## Resources

### Documentation

- [next-intl Official Docs](https://next-intl.dev/)
- [Next.js i18n Guide](https://nextjs.org/docs/app/guides/internationalization)
- [Web3 Terminology Guide](https://web3.glossary/)

### Tools

- **Translation Management**: GitHub Issues & Projects
- **Validation**: Custom npm scripts
- **Testing**: Jest + React Testing Library
- **Preview**: Vercel Preview Deployments

### Community

- **Discord**: Translation discussion channel
- **GitHub**: Translation issues and PRs
- **Documentation**: Contributor guides and templates

## Conclusion

This i18n strategy provides a solid foundation for making Web3 Student Lab accessible to a global
audience. By choosing next-intl and implementing a contributor-friendly workflow, we can build a
truly international platform while maintaining high code quality and performance standards.

The phased approach allows us to validate our assumptions and iterate based on community feedback,
ensuring we build a solution that serves both our users and contributors effectively.
