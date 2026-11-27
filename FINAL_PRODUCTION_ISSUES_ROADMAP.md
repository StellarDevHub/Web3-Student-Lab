# Web3 Student Lab: Final Stage 150 Production Deployment Engineering Issues

This comprehensive roadmap defines the **150 final production-grade, advanced engineering issues** structured to take **Web3 Student Lab** to full mainnet launch. Following the previous issue pattern, each issue provides an exact Problem Statement, Technical Specification, Files Involved, and strict Acceptance Criteria.

The issues are partitioned into three core disciplines:

- **Part 1: Frontend Architecture, Modernization & Performance (FE-051 to FE-100)**
- **Part 2: Backend Infrastructure, Security & Scalability (BE-051 to BE-100)**
- **Part 3: Soroban Smart Contracts, Formal Invariants & Protocol Security (SC-051 to SC-100)**

---

# Part 1: Frontend Architecture, Modernization & Performance

### FE-051: Next.js 16 Route Handler Async Context Migration (`params` Promise Re-architecture)

- **Category:** Architecture & Framework Compatibility
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Next.js 16 fundamentally converts dynamic route context `params` into asynchronous Promises (`Promise<{ id: string }>`). Multiple route handlers in `src/app/api/og/certificates/[id]/route.tsx` and `src/app/api/og/certificate/[id]/route.ts` access `params.id` synchronously, causing fatal TypeScript constraint failures (`TS2344`) and runtime 500 errors during OpenGraph card generation.
- **Specification:** Refactor all dynamic API route handlers and server page components to properly await `context.params` using `const { id } = await params;`. Ensure strict type conformance against Next.js 16 `RouteHandlerConfig` interfaces across all dynamic API routes.
- **Files Involved:** `frontend/src/app/api/og/certificates/[id]/route.tsx`, `frontend/src/app/api/og/certificate/[id]/route.ts`, `frontend/src/app/api/v1/certificates/student/[id]/route.ts`
- **Acceptance Criteria:**
  - [ ] All dynamic route handlers await `params` according to Next.js 16 App Router standards.
  - [ ] `tsc --noEmit` validates all route handler parameters with zero type errors.
  - [ ] Dynamic OG certificate image generation returns HTTP 200 with valid SVG/PNG previews.

---

### FE-052: Removal of `ignoreBuildErrors: true` & Strict Zero-Warning Compiler Baseline

- **Category:** Build & Type Safety
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `frontend/next.config.ts` currently sets `typescript: { ignoreBuildErrors: true }`, masking hundreds of active TypeScript type violations, incorrect component prop signatures, and runtime regressions during production deployment.
- **Specification:** Delete `ignoreBuildErrors: true` from `frontend/next.config.ts`. Reconcile every broken type signature across state stores, context providers, API clients, and React components until `next build` passes with zero type errors under strict type checking.
- **Files Involved:** `frontend/next.config.ts`, `frontend/src/stores/middleware.ts`, `frontend/src/lib/api.ts`
- **Acceptance Criteria:**
  - [ ] `ignoreBuildErrors` is completely removed from `next.config.ts`.
  - [ ] `pnpm build` executes typechecking natively and succeeds with exit code 0.
  - [ ] CI/CD pipeline enforces `pnpm tsc --noEmit` as a non-bypassable pre-deployment gate.

---

### FE-053: TypeScript Target Upgrade from ES5 to ES2022 & BigInt Downlevel Modernization

- **Category:** Compiler Configuration & Performance
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/tsconfig.json` specifies `"target": "es5"`, which conflicts with modern Web3 BigInt arithmetic (`10n`), causing downlevel iteration errors (`TS2802`) and syntax rejections (`TS2737`) in files such as `src/lib/xdr-inspector.ts` and `e2e/tests/responsive.spec.ts`.
- **Specification:** Upgrade `target` to `"ES2022"` and `moduleResolution` to `"bundler"` in `frontend/tsconfig.json`. Ensure native support for BigInt literals, top-level await, private class fields, and modern array iterators without bloating the client bundle with obsolete polyfills.
- **Files Involved:** `frontend/tsconfig.json`, `frontend/src/lib/xdr-inspector.ts`, `frontend/e2e/tests/responsive.spec.ts`
- **Acceptance Criteria:**
  - [ ] `"target": "ES2022"` configured in `frontend/tsconfig.json`.
  - [ ] Native BigInt literals (`0n`, `10n ** 7n`) compile without downlevel warnings or transpilation bloat.
  - [ ] Bundle footprint decreases due to removal of obsolete ES5 prototype polyfills.

---

### FE-054: ESLint 9 Flat-Config (`eslint.config.mjs`) Migration & Deprecated CLI Flag Elimination

- **Category:** Tooling & Code Quality
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Running `npm run lint` in `frontend` crashes with `ESLint: 9.x couldn't find an eslint.config.(js|mjs|cjs) file` because ESLint 9 removed support for legacy `.eslintrc` files and deprecated the `--ext` CLI argument used in `package.json`.
- **Specification:** Author an `eslint.config.mjs` flat-configuration file using `@eslint/js`, `typescript-eslint`, and `eslint-plugin-react-hooks`. Update `package.json` lint scripts to invoke `eslint .` without deprecated `--ext` arguments.
- **Files Involved:** `frontend/eslint.config.mjs`, `frontend/package.json`, `package.json`
- **Acceptance Criteria:**
  - [ ] `pnpm run lint` executes cleanly without deprecation warnings or missing config crashes.
  - [ ] Flat-config correctly scopes TypeScript, TSX, and worker files.
  - [ ] Pre-commit hook `lint-staged` passes successfully on staged frontend files.

---

### FE-055: React 19 Synthetic Event & CJS/ESM Interop Normalization (React-Joyride & Third-Party)

- **Category:** React 19 Migration
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Vitest unit test suite exhibits 163 failing tests (e.g. `TutorialWalkthrough.test.tsx`), failing with `Error: Element type is invalid: expected a string or class/function but got: object` due to React 19 breaking changes with CommonJS default exports in third-party libraries like `react-joyride`.
- **Specification:** Implement a dynamic ESM compatibility wrapper for `react-joyride` and other legacy React 18 UI components. Normalize interop exports to ensure consistent functional component resolution across SSR, client hydration, and Vitest testing environments.
- **Files Involved:** `frontend/src/components/tutorials/TutorialWalkthrough.tsx`, `frontend/src/components/onboarding/CodeTour.tsx`, `frontend/vitest.setup.ts`
- **Acceptance Criteria:**
  - [ ] `TutorialWalkthrough` mounts and renders cleanly under React 19 without object-as-element errors.
  - [ ] All 163 failing UI unit tests in `vitest` pass successfully.
  - [ ] Interactive onboarding tour guides users through steps without unhandled DOM exceptions.

---

### FE-056: Monaco Editor Instance Isolation & Command ID Collision Elimination in Vitest

- **Category:** Testing Infrastructure & IDE
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Running frontend test suites concurrently causes Vitest crashes with `Error: Cannot register two commands with the same id: diffEditor.toggleCollapseUnchangedRegions` because Monaco Editor extensions are repeatedly registered globally in the Node/JSDOM runtime without teardown.
- **Specification:** Build a centralized Vitest mock and teardown fixture for Monaco Editor services. Stub `monaco.editor.registerAction2` and command registries in `vitest.setup.ts`, ensuring isolated test environments for code editor test suites.
- **Files Involved:** `frontend/vitest.setup.ts`, `frontend/src/lib/editor/__tests__/SorobanCompletion.test.ts`, `frontend/src/lib/editor/__tests__/SorobanLanguage.test.ts`
- **Acceptance Criteria:**
  - [ ] Editor test suites execute concurrently without command registration collisions.
  - [ ] Monaco completion and syntax highlighting logic is validated deterministically in tests.
  - [ ] `pnpm test` executes cleanly without global state leaks across test workers.

---

### FE-057: App Router Clean Exports Refactor: Extraction of `safeDecodeScVal` and XDR Utilities

- **Category:** Next.js Architecture
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/app/network-streamer/page.tsx` exports `export function safeDecodeScVal(...)`. Next.js App Router enforces that page files must only export default components and recognized metadata configs, triggering Next.js type check errors.
- **Specification:** Extract `safeDecodeScVal` and all associated Soroban XDR deserialization functions into a dedicated library `frontend/src/lib/stellar/xdr-stream.ts`. Update `page.tsx` and `network-streamer.test.tsx` to import from the modular utility library.
- **Files Involved:** `frontend/src/app/network-streamer/page.tsx`, `frontend/src/lib/stellar/xdr-stream.ts`, `frontend/src/app/network-streamer/network-streamer.test.tsx`
- **Acceptance Criteria:**
  - [ ] `page.tsx` only exports default component and metadata.
  - [ ] `xdr-stream.ts` provides complete unit-tested decoding for ScVal integers, symbols, addresses, and maps.
  - [ ] Next.js validator passes without index signature violations.

---

### FE-058: Elimination of Undefined References in Asset Management & Brainstorming Modules

- **Category:** Bug Fix & UI Stability
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/app/asset-management/components/OwnershipTransferModal.tsx` uses `<AlertCircle />` without importing it, and `frontend/src/app/brainstorm/page.tsx` attempts to fetch `${apiUrl}/canvas` where `apiUrl` is undeclared, resulting in runtime `ReferenceError` crashes.
- **Specification:** Import `AlertCircle` from `lucide-react` in `OwnershipTransferModal.tsx`. In `brainstorm/page.tsx`, replace the undefined `apiUrl` reference with `getApiEndpoint('/canvas')` using the validated runtime environment utility.
- **Files Involved:** `frontend/src/app/asset-management/components/OwnershipTransferModal.tsx`, `frontend/src/app/brainstorm/page.tsx`
- **Acceptance Criteria:**
  - [ ] Opening `OwnershipTransferModal` and triggering input validation displays the alert icon without error.
  - [ ] Creating a new brainstorming canvas initializes correctly via `getApiEndpoint('/canvas')`.
  - [ ] Zero unhandled `ReferenceError` exceptions in browser console.

---

### FE-059: AuthContext Interface Alignment: Multi-Argument Token Passing & Turnstile Signatures

- **Category:** Authentication & State Management
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `src/app/auth/login/page.tsx` and `src/app/auth/register/page.tsx`, login and registration invocations pass a Cloudflare Turnstile token (`turnstileToken`). However, `AuthContextType` interface in `AuthContext.tsx` only declares 2 arguments for `login` and 4 for `register`, causing compilation errors `TS2554`.
- **Specification:** Update `AuthContextType` interface in `frontend/src/contexts/AuthContext.tsx` to reflect the optional `turnstileToken?: string` parameter for both `login` and `register` methods, keeping the interface in exact sync with the underlying service implementation.
- **Files Involved:** `frontend/src/contexts/AuthContext.tsx`, `frontend/src/app/auth/login/page.tsx`, `frontend/src/app/auth/register/page.tsx`
- **Acceptance Criteria:**
  - [ ] `AuthContextType` interface explicitly includes `turnstileToken?: string`.
  - [ ] `login` and `register` call sites pass TypeScript compilation without argument mismatch errors.
  - [ ] Turnstile verification token is forwarded to the backend authentication API.

---

### FE-060: Certificate Interface Unification: Resolution of Missing `contractAddress`

- **Category:** Data Models & Type Safety
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/app/certificates/[id]/page.tsx` accesses `certificate.contractAddress`, but the `Certificate` interface in `frontend/src/lib/api.ts` does not declare `contractAddress`, causing `TS2339` compiler errors and rendering fallback placeholder addresses.
- **Specification:** Reconcile the `Certificate` interfaces across `frontend/src/lib/api.ts` and `frontend/src/hooks/useCertificates.ts`. Add `contractAddress?: string` and ensure the backend API serializes the canonical deployed Soroban certificate contract ID on every response.
- **Files Involved:** `frontend/src/lib/api.ts`, `frontend/src/hooks/useCertificates.ts`, `frontend/src/app/certificates/[id]/page.tsx`
- **Acceptance Criteria:**
  - [ ] `Certificate` interface declares `contractAddress?: string`.
  - [ ] Certificate view page displays the verified on-chain contract address with an external block explorer link.
  - [ ] TypeScript compilation passes with zero property access errors.

---

### FE-061: Modern Edge Middleware Migration: Deprecated `NextRequest.ip` / `NextRequest.geo` to Headers

- **Category:** Edge Middleware & Security
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `frontend/src/middleware.ts`, accessing `request.ip` and `request.geo` triggers deprecation warnings and type errors because Next.js removed these properties from `NextRequest` in recent releases.
- **Specification:** Replace `request.ip` with header extraction: `request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'`. Replace `request.geo?.country` with `request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry')`.
- **Files Involved:** `frontend/src/middleware.ts`
- **Acceptance Criteria:**
  - [ ] Middleware extracts client IP and country code reliably without accessing deprecated properties.
  - [ ] TypeScript compiles `middleware.ts` without property missing errors.
  - [ ] Geo-fencing and IP allowlisting operate deterministically on edge deployments.

---

### FE-062: SEO-Safe Crawler Classification & Anti-Scraper Refinement in Edge Middleware

- **Category:** SEO & Traffic Routing
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/middleware.ts` contains an aggressive bot filter `isBot(userAgent)` that matches any user agent containing `"bot"`. This returns HTTP 403 to legitimate search engine crawlers (Googlebot, Bingbot, Twitterbot, LinkedInBot), blocking public course indexing and OpenGraph scrapers.
- **Specification:** Maintain a verified crawler allowlist (Googlebot, Bingbot, DuckDuckBot, Twitterbot, etc.). Allow legitimate crawlers read-only access to public routes (`/`, `/courses`, `/blog`, `/certificates/verify/*`) while enforcing strict rate limiting and challenge verification only on suspicious headless scrapers and mutating endpoints.
- **Files Involved:** `frontend/src/middleware.ts`, `frontend/src/lib/security/botDetection.ts`
- **Acceptance Criteria:**
  - [ ] Verified search engine crawlers receive HTTP 200 on public indexing pages.
  - [ ] Social media card preview scrapers can fetch OG meta tags and certificate images.
  - [ ] Malicious headless automated scrapers are rejected with HTTP 403 or challenged.

---

### FE-063: Distributed Rate-Limiting via Upstash Redis in Edge Middleware

- **Category:** Edge Infrastructure & DDoS Defense
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `frontend/src/middleware.ts` uses an in-memory `Map<string, { count: number; resetTime: number }>` for rate limiting. In a serverless/edge deployment, memory is reset on cold starts and not shared across edge regions, making rate limiting ineffective and leaking memory in long-running instances.
- **Specification:** Integrate `@upstash/ratelimit` with `@upstash/redis` in Next.js Edge Middleware. Implement a sliding-window rate limiter keyed by client IP and authenticated student ID, falling back to permissive bypass if Redis is unreachable.
- **Files Involved:** `frontend/src/middleware.ts`, `frontend/src/lib/security/edgeRateLimit.ts`
- **Acceptance Criteria:**
  - [ ] Rate limits are enforced globally across edge nodes via distributed Redis counters.
  - [ ] Bursts exceeding 100 req/min return HTTP 429 with `Retry-After` headers.
  - [ ] Edge cold starts do not reset user rate limit quotas.

---

### FE-064: Environment Variable Validation Parity: Reconciliation of Fallback Render URLs

- **Category:** Configuration & Testing
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/lib/__tests__/env.test.ts` fails because `src/lib/env.ts` defaults `rawApiUrl` to `FALLBACK_RENDER_API_URL` in production when unset, while the unit test asserts that missing production environment variables return an empty string and report errors.
- **Specification:** Reconcile `frontend/src/lib/env.ts` validation logic: when in production mode, if `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_WS_URL` is missing, record validation errors and return empty strings rather than silently injecting hardcoded third-party URLs. Update test assertions for consistent behavior.
- **Files Involved:** `frontend/src/lib/env.ts`, `frontend/src/lib/__tests__/env.test.ts`
- **Acceptance Criteria:**
  - [ ] Missing required production variables are flagged with explicit error diagnostics.
  - [ ] All 15 unit tests in `src/lib/__tests__/env.test.ts` pass cleanly.
  - [ ] Production build halts with actionable errors if required API endpoints are unconfigured.

---

### FE-065: WebAssembly Simulation Engine Memory Leak Prevention & Worker Lifecycle Management

- **Category:** WebAssembly & Performance
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Repeatedly running interactive Soroban contract simulations in the playground spawns WebAssembly instances and Web Workers that fail to release linear memory buffers, consuming gigabytes of browser RAM and crashing mobile tabs.
- **Specification:** Implement a strict lifecycle manager in `src/lib/compiler/compile.worker.ts` and `src/hooks/usePlaygroundExecution.ts`. Explicitly invoke `worker.terminate()`, deallocate `WebAssembly.Memory` buffers, and enforce a maximum resident memory threshold of 50MB per execution session.
- **Files Involved:** `frontend/src/lib/compiler/compile.worker.ts`, `frontend/src/hooks/usePlaygroundExecution.ts`, `frontend/src/services/stellar/simulator.ts`
- **Acceptance Criteria:**
  - [ ] Memory footprint stabilizes below 100MB even after 50 consecutive contract simulation runs.
  - [ ] Workers terminate cleanly when navigating away from the playground route.
  - [ ] Out-of-memory errors in guest WASM modules are caught and surfaced as user-friendly diagnostics.

---

### FE-066: Next.js 16 Partial Prerendering (PPR) Streaming for Dynamic Course Progress

- **Category:** Performance & Rendering
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Course detail and lesson pages require dynamic enrollment and progress checks, causing full-page server render delays and degrading Core Web Vitals (LCP > 3.5s).
- **Specification:** Enable Next.js 16 Partial Prerendering (`ppr: true`). Statically prerender course curriculum markdown, navigation outlines, and header templates, while wrapping student progress, enrollment buttons, and completion badges inside React 19 `<Suspense>` streaming boundaries.
- **Files Involved:** `frontend/next.config.ts`, `frontend/src/app/courses/[id]/page.tsx`, `frontend/src/components/curriculum/LessonReader.tsx`
- **Acceptance Criteria:**
  - [ ] Initial static shell renders with TTFB < 50ms from edge CDN cache.
  - [ ] Dynamic user enrollment and lesson completion state streams in without layout shift (CLS < 0.02).
  - [ ] Largest Contentful Paint (LCP) drops below 1.5s on mobile connections.

---

### FE-067: Stellar Wallets Kit Re-connection Optimization & Hardware Wallet Polling

- **Category:** Web3 Integration
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** When using Ledger hardware wallets via WebUSB/WebHID or switching between Freighter and xBull, connection drops occur when the browser tab goes into background, requiring manual refresh.
- **Specification:** Enhance `frontend/src/hooks/useHardwareWallet.ts` and `frontend/src/contexts/Web3OnboardingContext.tsx` with visibility change listeners. When the tab regains focus, perform a silent heartbeat ping to the hardware wallet or extension provider without triggering user prompts.
- **Files Involved:** `frontend/src/hooks/useHardwareWallet.ts`, `frontend/src/contexts/Web3OnboardingContext.tsx`, `frontend/src/components/wallet/BalanceViewer.tsx`
- **Acceptance Criteria:**
  - [ ] Backgrounding and foregrounding the tab maintains active wallet session state.
  - [ ] Disconnected hardware wallets prompt a subtle reconnect pill rather than throwing unhandled exceptions.
  - [ ] Ledger transport switching between WebUSB and WebHID operates reliably across Chrome and Brave.

---

### FE-068: Zero-Runtime CSS Dynamic Theming Extraction (Tailwind CSS v4 Engine Compatibility)

- **Category:** UI Styling & Design Systems
- **Difficulty:** Medium | **Priority:** Medium | **ETA:** 1 Day
- **Problem Statement:** Dark/light mode theme toggling causes flash of unstyled content (FOUC) and recalibration jank due to dynamic inline CSS style injections in `ThemeToggle.tsx` and `themeColors.ts`.
- **Specification:** Refactor theme token variables to native CSS custom properties defined in `frontend/src/app/globals.css`. Use CSS `color-scheme` and class-based attributes (`data-theme="dark"`) loaded via a render-blocking inline script in `app/layout.tsx` to eliminate FOUC.
- **Files Involved:** `frontend/src/components/theme/ThemeToggle.tsx`, `frontend/src/lib/theme/themeColors.ts`, `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`
- **Acceptance Criteria:**
  - [ ] Zero theme flash (FOUC) on hard reload in dark mode.
  - [ ] Theme switching transitions smoothly in < 16ms without dropping frames.
  - [ ] High-contrast accessibility theme passes WCAG 2.1 AA color contrast standards.

---

### FE-069: Off-Chain Certificate PDF Verification & In-Browser Ed25519 Cryptographic Validator

- **Category:** Cryptography & Verification
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Students downloading PDF diplomas have no client-side mechanism to verify the diploma's digital authenticity without transmitting the file back to the server.
- **Specification:** Build an in-browser PDF signature verifier in `frontend/src/app/verify/page.tsx`. Extract embedded cryptographic metadata (`X-Certificate-Signature`, `X-Certificate-Public-Key`, and PDF content hash) using `pdf-lib` and verify the Ed25519 signature entirely in the browser using the Web Cryptography API (`SubtleCrypto`).
- **Files Involved:** `frontend/src/app/verify/page.tsx`, `frontend/src/lib/crypto/pdfVerifier.ts`, `frontend/src/components/certificates/VerificationBadge.tsx`
- **Acceptance Criteria:**
  - [ ] Dragging and dropping an issued PDF diploma validates authenticity client-side in < 200ms.
  - [ ] Displays green "Cryptographically Verified by Web3 Student Lab" badge with issuer public key.
  - [ ] Tampered PDF files immediately display a red alert indicating hash mismatch or signature invalidity.

---

### FE-070: Offline-First IndexedDB Local State Synchronization with Vector Clock Resolution

- **Category:** Offline & PWA
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Students in regions with unstable connectivity lose interactive lesson code edits and quiz submissions when the network drops.
- **Specification:** Implement an offline-first storage engine using `idb` (IndexedDB) in `src/lib/storage/SyncManager.ts`. Track code editor mutations using Lamport timestamps / Vector Clocks. When connection restores, execute a two-way sync against the backend with automated conflict resolution.
- **Files Involved:** `frontend/src/lib/storage/SyncManager.ts`, `frontend/src/hooks/useOfflineSync.ts`, `frontend/src/components/common/OfflineBanner.tsx`
- **Acceptance Criteria:**
  - [ ] All code modifications and exercise drafts persist across browser restarts while offline.
  - [ ] Regaining network connectivity triggers automatic background synchronization.
  - [ ] Conflicting multi-device edits surface an interactive side-by-side diff conflict modal.

---

### FE-071: Client-Side WASM Contract Memory Profiler with Flamegraph & Heap Visualization

- **Category:** Developer Tooling & IDE
- **Difficulty:** Advanced | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Students optimizing Soroban contracts have no visibility into memory allocations, resulting in contracts exceeding Soroban's strict 50MB execution memory limit.
- **Specification:** Build a client-side WASM memory profiler in `frontend/src/app/wasm-analyzer/page.tsx`. Parse compiled `.wasm` binary sections using `wabt` and D3.js to render interactive Sunburst diagrams and Flamegraphs showing data section size, stack allocations, and linear memory growth over execution steps.
- **Files Involved:** `frontend/src/app/wasm-analyzer/page.tsx`, `frontend/src/lib/wasmAnalyzer.ts`, `frontend/src/components/visualizer/MemoryFlamegraph.tsx`
- **Acceptance Criteria:**
  - [ ] Generates interactive visual memory breakdown of custom compiled Soroban WASM modules.
  - [ ] Highlights memory hotspots and warns if data section exceeds recommended gas budgets.
  - [ ] Exports profiling reports as SVG or JSON diagnostic snapshots.

---

### FE-072: Microfrontend Isolation Sandbox for Untrusted Community Course Widgets

- **Category:** Security & Architecture
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Permitting community instructors to author interactive course widgets poses XSS and wallet theft risks if third-party scripts access `window.stellar` or `localStorage`.
- **Specification:** Implement a hardened microfrontend sandbox component in `frontend/src/app/microfrontends/page.tsx`. Host external course widgets inside an isolated iframe configured with `sandbox="allow-scripts"` (omitting `allow-same-origin`). Relay data via a typed `postMessage` RPC protocol with strict schema validation.
- **Files Involved:** `frontend/src/app/microfrontends/page.tsx`, `frontend/src/lib/mfe/WidgetSandbox.tsx`, `frontend/src/lib/mfe/sandboxProtocol.ts`
- **Acceptance Criteria:**
  - [ ] Sandboxed widgets cannot access parent `localStorage`, cookies, or injected wallet providers.
  - [ ] Communication is restricted to authorized bidirectional RPC messages.
  - [ ] Malicious script attempts to escape the sandbox trigger security alerts and render-boundary isolation.

---

### FE-073: Content Security Policy (CSP) Nonce-Based Strict Enforcement & Violation Auto-Reporting

- **Category:** Security & Compliance
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** In `frontend/src/lib/security/csp-config.ts`, inline script rules use `'unsafe-inline'`, exposing the application to cross-site scripting vulnerabilities in user-generated markdown forums and code reviews.
- **Specification:** Implement dynamic cryptographic nonce generation per request in `src/middleware.ts`. Inject `nonce-{random}` into the `Content-Security-Policy` header, pass the nonce to Next.js `<Script>` components, and set `report-uri /api/security/csp-report`.
- **Files Involved:** `frontend/src/middleware.ts`, `frontend/src/lib/security/csp-config.ts`, `frontend/src/app/layout.tsx`
- **Acceptance Criteria:**
  - [ ] Removes `'unsafe-inline'` from `script-src` in production.
  - [ ] All Next.js scripts load with matching valid cryptographic nonces.
  - [ ] Any injected unauthorized inline scripts are blocked and logged via CSP reporting endpoint.

---

### FE-074: WebRTC Data Channel Audio/Screen-Sharing Encryption Key Agreement with Ed25519

- **Category:** Real-Time Collaboration
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Mentor-student pairing sessions in `frontend/src/app/webrtc/page.tsx` use WebRTC without authenticating peer identity, allowing man-in-the-middle attacks on collaborative audio and whiteboard data streams.
- **Specification:** Implement an authenticated Diffie-Hellman / WebRTC key agreement protocol in `src/lib/p2p-crypto.ts`. Exchange ephemeral ECDH public keys signed by each participant's Stellar Ed25519 wallet key before opening WebRTC data channels for collaborative coding.
- **Files Involved:** `frontend/src/app/webrtc/page.tsx`, `frontend/src/lib/p2p-crypto.ts`, `frontend/src/components/collaboration/CollaborativeCodingLab.tsx`
- **Acceptance Criteria:**
  - [ ] Peers verify cryptographic signatures of public keys before establishing WebRTC connection.
  - [ ] Audio, video, and editor sync channels are end-to-end encrypted between mentors and students.
  - [ ] Unauthenticated peer connections are rejected with identity mismatch warnings.

---

### FE-075: Next.js Image Optimization Pipeline Hardening with Signed IPFS Gateway Rewrites

- **Category:** Media & Performance
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Rendering NFT badges and course thumbnails loaded from raw `ipfs://` protocol strings causes broken images and browser mixed-content warnings.
- **Specification:** Enhance `frontend/src/components/SmartImage.tsx` to automatically resolve `ipfs://<CID>` into prioritized, rate-limited public and private fallback IPFS gateways with AVIF/WebP next/image transcoding and automatic blurhash placeholders.
- **Files Involved:** `frontend/src/components/SmartImage.tsx`, `frontend/next.config.ts`, `frontend/src/lib/storage/ipfs.ts`
- **Acceptance Criteria:**
  - [ ] `ipfs://` URIs seamlessly transform into optimized responsive Next.js images.
  - [ ] Gateway failures automatically fallback to secondary IPFS mirrors within 1.5s.
  - [ ] Images render with responsive WebP/AVIF compression saving > 60% bandwidth.

---

### FE-076: Granular Code-Splitting for Heavy Mathematical & Charting Libraries

- **Category:** Bundle Size & Performance
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Initial JavaScript bundle size exceeds recommended limits (First Load JS > 300KB) due to bundling heavy charting (`d3`, `chart.js`) and crypto libraries (`ethers`, `bignumber.js`) into entry chunks.
- **Specification:** Refactor `frontend/next.config.ts` splitChunks cacheGroups to guarantee that `d3`, `chart.js`, `recharts`, and Web3 math tools are exclusively loaded via `next/dynamic` on routes that require them (`/analytics`, `/simulator`, `/mempool-auction`).
- **Files Involved:** `frontend/next.config.ts`, `frontend/scripts/check-bundle-size.js`, `frontend/src/components/dashboard/ActivityHeatmap.tsx`
- **Acceptance Criteria:**
  - [ ] Core first-load landing page JS bundle is reduced below 85KB gzipped.
  - [ ] Charting libraries are loaded asynchronously upon route navigation.
  - [ ] `pnpm run check:bundle` passes without bundle budget violation alerts.

---

### FE-077: Soroban Transaction Pre-Flight Fee & Footprint Auto-Adjuster with Slippage Control

- **Category:** Web3 Transaction UX
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Students submitting transactions during network congestion encounter failed transactions (`txINTERNAL_ERROR`, `txFAILED`) due to hardcoded base fees and outdated ledger footprint estimates.
- **Specification:** Create an interactive fee and slippage component in `frontend/src/components/wallet/FeeEstimatorModal.tsx`. Fetch live network fee statistics from Horizon, simulate the transaction envelope via Soroban RPC `simulateTransaction`, and dynamically add 15% safety padding to CPU, memory, and inclusion fees.
- **Files Involved:** `frontend/src/components/wallet/FeeEstimatorModal.tsx`, `frontend/src/lib/stellarFeeStats.ts`, `frontend/src/hooks/usePlaygroundExecution.ts`
- **Acceptance Criteria:**
  - [ ] Displays live estimated transaction cost in XLM with Slow, Normal, and Fast presets.
  - [ ] Pre-flight footprint auto-adjusts read/write storage keys before user signs.
  - [ ] Eliminates `txINSUFFICIENT_FEE` transaction submission failures.

---

### FE-078: Accessible ARIA 1.2 Live Regions for Streaming Terminal & WASM Execution

- **Category:** Accessibility (a11y)
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Screen reader users receive no auditory feedback when terminal execution outputs stream in or when contracts finish compiling, violating accessibility compliance standards.
- **Specification:** Audit and enhance `frontend/src/components/editor/CompilerTerminal.tsx` and `src/components/ui/SkipLink.tsx` using ARIA 1.2 live regions (`aria-live="polite"`, `aria-atomic="false"`). Announce compilation status, test pass/fail counts, and error highlights to assistive technologies.
- **Files Involved:** `frontend/src/components/editor/CompilerTerminal.tsx`, `frontend/src/components/ui/SkipLink.tsx`, `frontend/src/tests/accessibility.test.tsx`
- **Acceptance Criteria:**
  - [ ] Screen readers announce compilation results and test outcomes without manual focus shifting.
  - [ ] Terminal supports accessible keyboard navigation to jump between compiler error lines.
  - [ ] Automated axe-core accessibility audit passes with 0 violations.

---

### FE-079: Mobile Responsive Navigation & Virtualized High-Density Leaderboards

- **Category:** Mobile & Performance
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** During global hackathons, leaderboards displaying thousands of student rankings cause mobile browser rendering lockups due to rendering thousands of unbounded DOM nodes.
- **Specification:** Implement DOM virtualization using `@tanstack/react-virtual` in `frontend/src/app/hackathon-ideas/page.tsx` and mobile drawer optimizations in `frontend/src/components/layout/MobileDrawer.tsx`. Render only the active viewport rows while keeping memory usage flat.
- **Files Involved:** `frontend/src/components/layout/MobileDrawer.tsx`, `frontend/src/app/hackathon-ideas/page.tsx`, `frontend/e2e/tests/responsive.spec.ts`
- **Acceptance Criteria:**
  - [ ] Leaderboard smoothly scrolls through 10,000+ entries at constant 60fps on mobile viewports.
  - [ ] Mobile navigation drawer opens and closes with smooth hardware-accelerated animations.
  - [ ] Playwright responsive tests pass across iPhone, iPad, and desktop viewports.

---

### FE-080: Passkey (WebAuthn FIDO2) Hardware Key Registration & Biometric Re-auth Flow

- **Category:** Authentication & Web3
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Students using WebAuthn passkeys encounter confusing error states when browser biometric prompts are cancelled or when attempting to register multiple hardware keys.
- **Specification:** Enhance `frontend/src/lib/passkey.ts` and `frontend/src/app/passkey/page.tsx`. Integrate `@simplewebauthn/browser` with full ceremony lifecycle handling: device biometric checks, platform authenticator detection, friendly user cancellation recovery, and multi-key nickname management.
- **Files Involved:** `frontend/src/lib/passkey.ts`, `frontend/src/app/passkey/page.tsx`, `frontend/src/components/auth/PasskeyModal.tsx`
- **Acceptance Criteria:**
  - [ ] Users can register TouchID, FaceID, or YubiKeys as secure WebAuthn credentials.
  - [ ] Friendly error messaging displays when biometrics are cancelled or timed out.
  - [ ] Registered passkeys sign challenge payloads accepted by backend SEP-0010 gateway.

---

### FE-081: Client-Side Merkle Proof Generation & Tree Navigation Visualizer for Airdrops

- **Category:** Web3 Visualization
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Students claiming token airdrops or achievement SBTs have no visual feedback on how their address proves inclusion in the Merkle root, leading to distrust.
- **Specification:** Author an interactive Merkle Proof tree explorer in `frontend/src/app/merkle-simulator/page.tsx`. Using D3.js and `@stellar/stellar-sdk`, allow students to input their address, inspect the cryptographic leaf hash, and visualize the verification path through sister hashes up to the anchored root.
- **Files Involved:** `frontend/src/app/merkle-simulator/page.tsx`, `frontend/src/app/merkle-tree/page.tsx`, `frontend/src/lib/merkle/merkleTree.ts`
- **Acceptance Criteria:**
  - [ ] Visualizes step-by-step cryptographic hash concatenation to root.
  - [ ] Generates valid Merkle inclusion proofs formatted for direct Soroban contract call submission.
  - [ ] Animates green/red path verification matching on-chain contract logic.

---

### FE-082: WebSocket Reconnection Exponential Backoff with Jitter and Offline Mutation Queue

- **Category:** Real-Time & Networking
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Unstable networks trigger immediate WebSocket reconnect loops in `frontend/src/hooks/useWebSocket.ts`, overwhelming backend servers with thundering-herd reconnect storms.
- **Specification:** Implement full exponential backoff with full jitter (decorrelated jitter algorithm) in `src/lib/websocket/client.ts`. While disconnected, buffer outgoing mutations in an IndexedDB queue and flush them sequentially upon authenticated reconnect.
- **Files Involved:** `frontend/src/hooks/useWebSocket.ts`, `frontend/src/lib/websocket/client.ts`, `frontend/src/hooks/useCollaborativeCodingLab.ts`
- **Acceptance Criteria:**
  - [ ] Reconnect attempts back off gracefully (1s, 2s, 4s, 8s, up to 30s max with jitter).
  - [ ] Network disconnects do not drop student chat messages or code review comments.
  - [ ] Reconnecting seamlessly re-subscribes to active room channels without duplicate events.

---

### FE-083: Client-Side Secret Management & Encrypted Session Storage via Web Cryptography API

- **Category:** Client Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Storing sensitive authentication tokens or burner wallet secret keys in plain `localStorage` exposes them to XSS exfiltration.
- **Specification:** Build `frontend/src/lib/credentialStorage.ts` utilizing the Web Cryptography API (`crypto.subtle`). Encrypt all sensitive cached session materials using AES-GCM with a non-extractable master key derived from user password or device-bound hardware credentials.
- **Files Involved:** `frontend/src/lib/credentialStorage.ts`, `frontend/src/lib/encryption.ts`, `frontend/src/contexts/AuthContext.tsx`
- **Acceptance Criteria:**
  - [ ] Local storage contents are fully encrypted with AES-256-GCM; no raw tokens in storage inspector.
  - [ ] Encryption keys remain non-extractable from browser memory.
  - [ ] Cryptographic decryption handles corrupt or tampered payloads gracefully by clearing state.

---

### FE-084: OpenGraph Dynamic Image Generation Pipeline Modernization via `next/og` Edge API

- **Category:** SEO & Social Sharing
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `frontend/src/app/api/og/certificates/[id]/route.tsx` imports from `@vercel/og` (an uninstalled dependency), breaking OG social previews for shared certificates on Twitter/LinkedIn.
- **Specification:** Migrate OG generation to native Next.js `next/og` (`import { ImageResponse } from 'next/og'`). Render high-resolution 1200x630 sharing cards showcasing the student's name, course title, completion date, and verified certificate badge with custom monospace styling.
- **Files Involved:** `frontend/src/app/api/og/certificates/[id]/route.tsx`, `frontend/src/app/api/og/certificate/[id]/route.ts`
- **Acceptance Criteria:**
  - [ ] Uses built-in `next/og` without external `@vercel/og` package dependency.
  - [ ] Renders crisp 1200x630 PNG images in < 150ms on edge runtime.
  - [ ] Social card metadata (`twitter:image`, `og:image`) renders correctly in LinkedIn/Twitter validators.

---

### FE-085: Multi-Tab SharedWorker BroadcastChannel for Unified Blockchain Event Streaming

- **Category:** Performance & Networking
- **Difficulty:** Advanced | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Opening multiple student lab tabs spawns redundant WebSocket connections to the backend for every open tab, exhausting browser socket pools and server connections.
- **Specification:** Implement a `SharedWorker` architecture (`src/workers/socket.sharedworker.ts`) backed by `BroadcastChannel`. Maintain a single active WebSocket connection across all open browser tabs, multiplexing incoming Soroban events and notifications to all tabs.
- **Files Involved:** `frontend/src/workers/socket.sharedworker.ts`, `frontend/src/hooks/useWebSocket.ts`, `frontend/src/app/providers.tsx`
- **Acceptance Criteria:**
  - [ ] 10 open browser tabs share exactly 1 underlying WebSocket connection.
  - [ ] Closing the primary tab seamlessly handoffs connection leadership to an active tab.
  - [ ] BroadcastChannel relays incoming contract events to all tabs with latency < 5ms.

---

### FE-086: High-Frequency Mempool Auction Visualizer with WebGL Rendering for Gas Spikes

- **Category:** Data Visualization
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** The mempool auction visualizer (`frontend/src/app/mempool-auction/page.tsx`) uses standard DOM elements, which choke and freeze the UI during high-frequency transaction bidding spikes.
- **Specification:** Rewrite the mempool transaction stream canvas using Pixi.js or Three.js WebGL rendering. Render thousands of concurrent simulated bidding particles and transaction blocks at 60fps, color-coding bids by fee-per-operation.
- **Files Involved:** `frontend/src/app/mempool-auction/page.tsx`, `frontend/src/components/simulator/MempoolCanvas.tsx`
- **Acceptance Criteria:**
  - [ ] Renders 5,000+ simultaneous transaction particles at constant 60fps.
  - [ ] Interactive click on particle displays decoded XDR envelope, fee bids, and priority level.
  - [ ] Gracefully falls back to 2D canvas on hardware without WebGL support.

---

### FE-087: Interactive Soroban Disassembler & Opcode Step-Debugger in Browser

- **Category:** Web3 Developer Tools
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Students debugging panicking Soroban contracts cannot inspect raw WebAssembly bytecode instructions or track stack mutations.
- **Specification:** Build an interactive WASM instruction disassembler in `frontend/src/app/playground/page.tsx`. Parse compiled binary bytecodes into standard WebAssembly text format (WAT) opcodes, allowing users to step forwards and backwards through VM stack operations with breakpoint support.
- **Files Involved:** `frontend/src/app/playground/page.tsx`, `frontend/src/lib/debugger/SnapshotManager.ts`, `frontend/src/components/editor/DisassemblerPane.tsx`
- **Acceptance Criteria:**
  - [ ] Disassembles arbitrary Soroban WASM binaries into readable opcode listings in-browser.
  - [ ] Supports setting breakpoints on specific function offsets.
  - [ ] Step-debugging visualizes call stack values and local variable registers in real-time.

---

### FE-088: Client-Side Telemetry & Core Web Vitals (INP, LCP, CLS) Real-Time Beacon with OTel

- **Category:** Monitoring & Telemetry
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Frontend client performance bottlenecks and interaction delays (Interaction to Next Paint - INP) in production are invisible to developers.
- **Specification:** Integrate `web-vitals` library with OpenTelemetry Web SDK. Transmit real-time Core Web Vitals beacons (LCP, INP, CLS, FCP, TTFB) along with user hardware capabilities to the backend `/api/v1/metrics` collector.
- **Files Involved:** `frontend/src/app/layout.tsx`, `frontend/src/lib/telemetry/webVitals.ts`, `frontend/src/lib/queryClient.ts`
- **Acceptance Criteria:**
  - [ ] Automatically measures and reports real-user Web Vitals metrics on route changes.
  - [ ] Beacon transmissions use `navigator.sendBeacon` to ensure delivery during page unload.
  - [ ] High interaction latency (> 200ms INP) generates diagnostic traces identifying slow components.

---

### FE-089: Peer-to-Peer Collaborative Whiteboard CRDT State Sync over Yjs Binary Wire Format

- **Category:** Collaboration & Canvas
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Whiteboard collaboration in `frontend/src/app/brainstorm/page.tsx` and `src/components/whiteboard/Whiteboard.tsx` transmits bloated JSON shapes over WebSockets, causing network congestion during complex architectural diagramming sessions.
- **Specification:** Refactor canvas drawing state synchronization to use binary Yjs CRDT vectors (`y-protocols/awareness`). Serialize canvas shape mutations, sticky notes, and freehand drawing paths into compact binary buffers transmitted over WebSockets.
- **Files Involved:** `frontend/src/components/whiteboard/Whiteboard.tsx`, `frontend/src/lib/whiteboard/CanvasManager.ts`, `frontend/src/components/whiteboard/CollaborativeCanvas.tsx`
- **Acceptance Criteria:**
  - [ ] Bandwidth consumption for drawing synchronization decreases by > 75%.
  - [ ] Multiple users can simultaneously draw and move diagram shapes without conflict or state rollback.
  - [ ] Canvas snapshots export to high-resolution PNG, SVG, or JSON diagrams.

---

### FE-090: Subscriptions & Paywall Gating Web3 Modal with SEP-41 Token Allowance Pre-Approvals

- **Category:** Web3 Payments & Monetization
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Enrolling in premium mentorship programs or advanced courses requires multi-step approval and transfer transactions, confusing students and causing payment abandonment.
- **Specification:** Build a unified subscription modal in `frontend/src/app/subscriptions/page.tsx`. Orchestrate SEP-41 token allowance checks, calculate required fees, and provide a 1-click batch transaction envelope combining token approval and subscription contract enrollment.
- **Files Involved:** `frontend/src/app/subscriptions/page.tsx`, `frontend/src/components/payments/SplitterDashboard.tsx`, `frontend/src/hooks/useStellarTokens.ts`
- **Acceptance Criteria:**
  - [ ] Checks token balances and existing allowances before submitting transactions.
  - [ ] Combines allowance increase and enrollment call into a single atomic transaction flow.
  - [ ] Displays animated confirmation with on-chain transaction hash and subscription expiry date.

---

### FE-091: Comprehensive End-to-End Playwright Matrix Test Coverage for Wallets & Reorgs

- **Category:** Quality Assurance & Testing
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** E2E Playwright test runs frequently experience flaky locator timeouts or webkit fetch rejections during simulated offline switches and wallet popups.
- **Specification:** Harden `frontend/playwright.config.ts` and test fixtures in `frontend/e2e/`. Implement synthetic wallet mocking providers, deterministic network latency injection, and strict auto-retries for webkit offline dispatches.
- **Files Involved:** `frontend/playwright.config.ts`, `frontend/e2e/tests/responsive.spec.ts`, `frontend/e2e/fixtures/walletMock.ts`
- **Acceptance Criteria:**
  - [ ] 100% pass rate across Playwright test matrix (Chromium, Firefox, WebKit, Mobile Safari).
  - [ ] Zero flaky test failures caused by warning modal click interception.
  - [ ] Tests validate full student journey: login, course enrollment, code compile, and certificate download.

---

### FE-092: Localized i18n RTL Text Direction Support and Dynamic Locale Chunk Streaming

- **Category:** Internationalization (i18n)
- **Difficulty:** Medium | **Priority:** Medium | **ETA:** 1 Day
- **Problem Statement:** International students in Arabic, Hebrew, or Persian speaking regions experience broken layout alignments due to missing Right-to-Left (RTL) styling and monolithic i18n JSON bundles.
- **Specification:** Enhance `frontend/src/i18n/` to dynamically load locale dictionary chunks on demand. Add automatic `dir="rtl"` attribute injection to `<html>` and apply logical CSS properties (`ms-*`, `me-*`, `start-*`, `end-*`) across core layouts.
- **Files Involved:** `frontend/src/i18n/`, `frontend/src/i18n/__tests__/locale-key-parity.test.ts`, `frontend/src/app/layout.tsx`
- **Acceptance Criteria:**
  - [ ] Locale files are dynamically streamed; users only download their selected language bundle.
  - [ ] RTL languages render with mirrored navigation, correct text alignment, and proper icon positioning.
  - [ ] Key parity unit tests verify 100% translation coverage across all supported locales.

---

### FE-093: Keyboard Navigation Shortcut Map & Focus Trap Auditing for Screen Readers

- **Category:** Accessibility & Power-User Tools
- **Difficulty:** Medium | **Priority:** Medium | **ETA:** 1 Day
- **Problem Statement:** Power users and motor-impaired learners navigating via keyboard become trapped inside Monaco Editor instances or modal dialogs without escape routes.
- **Specification:** Audit and standardize keyboard shortcut listeners in `src/components/keyboard/KeyboardShortcutsProvider.test.tsx` and `src/hooks/useFocusTrap.ts`. Enforce global Escape key handling to release editor focus, close active modals, and display a command palette modal on `Ctrl/Cmd + K`.
- **Files Involved:** `frontend/src/components/keyboard/KeyboardShortcutsProvider.tsx`, `frontend/src/hooks/useFocusTrap.ts`, `frontend/src/hooks/useKeyboardNavigation.ts`
- **Acceptance Criteria:**
  - [ ] `Cmd/Ctrl + K` opens the command palette from any route.
  - [ ] Pressing `Escape` reliably releases Monaco editor focus to page tab-order.
  - [ ] Modal dialogs implement strict focus trapping with tab-cycling.

---

### FE-094: Dark/Light High-Contrast Accessibility Theme Compliance with WCAG AAA

- **Category:** Accessibility & Design
- **Difficulty:** Medium | **Priority:** Medium | **ETA:** 1 Day
- **Problem Statement:** Certain UI elements (code diff highlights, subtle text muted colors) fail minimum contrast requirements for low-vision learners.
- **Specification:** Implement a dedicated high-contrast mode in `frontend/src/contexts/ThemeContext.tsx`. Ensure all text-to-background contrast ratios exceed 7:1 (WCAG AAA standard), and syntax highlighting maintains distinct contrast borders.
- **Files Involved:** `frontend/src/contexts/ThemeContext.tsx`, `frontend/src/lib/theme/themeColors.ts`, `frontend/src/components/diff/DiffViewer.tsx`
- **Acceptance Criteria:**
  - [ ] High-contrast mode toggle available in user accessibility preferences.
  - [ ] All typography and actionable buttons exceed 7:1 contrast ratio against backdrops.
  - [ ] Code diff viewer clearly distinguishes additions and deletions with accessible patterns and symbols.

---

### FE-095: Interactive AMM Bonding Curve Simulation & Constant-Product Slippage Calculator

- **Category:** DeFi Educational Visualizers
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Students learning Automated Market Makers struggle to calculate dynamic slippage, impermanent loss, and fee impacts before executing swaps.
- **Specification:** Build an interactive constant-product simulator in `frontend/src/app/simulator/page.tsx`. Render dynamic $x \cdot y = k$ hyperbolic curves using Chart.js / D3, animating price impact tangents and token reserve rebalancing in real-time as users slide swap amounts.
- **Files Involved:** `frontend/src/app/simulator/page.tsx`, `frontend/src/app/yield-calculator/page.tsx`, `frontend/src/components/simulator/BondingCurveChart.tsx`
- **Acceptance Criteria:**
  - [ ] Renders dynamic mathematical bonding curve responding in real-time to input sliders.
  - [ ] Calculates exact expected output, price impact percentage, and protocol fee breakdown.
  - [ ] Warns when slippage exceeds 5% with educational callouts explaining sandwich vulnerability.

---

### FE-096: Zero-Knowledge Proof Client-Side Witness Calculator & SnarkJS Web Worker

- **Category:** ZK Cryptography
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Generating zero-knowledge proofs in the main browser thread causes browser freezing and "Page Unresponsive" dialogs during certificate privacy verification.
- **Specification:** Integrate `snarkjs` and Circom witness calculation inside a dedicated Web Worker (`src/workers/zk-prover.worker.ts`). Compute Groth16 cryptographic proofs asynchronously, passing progress events to the UI thread before submitting the proof to the Soroban verifier contract.
- **Files Involved:** `frontend/src/workers/zk-prover.worker.ts`, `frontend/src/hooks/useZkProof.ts`, `frontend/src/app/verify/page.tsx`
- **Acceptance Criteria:**
  - [ ] Zero-knowledge witness calculation and proof generation run off-thread without UI stutter.
  - [ ] Progress bar displays witness generation, FFT computation, and proof synthesis steps.
  - [ ] Generated proofs verify successfully on-chain against `contracts/zk_proof_verifier`.

---

### FE-097: Service Worker Cache Partitioning & Background Fetch API for Curriculums

- **Category:** PWA & Offline
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Video lectures and interactive WebAssembly labs fail to download or consume duplicate mobile data due to lack of structured client-side resource caching.
- **Specification:** Implement a progressive service worker using Workbox in `frontend/public/sw.js`. Partition caching strategies: Cache-First for static fonts/images, Stale-While-Revalidate for course curriculum content, and Background Fetch API for offline video caching.
- **Files Involved:** `frontend/public/sw.js`, `frontend/src/lib/pwa/serviceWorkerRegistration.ts`, `frontend/src/app/manifest.webmanifest`
- **Acceptance Criteria:**
  - [ ] Web application installs cleanly as a Progressive Web App (PWA) on desktop and mobile.
  - [ ] Previously visited courses load completely offline without network connectivity.
  - [ ] Cache quota manager purges oldest cached assets when storage exceeds 200MB.

---

### FE-098: Form State Persistence & Draft Auto-Saving with IndexedDB Fallbacks

- **Category:** UX & Form Handling
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Students writing lengthy hackathon project submissions, peer reviews, or exercise solutions lose their work if their browser tab crashes or accidentally closes.
- **Specification:** Create a persistent draft hook `useFormDraft.ts` backed by IndexedDB. Debounce form state serialization every 1.5 seconds, and automatically restore saved drafts with an option to discard or resume upon revisiting the form.
- **Files Involved:** `frontend/src/hooks/useFormDraft.ts`, `frontend/src/app/hackathon-ideas/page.tsx`, `frontend/src/app/peer-review/page.tsx`
- **Acceptance Criteria:**
  - [ ] Typing in submission inputs auto-saves drafts locally every 1500ms.
  - [ ] Reloading the page prompts a banner: "Draft restored from 2 minutes ago (Discard / Keep)".
  - [ ] Successfully submitting the form permanently clears the cached draft.

---

### FE-099: Error Boundary Telemetry with Breadcrumbs, State Snapshots & User Feedback

- **Category:** Error Monitoring & Observability
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** When an unhandled React error occurs in deep UI components, students are met with a white screen of death with no actionable diagnostic feedback or error reporting.
- **Specification:** Upgrade `frontend/src/components/ui/ErrorBoundary.tsx` and `src/components/ui/ErrorFallback.tsx`. Capture component hierarchy stack traces, recent user action breadcrumbs, and active wallet address (redacting PII). Transmit crashes to Sentry and render a recovery modal with a "Reload Component" button.
- **Files Involved:** `frontend/src/components/ui/ErrorBoundary.tsx`, `frontend/src/components/ui/ErrorFallback.tsx`, `frontend/sentry.client.config.ts`
- **Acceptance Criteria:**
  - [ ] Unhandled render errors are isolated to the faulty component; the rest of the layout remains interactive.
  - [ ] Sentry captures breadcrumbs and component stack traces.
  - [ ] Users can click "Reset & Try Again" or submit a brief crash report.

---

### FE-100: Production Static Asset Immutability, Brotli Pre-Compression & CDN Cache Tuning

- **Category:** Performance & Infrastructure
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Default Next.js production builds lack optimal static caching headers and pre-compressed Brotli assets, resulting in redundant origin fetches and higher CDN egress costs.
- **Specification:** Configure `frontend/next.config.ts` to pre-generate Brotli and Gzip assets at build time. Implement strict `Cache-Control: public, max-age=31536000, immutable` for all hashed chunks under `/_next/static/`, while enforcing proper stale-while-revalidate headers for dynamic public endpoints.
- **Files Involved:** `frontend/next.config.ts`, `frontend/scripts/check-bundle-size.js`
- **Acceptance Criteria:**
  - [ ] Hashed static chunks serve with 1-year immutable caching headers.
  - [ ] Assets serve with `Content-Encoding: br` (Brotli) on supporting browsers.
  - [ ] Google Lighthouse Performance score exceeds 95 on production landing and course pages.

---

# Part 2: Backend Infrastructure, Security & Scalability

### BE-051: Elimination of Account Takeover Vulnerability in `/api/v1/auth/register`

- **Category:** Security & Authentication
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** In `backend/src/auth/auth.service.ts`, if a registration request matches an existing student email that has no linked wallet, the handler updates the existing user's record with the caller's wallet address and returns authenticated JWT tokens without verifying the existing user's password. Any attacker knowing a student's email can hijack their account.
- **Specification:** Completely remove the auto-link update branch inside `register()`. If `existingStudent` exists, always reject with `409 Conflict: Student with this email already exists`. Require existing users to authenticate via password or existing wallet before linking secondary credentials.
- **Files Involved:** `backend/src/auth/auth.service.ts`, `backend/src/routes/auth/auth.routes.ts`, `backend/tests/auth.test.ts`
- **Acceptance Criteria:**
  - [ ] Calling register with an existing email always returns HTTP 409, regardless of wallet presence.
  - [ ] Account takeover via wallet-linking during registration is completely eliminated.
  - [ ] Unit tests verify that existing accounts cannot be overwritten or accessed without valid credentials.

---

### BE-052: Strict Environment Guard: Removal of Insecure JWT Fallback Secret & Fail-Fast Startup

- **Category:** Security & Configuration
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** `backend/src/auth/auth.service.ts` falls back to `'your-secret-key-change-in-production'` if `process.env.JWT_SECRET` is unset. In production, an unconfigured secret allows attackers to forge administrative authentication tokens.
- **Specification:** Update `backend/src/config/env.ts` and `src/auth/auth.service.ts`. If `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, or `REFRESH_TOKEN_SECRET` is missing, shorter than 32 characters, or matches default placeholder strings, fail fast immediately during process startup (`process.exit(1)`) with a descriptive fatal error log.
- **Files Involved:** `backend/src/config/env.ts`, `backend/src/auth/auth.service.ts`, `backend/src/index.ts`
- **Acceptance Criteria:**
  - [ ] Server refuses to start if `JWT_SECRET` is unset or insecure.
  - [ ] Default placeholder strings are explicitly rejected by startup validators.
  - [ ] Passes environment sanity checks in development, test, and production configurations.

---

### BE-053: Horizon Multi-Signature Verification Mocking & Offline Fast-Path in SEP-0010 Tests

- **Category:** Testing & CI/CD
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `backend/tests/sep10.auth.test.ts` experiences timeout failures (> 5000ms) because `verifySep10Challenge` invokes `horizon.loadAccount()` directly against the live Stellar testnet Horizon endpoint. If testnet is slow or network connectivity drops, tests fail.
- **Specification:** Refactor `tests/sep10.auth.test.ts` to mock Horizon server responses using Jest mocks or provide a synthetic in-memory Horizon server instance. Verify account thresholds, master key weights, and signer lists deterministically without outbound network requests.
- **Files Involved:** `backend/tests/sep10.auth.test.ts`, `backend/src/auth/sep10.service.ts`
- **Acceptance Criteria:**
  - [ ] SEP-0010 test suite executes in < 3 seconds completely offline.
  - [ ] Tests validate single-sig, multi-sig threshold pass/fail, and non-existent account fallbacks.
  - [ ] Zero flaky timeouts caused by remote Stellar testnet latency.

---

### BE-054: Production Smoke Test Health Probe Isolation & Configurable Network Timeouts

- **Category:** Testing & Reliability
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `backend/tests/smoke.test.ts` times out at 5000ms during `checkDeepReadiness()` because it probes live external RPC endpoints, Redis, and database connections without isolated timeout limits.
- **Specification:** Add timeout parameters and dependency mocking interfaces to `checkDeepReadiness()` in `backend/src/services/health.service.ts`. In test environments, supply mock health checks that simulate healthy, degraded, and down states with sub-50ms execution times.
- **Files Involved:** `backend/tests/smoke.test.ts`, `backend/src/routes/health.routes.ts`, `backend/src/services/health.service.ts`
- **Acceptance Criteria:**
  - [ ] Smoke tests run deterministically within configured timeouts.
  - [ ] Deep health check reliably reports individual subsystem health (PostgreSQL, Redis, Soroban RPC).
  - [ ] Unhealthy subsystems return structured diagnostic JSON with HTTP 503 Service Unavailable.

---

### BE-055: WasmExecutionSandbox Concurrency Slot Isolation & Worker Thread Cleanup

- **Category:** Backend Sandbox & Resource Management
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `backend/src/services/wasmExecutionSandbox.ts`, high-volume test runs or parallel student exercise submissions experience slot deadlocks and aborted tests due to worker threads crashing before posting `'done'` or `'fatal'` messages.
- **Specification:** Harden `runWasmEvaluation` with a strict `finally` block ensuring `releaseSlot()` always executes. Add `worker.on('exit')` listeners that detect sudden thread termination, release the concurrency slot, and return structured `'internal-error'` results rather than hanging callers indefinitely.
- **Files Involved:** `backend/src/services/wasmExecutionSandbox.ts`, `backend/tests/wasmExecutionSandbox.test.ts`
- **Acceptance Criteria:**
  - [ ] Worker thread crashes never leak concurrency slots or hang pending submissions.
  - [ ] Concurrency limiter strictly enforces maximum parallel isolates (`WASM_SANDBOX_MAX_CONCURRENCY`).
  - [ ] All 19 tests in `tests/wasmExecutionSandbox.test.ts` pass reliably in full test runs.

---

### BE-056: Express Clean Shutdown & Jest Open-Handle Teardown Protocol

- **Category:** Server Lifecycle & Testing
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Running `jest --runInBand --forceExit` takes over 2 hours and warns of open asynchronous handles (unclosed PostgreSQL Prisma connections, active Redis timers, open BullMQ workers) preventing Node.js from exiting cleanly.
- **Specification:** Implement a graceful shutdown protocol in `backend/src/utils/shutdown.ts`. Register `SIGTERM` / `SIGINT` handlers and a centralized `closeAllConnections()` utility that closes Express HTTP servers, terminates BullMQ queue workers, and calls `prisma.$disconnect()` and `redis.quit()`. Integrate this into `jest.setup.js`.
- **Files Involved:** `backend/src/index.ts`, `backend/src/utils/shutdown.ts`, `backend/jest.setup.js`, `backend/tests/shutdown.test.ts`
- **Acceptance Criteria:**
  - [ ] Jest test suite exits naturally without requiring `--forceExit` flag.
  - [ ] Production process handles `SIGTERM` by finishing in-flight requests before exiting within 10s.
  - [ ] Zero connection leaks reported by Jest `--detectOpenHandles`.

---

### BE-057: Elimination of Route Shadowing & Unification of Duplicate Mounting Paths

- **Category:** API Routing & Architecture
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `backend/src/routes/index.ts` mounts multiple independent routers to identical path prefixes: lines 102/103 (`/generator`), lines 105/129 (`/simulator`), and lines 106/132 (`/playground`). Depending on route declaration order, earlier endpoints shadow later routes, causing unexpected 404s.
- **Specification:** Consolidate duplicate routers into unified domain routers. Merge `generatorRouter` and `explorerRouter` under `/generator`, combine simulator routes under `/simulator`, and merge playground handlers under a cohesive `/playground` routing hierarchy.
- **Files Involved:** `backend/src/routes/index.ts`, `backend/src/routes/generator/index.ts`, `backend/src/routes/simulator/index.ts`
- **Acceptance Criteria:**
  - [ ] Every API endpoint prefix is registered exactly once in `routes/index.ts`.
  - [ ] Route collisions and shadowing are completely eliminated.
  - [ ] All swagger/OpenAPI documentation accurately reflects the unified route tree.

---

### BE-058: Body Parser Middleware Re-Ordering: Resolution of 100KB vs 1MB Ceiling Conflicts

- **Category:** Middleware & HTTP
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `backend/src/index.ts`, `app.use(express.json())` (default 100kb limit) is registered globally before `app.use(jsonBodySizeLimit)` (1MB limit). Any JSON payload exceeding 100KB sent to endpoints like `/certificates` is rejected by Express before `jsonBodySizeLimit` can process it, returning unformatted HTML error pages.
- **Specification:** Reorder and configure body-parsing middleware in `backend/src/index.ts`. Apply a unified `express.json({ limit: '1mb' })` globally, and ensure `jsonBodySizeLimit` handles content-length validation with standardized JSON error formatting.
- **Files Involved:** `backend/src/index.ts`, `backend/src/middleware/bodySizeLimit.ts`
- **Acceptance Criteria:**
  - [ ] Large valid JSON submissions up to 1MB (WASM bytecodes, Merkle batches) process successfully.
  - [ ] Submissions exceeding 1MB receive clean HTTP 413 JSON responses with `max_bytes` metadata.
  - [ ] Body parsing errors return standardized JSON rather than raw HTML stack traces.

---

### BE-059: High-Throughput Soroban RPC Ingestion Pipeline with Reorg Detection & Idempotency

- **Category:** Indexer & Blockchain Sync
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** If the Stellar network experiences ledger reorganizations or RPC connection drops, the event indexer (`indexer/src/reorg.rs`) risks inserting duplicate events or missing critical smart contract state transitions.
- **Specification:** Enhance the Soroban event indexer service. Implement transaction hash deduplication, ledger cursor watermarking, and reorg detection: if a ledger hash mismatch occurs across sequential blocks, automatically roll back unfinalized events and re-index from the latest consensus checkpoint.
- **Files Involved:** `indexer/src/main.rs`, `indexer/src/reorg.rs`, `indexer/src/db.rs`
- **Acceptance Criteria:**
  - [ ] Event indexer handles 3-ledger fork reorganizations without duplicate event persistence.
  - [ ] Idempotent upsert operations prevent duplicate database records upon restart.
  - [ ] Sub-second latency from on-chain event emission to PostgreSQL persistence and WebSocket fanout.

---

### BE-060: KMS / HSM-Backed Master Relayer Signer Service with Automated Nonce Tracking

- **Category:** Key Management & Gas Relaying
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Storing gas-relayer private keys in environment variables (`RELAYER_PRIVATE_KEY`) exposes them to memory dumps and server compromise, and concurrent relay requests cause sequence number collisions (`txBAD_SEQ`).
- **Specification:** Author an enterprise relayer service in `backend/src/services/relayerService.ts`. Integrate AWS KMS / Google Cloud HSM for signing Soroban transactions. Maintain an atomic in-memory and Redis sequence counter with automated `txBAD_SEQ` re-fetch and retry logic.
- **Files Involved:** `backend/src/routes/relayer.routes.ts`, `backend/src/services/relayerService.ts`, `backend/src/config/kms.ts`
- **Acceptance Criteria:**
  - [ ] Private keys never touch application memory or environment variables in plain text.
  - [ ] High-concurrency transaction submissions (100 tx/sec) execute without sequence number conflicts.
  - [ ] Auto-recovers from ledger sequence desynchronization within 2 retries.

---

### BE-061: Multi-Region PostgreSQL Read Replica Routing with Replication Lag Defense

- **Category:** Database & Scalability
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** High read volume on course progress and certificates degrades database write throughput, while naive read-replica routing causes read-after-write consistency bugs where newly enrolled students see stale non-enrolled states.
- **Specification:** Enhance `backend/src/middleware/dbRouting.ts` and Prisma client configuration. Route all `GET` queries to read replicas while routing mutating queries (`POST`, `PUT`, `DELETE`) to the primary database. Implement session pinning: after a write operation, pin the user's session to the primary database for 3 seconds to guarantee consistency.
- **Files Involved:** `backend/src/middleware/dbRouting.ts`, `backend/src/db/index.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Read traffic scales horizontally across database replicas.
  - [ ] Read-after-write operations guarantee immediate consistency for mutating users.
  - [ ] Database primary CPU utilization decreases by > 50% under heavy read load.

---

### BE-062: Redis Sentinel & Cluster High-Availability Topology for BullMQ Distributed Queues

- **Category:** Caching & Queue Infrastructure
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `backend/src/config/redis.ts`, single-node Redis configuration causes complete system outages (job queue failure, rate limit bypass, session invalidation) if the Redis host restarts.
- **Specification:** Implement full Redis Sentinel and Redis Cluster topology support in `backend/src/config/redis.ts` and BullMQ queue definitions. Support automated failover, master discovery, sentinel reconnect events, and TLS encryption for all Redis traffic.
- **Files Involved:** `backend/src/config/redis.ts`, `backend/src/workers/queueWorkers.ts`, `redis-sentinel.conf`
- **Acceptance Criteria:**
  - [ ] Simulating Redis master termination triggers automated sentinel failover without job loss.
  - [ ] BullMQ workers reconnect to newly promoted master within 5 seconds.
  - [ ] Operates seamlessly in local single-node development and production high-availability clusters.

---

### BE-063: Distributed Dead Letter Queue (DLQ) Auto-Retry Exponential Backoff & Incident Alerting

- **Category:** Background Jobs & Reliability
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** When third-party services (IPFS pinning, email delivery, blockchain RPC) experience transient outages, failed background jobs fail permanently into DLQs without automated recovery.
- **Specification:** Upgrade BullMQ queue processor in `backend/src/workers/queueWorkers.ts` and `backend/src/routes/admin/dlq.routes.ts`. Implement exponential backoff retries with randomized jitter (5 attempts over 2 hours). If all retries fail, move to DLQ and trigger automated PagerDuty / Slack webhook alerts.
- **Files Involved:** `backend/src/workers/queueWorkers.ts`, `backend/src/routes/admin/dlq.routes.ts`, `backend/src/services/alertingService.ts`
- **Acceptance Criteria:**
  - [ ] Transient failures automatically retry with exponential backoff before DLQ escalation.
  - [ ] Admin API provides 1-click batch retry and purge for DLQ items.
  - [ ] Persistent job failures trigger structured webhook alerts containing full stack traces and payload IDs.

---

### BE-064: IPFS Pinning Cluster Redundancy with Multi-Provider Failover (Pinata, Infura, Local)

- **Category:** Decentralized Storage
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Certificate metadata and course assets rely on single-point IPFS gateway uploads. If Pinata rate-limits or experiences an outage, student certificate minting fails completely.
- **Specification:** Refactor `backend/src/services/ipfs.service.ts` into a multi-provider fallback cluster. When pinning JSON metadata or diploma assets, dispatch parallel pins across Pinata, Infura, and an internal IPFS Kubo cluster node. Verify SHA-256 content hashes to guarantee CID consistency across gateways.
- **Files Involved:** `backend/src/services/ipfs.service.ts`, `backend/tests/ipfs.gateway.service.test.ts`, `backend/src/config/ipfs.config.ts`
- **Acceptance Criteria:**
  - [ ] Certificate issuance succeeds even if one IPFS pinning provider is completely offline.
  - [ ] Pinned CIDs are cryptographically identical across providers.
  - [ ] Content integrity verification catches corrupted uploads before writing to database.

---

### BE-065: GraphQL-WS Distributed PubSub Fanout with Redis Streams and Heartbeat Guards

- **Category:** Real-Time & WebSockets
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `backend/src/graphqlWsServer.ts` and collaborative lab sockets run in-memory, preventing horizontal scaling across multiple backend Docker containers.
- **Specification:** Implement distributed WebSocket subscription pub/sub utilizing Redis Streams and `@graphql-tools/schema`. Ensure subscription events published on Container A fan out to subscribed client sockets connected to Container B. Add WebSocket heartbeat ping/pong guards to prune dead sockets every 30s.
- **Files Involved:** `backend/src/graphqlWsServer.ts`, `backend/src/collaborationServer.ts`, `backend/src/config/redis.ts`
- **Acceptance Criteria:**
  - [ ] Real-time course progress and code sync operate across multi-container load-balanced clusters.
  - [ ] Ghost/dead client sockets are automatically purged within 60s of network termination.
  - [ ] Load tests with 1,000 concurrent WebSocket connections verify zero dropped message events.

---

### BE-066: OpenTelemetry Distributed Context Propagation & W3C Trace Injection

- **Category:** Observability & Tracing
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Tracing user requests across Express routes, BullMQ queue workers, and outbound Soroban RPC calls is fragmented, making it impossible to identify the root cause of slow transaction execution.
- **Specification:** Configure OpenTelemetry SDK in `backend/src/instrumentation.ts` and `backend/src/middleware/tracingMiddleware.ts`. Enforce W3C `traceparent` context propagation across all inbound HTTP headers, asynchronous BullMQ job payloads, and outbound HTTP/RPC clients.
- **Files Involved:** `backend/src/instrumentation.ts`, `backend/src/middleware/tracingMiddleware.ts`, `backend/src/utils/logger.ts`
- **Acceptance Criteria:**
  - [ ] Every request receives a globally unique trace ID propagated into Winston log outputs.
  - [ ] Background job spans link directly to the originating HTTP request trace.
  - [ ] Export traces to Jaeger / OTLP collectors with sub-1% CPU overhead.

---

### BE-067: Dynamic Adaptive IP & Wallet Reputation Rate-Limiter with Sliding Window

- **Category:** Anti-Abuse & Rate Limiting
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Fixed rate limiters either block legitimate students participating in hackathons or fail to stop distributed bot attacks scraping course materials.
- **Specification:** Upgrade `backend/src/middleware/dynamicRateLimiter.ts`. Implement an adaptive sliding-window rate limiter using Redis sorted sets. Score client reputation based on authenticated wallet tenure, certificate holdings, and past CAPTCHA verifications to dynamically adjust rate limit ceilings (10 req/min for unverified IPs vs 300 req/min for enrolled students).
- **Files Involved:** `backend/src/middleware/dynamicRateLimiter.ts`, `backend/src/config/redis.ts`
- **Acceptance Criteria:**
  - [ ] Unauthenticated scrapers are restricted to strict rate limit ceilings.
  - [ ] Authenticated students with active profiles enjoy higher rate thresholds without false positives.
  - [ ] Rate limits calculate accurately across sliding 60-second windows without boundary reset flaws.

---

### BE-068: Zero-Downtime Online Schema Migration Pipeline with Expand/Contract Lock Monitoring

- **Category:** Database DevOps
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Applying database migrations with standard Prisma commands on multi-million row tables in production acquires exclusive table locks, causing application downtime and 504 Gateway Timeouts.
- **Specification:** Standardize the database deployment pipeline in `backend/scripts/expand-contract.ts` and `backend/scripts/migrate-with-lock.ts`. Enforce Expand/Contract migration phases: add nullable columns first, backfill asynchronously in batches, switch application code, and remove obsolete columns in follow-up releases.
- **Files Involved:** `backend/scripts/expand-contract.ts`, `backend/scripts/migrate-with-lock.ts`, `backend/scripts/migration-rollback.ts`
- **Acceptance Criteria:**
  - [ ] Migrations run with non-blocking DDL statements (`CONCURRENTLY` for indexes).
  - [ ] Lock scanning script aborts migrations if query execution time exceeds 500ms.
  - [ ] Backward-compatible schema state supports running old and new container versions simultaneously.

---

### BE-069: Multi-Tenant Schema Isolation & Organization Boundary Verification via Prisma

- **Category:** Security & Multi-Tenancy
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** In `backend/src/routes/index.ts`, `optionalWorkspaceMiddleware` sets workspace context, but missing workspace headers allow requests to fall back to unpartitioned global queries, risking cross-tenant data leakage between universities.
- **Specification:** Enforce strict workspace isolation in `backend/src/middleware/WorkspaceContext.ts` and Prisma client extensions. Every database query on multi-tenant entities (`Course`, `Enrollment`, `Submission`, `Certificate`) must mandate an authenticated `workspaceId` condition, throwing a hard authorization exception if unpartitioned access is attempted.
- **Files Involved:** `backend/src/middleware/WorkspaceContext.ts`, `backend/src/middleware/workspaceMembership.ts`, `backend/src/db/index.ts`
- **Acceptance Criteria:**
  - [ ] Cross-tenant access attempts return HTTP 403 Forbidden.
  - [ ] Prisma queries automatically inject `where: { workspaceId }` via client extensions.
  - [ ] Unit tests verify that Tenant A cannot query, update, or delete Tenant B assets.

---

### BE-070: WebAuthn FIDO2 Relying Party Verification Engine with Challenge Expiration

- **Category:** Authentication & Passkeys
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** WebAuthn registration in `backend/src/routes/passkey.routes.ts` does not strictly validate authenticator attachment, signature counter increments, or challenge replay timeouts, leaving users open to authentication replay attacks.
- **Specification:** Refactor passkey verification using `@simplewebauthn/server`. Store one-time challenge nonces in Redis with a strict 120-second TTL. Enforce cryptographic validation of clientDataJSON, authenticatorData flags (User Present, User Verified), origin matching, and signature counter monotonicity to detect cloned authenticators.
- **Files Involved:** `backend/src/routes/passkey.routes.ts`, `backend/src/auth/passkey.service.ts`
- **Acceptance Criteria:**
  - [ ] Replayed or expired WebAuthn challenges are rejected with 401 Unauthorized.
  - [ ] Cloned authenticators with falling signature counters trigger immediate security lockout.
  - [ ] WebAuthn registration and authentication pass FIDO2 conformance test standards.

---

### BE-071: SEP-0010 Stellar Web Authentication Hardening: Replay Defense & Timebounds

- **Category:** Stellar Protocol & Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** SEP-0010 authentication in `backend/src/auth/sep10.service.ts` must verify that client transactions conform strictly to Stellar Web Authentication standards without vulnerability to replayed challenge transactions across different home domains.
- **Specification:** Enforce atomic transaction hash consumption in Redis (`sep10:used:<hash>`) with a 300-second TTL. Verify transaction timebounds against current server time ($T_{\min} \le T_{\text{now}} \le T_{\max}$), ensure `clientAccountID` matches master signer or meets medium threshold requirements, and validate that `matchedHomeDomain` matches the configured server domain.
- **Files Involved:** `backend/src/auth/sep10.service.ts`, `backend/src/routes/auth/auth.routes.ts`, `backend/tests/sep10.auth.test.ts`
- **Acceptance Criteria:**
  - [ ] Replayed signed challenge XDR fails immediately with 401 Unauthorized.
  - [ ] Mismatched home domains or expired timebounds are rejected.
  - [ ] Successfully verified challenges issue hardened JWTs containing student wallet claims.

---

### BE-072: Certificate PDF Cryptographic Signing Pipeline with Ed25519 Enclave Keys

- **Category:** Cryptography & Document Security
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** PDF diplomas generated in `backend/src/certificates/PdfGenerator.ts` lack cryptographic non-repudiation, allowing bad actors to forge diplomas using Photoshop without detection.
- **Specification:** Upgrade `PdfGenerator.ts`. Compute SHA-256 digest of rendered PDF document bytes and sign the digest using the institution's Ed25519 master certificate signing key. Embed the signature, public key, and canonical certificate ID into custom PDF document metadata and HTTP response headers (`X-Certificate-Signature`).
- **Files Involved:** `backend/src/certificates/PdfGenerator.ts`, `backend/src/routes/certificates.routes.ts`, `backend/tests/certificates.test.ts`
- **Acceptance Criteria:**
  - [ ] Every generated PDF contains cryptographic Ed25519 signature embedded in metadata.
  - [ ] Tampering with a single byte in the generated PDF invalidates signature verification.
  - [ ] PDF generation throughput exceeds 20 diplomas/sec under load without worker degradation.

---

### BE-073: Automated Audit Hash-Chain Verification & Periodic Stellar Merkle Anchoring

- **Category:** Auditing & Blockchain Anchoring
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Database audit logs tracking grade updates and certificate issuances could theoretically be tampered with by an insider database administrator without public cryptographic proof.
- **Specification:** Implement a cryptographic audit log hash-chain in `backend/src/jobs/anchorMerkleRootJob.ts`. Every audit log row stores `prevHash` and `hash = SHA256(row || prevHash)`. Every 24 hours, compute the Merkle root of the day's audit entries and anchor the 32-byte root into the Soroban Certificate contract on the Stellar ledger.
- **Files Involved:** `backend/src/jobs/anchorMerkleRootJob.ts`, `backend/src/routes/audit.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Audit logs form an unbroken cryptographic hash-chain from genesis row.
  - [ ] Daily Merkle roots are anchored onto the Stellar blockchain with verifiable transaction hashes.
  - [ ] Automated verification script flags any retroactively altered database row.

---

### BE-074: Sandboxed WASM Gas Metering Calibration & AST Instruction Ceiling Enforcer

- **Category:** Security & Compiler Sandbox
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Hostile students submitting intentionally crafted WebAssembly binaries with pathological control flow or unbounded recursive ASTs can hang worker threads and bypass execution timers.
- **Specification:** Enhance `backend/src/services/wasmExecutionSandbox.ts`. Inject WebAssembly metering instructions (`wasm-metering`) targeting `i32` gas counter decrements at every basic block entrance. Enforce hard limits: 1,000,000 gas units, maximum 50MB linear memory, and 2-second wall-clock ceiling.
- **Files Involved:** `backend/src/services/wasmExecutionSandbox.ts`, `backend/tests/wasmExecutionSandbox.test.ts`
- **Acceptance Criteria:**
  - [ ] Infinite loops terminate deterministically with `terminationReason: 'gas-exhausted'`.
  - [ ] Memory allocation bombs past 50MB trap cleanly without crashing the host Node.js process.
  - [ ] Valid student exercises execute with accurate gas consumption accounting.

---

### BE-075: Real-Time Webhook Dispatch Engine with HMAC-SHA256 Signatures and Backoff Replay

- **Category:** Webhooks & Integrations
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** External universities consuming Web3 Student Lab completion events via webhooks (`backend/src/routes/webhooks.ts`) experience missed notifications when their receiving servers have brief downtime.
- **Specification:** Implement a reliable webhook dispatcher backed by BullMQ. Every outgoing webhook payload must include timestamp and signature headers (`X-Signature-SHA256: HMAC_SHA256(payload, secret)`). If a destination returns 5xx or times out (5s limit), retry with exponential backoff up to 72 hours.
- **Files Involved:** `backend/src/routes/webhooks.ts`, `backend/src/services/webhookDispatcher.ts`, `backend/src/routes/admin/webhooks.routes.ts`
- **Acceptance Criteria:**
  - [ ] Webhook payloads are cryptographically signed with HMAC-SHA256 preventing tampering.
  - [ ] Destination downtime triggers automated retries over 72 hours with exponential backoff.
  - [ ] Admin dashboard provides inspection, failure analysis, and manual replay triggers.

---

### BE-076: Sentry Error Ingestion Tuning, Sensitive PII Scrubbing, and Trace Sampling

- **Category:** Observability & Compliance
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `backend/src/utils/sentry.ts`, unscrubbed Sentry error reporting risks capturing sensitive student passwords, private keys, and authorization headers in crash reports, violating GDPR/FERPA compliance.
- **Specification:** Configure Sentry `beforeSend` data scrubbing in `backend/src/utils/sentry.ts`. Automatically strip and redact `password`, `secret`, `authorization`, `cookie`, and `walletPrivateKey` fields from error contexts and breadcrumbs. Set production trace sampling to 10% to prevent quota exhaustion.
- **Files Involved:** `backend/src/utils/sentry.ts`, `backend/src/index.ts`
- **Acceptance Criteria:**
  - [ ] Sensitive passwords and authorization bearer tokens are permanently redacted before export.
  - [ ] High-volume routine errors (e.g. 404s, invalid client input) are filtered from alert quotas.
  - [ ] Critical 500 exceptions capture complete error stacks and environment tags.

---

### BE-077: Prometheus Custom Metrics Exporter for Soroban Event Lag, Gas & Queue Depths

- **Category:** Monitoring & DevOps
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Infrastructure teams have no real-time visibility into Soroban event indexer lag, BullMQ queue depth, or sandboxed WASM compilation throughput.
- **Specification:** Implement a Prometheus metrics collector endpoint at `/metrics` in `backend/src/routes/metrics.routes.ts` using `prom-client`. Export custom Prometheus metrics: `soroban_indexer_ledger_lag_seconds`, `bullmq_queue_waiting_jobs_count`, `wasm_evaluation_duration_seconds`, and `http_request_duration_seconds`.
- **Files Involved:** `backend/src/routes/metrics.routes.ts`, `backend/src/instrumentation.ts`
- **Acceptance Criteria:**
  - [ ] `/metrics` endpoint exposes Prometheus formatted metrics protected by basic auth.
  - [ ] Grafana dashboards display real-time indexer lag and background worker saturation.
  - [ ] Alerts fire when queue depth exceeds 500 jobs or indexer lag exceeds 3 ledgers.

---

### BE-078: WebSocket Load-Balancer Sticky Sessions & Socket Heartbeat Stale Pruning

- **Category:** WebSockets & Networking
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Deploying backend WebSocket servers behind multi-region load balancers causes connection dropping and handshaking failures when initial HTTP upgrade requests hit different nodes than persistent sockets.
- **Specification:** Update Nginx / Kubernetes ingress configurations in `nginx/` and `k8s/` to support cookie-based sticky sessions for WebSocket upgrade routes (`/collaboration`, `/graphql-ws`). Enforce 30-second ping/pong heartbeats to cleanly prune dead sockets and release server file descriptors.
- **Files Involved:** `nginx/nginx.conf`, `k8s/ingress.yaml`, `backend/src/collaborationServer.ts`
- **Acceptance Criteria:**
  - [ ] WebSocket handshake and persistent connection reliably bind to the same server pod.
  - [ ] Stale or severed mobile client connections are detected and cleaned up within 35 seconds.
  - [ ] Zero socket connection dropping during blue-green deployment rolling restarts.

---

### BE-079: Cross-Chain Relayer Event Proof Generator with Cryptographic Merkle Validation

- **Category:** Cross-Chain Interoperability
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Relaying student certification achievements from Soroban to Ethereum / Polygon lacks cryptographic verification, forcing destination chains to blindly trust relayer messages.
- **Specification:** Build a cryptographic proof generator in `backend/src/routes/cross-chain.routes.ts`. When a certificate is issued on Soroban, generate an SPV Merkle inclusion proof verifying the transaction within the finalized Stellar ledger, and format the proof payload for consumption by EVM light-client contracts.
- **Files Involved:** `backend/src/routes/cross-chain.routes.ts`, `backend/src/services/crossChainRelayer.ts`
- **Acceptance Criteria:**
  - [ ] Generates cryptographic proof confirming Soroban transaction inclusion in Stellar ledger.
  - [ ] Destination EVM contracts verify proof against trusted validator threshold keys.
  - [ ] Prevents double-spending or duplicate certificate minting across chains.

---

### BE-080: Automated Database Vacuum, Deadlock Monitoring & PgBouncer Connection Pooler

- **Category:** Database DevOps & Performance
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Frequent updates to student activity heatmaps and session nonces generate dead tuples in PostgreSQL, degrading query performance and causing connection pool exhaustion during traffic surges.
- **Specification:** Integrate PgBouncer connection pooling into `docker-compose.prod.yml` and Kubernetes manifests. Configure automated PostgreSQL autovacuum schedules with aggressive dead-tuple cleanup on high-churn tables (`AuditLog`, `Session`, `AuthNonce`). Add deadlock query monitoring alerts.
- **Files Involved:** `docker-compose.prod.yml`, `k8s/pgbouncer.yaml`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] PgBouncer manages connection pooling, maintaining stable connections under 2,000 concurrent clients.
  - [ ] Autovacuum runs without locking user-facing read/write queries.
  - [ ] Slow queries (> 250ms) are automatically logged to PostgreSQL slow query logs.

---

### BE-081: Security Incident Audit Logging with Immutable Write-Only S3 Object Lock

- **Category:** Compliance & Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** If an attacker achieves root access to the backend database, they can alter historical security audit logs to hide privilege escalation and token tampering.
- **Specification:** Author an immutable cloud archival worker in `backend/src/services/immutableAuditArchiver.ts`. Every 60 minutes, export verified audit logs to an AWS S3 bucket configured with S3 Object Lock in Compliance Mode (WORM - Write Once, Read Many). Enforce a 7-year retention policy preventing deletion by any IAM user.
- **Files Involved:** `backend/src/services/immutableAuditArchiver.ts`, `backend/src/routes/audit.ts`
- **Acceptance Criteria:**
  - [ ] Hourly audit batches are compressed and written to S3 Object Lock bucket.
  - [ ] S3 bucket policy strictly rejects deletion or modification requests even from root account.
  - [ ] Integrity hashes of cloud audit archives are anchored onto the Stellar ledger.

---

### BE-082: OAuth 2.0 PKCE Authorization Server Hardening for Third-Party Lab Integrations

- **Category:** Authentication & API Security
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Third-party educational platforms and university portals integrating with Web3 Student Lab via OAuth (`backend/src/routes/oauth.routes.ts`) could be vulnerable to authorization code interception if Proof Key for Code Exchange (PKCE) is not strictly enforced.
- **Specification:** Upgrade `backend/src/routes/oauth.routes.ts`. Mandate RFC 7636 PKCE verification for all authorization code exchanges: enforce `code_challenge_method: S256` and reject plain challenges. Validate redirect URIs with exact string matching, rejecting wildcard patterns.
- **Files Involved:** `backend/src/routes/oauth.routes.ts`, `backend/src/auth/oauth.service.ts`
- **Acceptance Criteria:**
  - [ ] Authorization code flow mandates S256 PKCE challenges.
  - [ ] Stolen authorization codes without code_verifier fail redemption with HTTP 400.
  - [ ] Client applications authenticate securely without exposing client secrets on mobile/SPA apps.

---

### BE-083: Cloudflare Turnstile & hCaptcha Adaptive Bot-Protection with Server-Side Verification

- **Category:** Anti-Abuse & Bot Prevention
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Public registration and faucet claim endpoints are targeted by automated account creation bots, depleting testnet gas reserves and creating spam accounts.
- **Specification:** Implement a reusable Turnstile server-side verification middleware in `backend/src/middleware/turnstile.ts`. Validate incoming `cf-turnstile-response` tokens against the Cloudflare siteverify API. Enforce token validation on `/api/v1/auth/register`, `/api/v1/auth/login`, and `/api/v1/gas-station/claim`.
- **Files Involved:** `backend/src/middleware/turnstile.ts`, `backend/src/routes/auth/auth.routes.ts`, `backend/src/routes/gasStation.routes.ts`
- **Acceptance Criteria:**
  - [ ] Missing, expired, or invalid Turnstile tokens immediately reject requests with 403 Forbidden.
  - [ ] Successfully verified requests proceed seamlessly to business logic handlers.
  - [ ] Provides test bypass flags for automated CI/CD test execution (`NODE_ENV === 'test'`).

---

### BE-084: Automated Database Backup Snapshotting, Cold Storage & Point-In-Time Recovery

- **Category:** Disaster Recovery & DevOps
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** In the event of catastrophic hardware failure or accidental database truncation, the platform lacks tested automated procedures for Point-in-Time Recovery (PITR).
- **Specification:** Author an automated backup orchestrator script in `scripts/db-backup-pitr.sh` and Kubernetes CronJob. Implement continuous PostgreSQL WAL (Write-Ahead Log) archiving to encrypted multi-region cloud storage with daily automated restore drills verifying PITR recovery to within 5 minutes of simulated disaster.
- **Files Involved:** `scripts/db-backup-pitr.sh`, `.github/workflows/disaster-recovery.yml`, `k8s/backup-cronjob.yaml`
- **Acceptance Criteria:**
  - [ ] Automated daily full backups and continuous WAL archiving operate without downtime.
  - [ ] Automated recovery test restores database to a staging instance and passes integrity checks.
  - [ ] Recovery Time Objective (RTO) < 30 minutes; Recovery Point Objective (RPO) < 5 minutes.

---

### BE-085: High-Performance Multi-Tier Redis Cache with Stale-While-Revalidate

- **Category:** Caching & Performance
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** High-concurrency reads on public course curriculums and verified certificate lookups query PostgreSQL repeatedly, increasing database load and latency during peak hours.
- **Specification:** Build a multi-tier caching utility in `backend/src/lib/cache/multiTierCache.ts`. Cache normalized course structures and public certificate records in Redis with an in-memory L1 cache and Stale-While-Revalidate (SWR) cache pattern. Automatically invalidate cached keys when courses or certificates are updated.
- **Files Involved:** `backend/src/lib/cache/multiTierCache.ts`, `backend/src/routes/courses.ts`, `backend/src/routes/certificates.routes.ts`
- **Acceptance Criteria:**
  - [ ] Cached course reads resolve in < 5ms from in-memory/Redis L1/L2 cache.
  - [ ] Cache invalidation triggers automatically upon content updates or certificate revocations.
  - [ ] Under 5,000 req/sec load test, 98% of requests are served directly from cache.

---

### BE-086: Sybil-Resistance Verification Gateway Integrating Gitcoin Passport & BrightID

- **Category:** Identity & Anti-Sybil
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Quadratic funding rounds and hackathon voting competitions are vulnerable to Sybil attacks where one person creates dozens of fake accounts to game rewards.
- **Specification:** Build an anti-sybil verification gateway in `backend/src/routes/sybil.routes.ts`. Integrate Gitcoin Passport API and BrightID verification. Calculate an aggregated Sybil score before permitting students to cast votes in quadratic funding or claim hackathon bounties.
- **Files Involved:** `backend/src/routes/sybil.routes.ts`, `backend/src/services/sybilVerification.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Verifies cryptographic stamps from Gitcoin Passport and BrightID proofs.
  - [ ] Calculates unified Sybil score (threshold > 20 required for quadratic voting participation).
  - [ ] Rejects duplicate identity bindings across multiple student accounts.

---

### BE-087: Streaming Blockchain Event RPC Proxy with Binary XDR Decoding Pushdown

- **Category:** Blockchain Infrastructure
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Frontend clients streaming live Soroban contract events through `backend/src/routes/streams.routes.ts` receive massive raw base64 XDR payloads, wasting mobile bandwidth and client CPU.
- **Specification:** Implement a streaming event proxy in `backend/src/routes/streams.routes.ts`. Decode raw Stellar XDR on the server using `@stellar/stellar-sdk` and push compact, structured JSON event streams over Server-Sent Events (SSE) or WebSockets with client-side filter parameters.
- **Files Involved:** `backend/src/routes/streams.routes.ts`, `backend/src/services/eventStreamer.ts`
- **Acceptance Criteria:**
  - [ ] Server-Sent Events stream decoded contract events in real-time.
  - [ ] Payloads are compressed JSON saving > 70% bandwidth compared to raw base64 XDR.
  - [ ] Clients can filter event topics (e.g. transfer, mint, approve) directly via query parameters.

---

### BE-088: Memory Leak Prevention: Node.js Heap Profiling & Buffer Management

- **Category:** Reliability & Performance
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Long-running backend Node.js processes experience slow heap memory growth over days of continuous operation, eventually triggering V8 OOM crashes.
- **Specification:** Implement continuous heap profiling in `backend/src/instrumentation.ts` using v8 heap snapshots. Identify and eliminate uncollected object references in WebSocket room subscriber maps, event listeners, and unclosed Buffer allocations. Add automated heap threshold alerts (> 85% maximum old space).
- **Files Involved:** `backend/src/instrumentation.ts`, `backend/src/collaborationServer.ts`, `backend/src/utils/logger.ts`
- **Acceptance Criteria:**
  - [ ] Node.js heap memory usage stabilizes and plateaus under continuous 24-hour load testing.
  - [ ] WebSocket subscriber maps cleanly dereference disconnecting clients.
  - [ ] Automated health alerts fire before memory exhaustion occurs.

---

### BE-089: Automated Dependency Vulnerability Gatekeeper (npm audit, Snyk, Gitleaks) in CI/CD

- **Category:** DevOps & Security
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Upgrading dependencies without automated supply chain scanning risks introducing malicious backdoor packages or known CVE vulnerabilities into the production build.
- **Specification:** Enhance `.github/workflows/malware-pr-guard.yml` and `.github/workflows/secret-scan.yml`. Integrate automated `pnpm audit --audit-level=high`, Snyk vulnerability scanning, and Gitleaks repository secret detection into every pull request and deploy pipeline.
- **Files Involved:** `.github/workflows/malware-pr-guard.yml`, `.github/workflows/secret-scan.yml`, `.gitleaks.toml`
- **Acceptance Criteria:**
  - [ ] Pull requests with High or Critical npm CVE vulnerabilities are blocked automatically.
  - [ ] Accidental commits of private keys, API secrets, or passwords immediately fail CI.
  - [ ] Supply chain dependency tree is verified against cryptographic lockfile integrity.

---

### BE-090: Peer-Review Assignment Algorithm with Anonymity & Double-Blind Dispute Handling

- **Category:** Curriculum & Peer Review
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `backend/src/routes/peer-review/`, assigning peer reviews naively allows colluding students to review and artificially upvote each other's code submissions.
- **Specification:** Implement a deterministic, double-blind peer review assignment algorithm in `backend/src/services/peerReviewService.ts`. Ensure students cannot review peers from the same team, classroom, or IP subnet. Automatically mask student identities and route disputed grades to mentor arbiters.
- **Files Involved:** `backend/src/routes/peer-review/`, `backend/src/services/peerReviewService.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Assignments are strictly double-blind; neither reviewer nor reviewee learns peer identity.
  - [ ] Graph-based assignment prevents circular collusion rings (A reviews B reviews A).
  - [ ] Grade variance exceeding 20% triggers automatic mentor escalation.

---

### BE-091: Gas Station Sponsoring Relay with Budget Caps, Geofencing & Anti-Drain

- **Category:** Stellar Sponsoring & Web3
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** The fee-sponsoring gas station in `backend/src/routes/gasStation.routes.ts` can be drained by malicious users scripting thousands of empty transactions funded by the lab's sponsoring account.
- **Specification:** Implement strict transaction sponsoring policies in `backend/src/services/gasStationService.ts`. Restrict fee sponsorship to verified course contracts, enforce a maximum daily cap of 50 sponsored transactions per student, and mandate Turnstile CAPTCHA verification for unlinked wallets.
- **Files Involved:** `backend/src/routes/gasStation.routes.ts`, `backend/src/services/gasStationService.ts`
- **Acceptance Criteria:**
  - [ ] Sponsorship strictly rejects unauthorized contracts or arbitrary fund transfers.
  - [ ] Daily per-user spending caps prevent treasury depletion.
  - [ ] Abusive addresses are automatically blacklisted in Redis for 24 hours.

---

### BE-092: Multi-Currency Payment Gateway Reconciliation Worker with Slippage Auditing

- **Category:** Payments & Financial Integrity
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Payments processed through `backend/src/routes/subscriptions.ts` accept multiple Stellar tokens (USDC, XLM, EURC) without automated reconciliation against on-chain ledger settlements, risking accounting discrepancies.
- **Specification:** Build an automated reconciliation background job in `backend/src/workers/paymentReconciliationWorker.ts`. Poll finalized ledger records, match transaction amounts against database payment records, detect exchange slippage discrepancies, and flag un-reconciled transactions for administrative review.
- **Files Involved:** `backend/src/workers/paymentReconciliationWorker.ts`, `backend/src/routes/subscriptions.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Every fiat/token payment reconciles automatically with verified on-chain ledger payments.
  - [ ] Discrepancies or partial payments trigger automated accounting alerts.
  - [ ] Daily financial reconciliation reports export to CSV/JSON for auditing.

---

### BE-093: Microservice gRPC Communication Channel with Mutual TLS (mTLS) Authentication

- **Category:** Internal Architecture & Security
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Communication between the API gateway, indexer service, and WASM evaluation workers travels over unauthenticated internal HTTP channels, vulnerable to internal network snooping.
- **Specification:** Implement high-speed gRPC communication channels with mutual TLS (mTLS) authentication between backend services. Generate internal service certificates and enforce bidirectional certificate validation for all internal RPC calls.
- **Files Involved:** `backend/src/grpc/`, `indexer/src/main.rs`, `backend/src/services/wasmExecutionSandbox.ts`
- **Acceptance Criteria:**
  - [ ] Internal microservice RPC calls authenticate via cryptographic mTLS certificates.
  - [ ] Unauthenticated internal network requests are rejected at the transport layer.
  - [ ] Protocol buffer serialization increases RPC throughput by > 3x compared to JSON.

---

### BE-094: REST API Idempotency-Key Header Handling via Redis Distributed Locks

- **Category:** API Reliability & Payments
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Network retries on mutating endpoints (`/certificates/mint`, `/subscriptions/pay`) can trigger duplicate certificate mints or double-charges if clients retry during timeouts.
- **Specification:** Implement an idempotency middleware in `backend/src/middleware/idempotency.ts`. Parse `Idempotency-Key` headers on mutating HTTP requests. Acquire an atomic Redis lock on the key, cache the initial execution response for 24 hours, and return the cached response on duplicate requests without re-executing business logic.
- **Files Involved:** `backend/src/middleware/idempotency.ts`, `backend/src/routes/certificates.routes.ts`, `backend/src/routes/subscriptions.ts`
- **Acceptance Criteria:**
  - [ ] Duplicate requests with matching `Idempotency-Key` return identical responses without duplicate execution.
  - [ ] Concurrent requests with the same key safely queue or reject with 409 Conflict.
  - [ ] Idempotency cache expires automatically after 24 hours.

---

### BE-095: Cryptographic Key Rotation Ceremony Tooling for JWT and Database Encryption

- **Category:** Key Management & DevOps
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Key rotation for database encryption keys and JWT signing secrets currently requires manual database migrations and invalidates all existing user sessions.
- **Specification:** Build a zero-downtime key rotation mechanism in `backend/src/security/secrets-manager.service.ts`. Support dual-key verification: verify tokens against active and previous key versions while signing all new tokens with the latest primary key. Provide a CLI script for rotating database field encryption keys.
- **Files Involved:** `backend/src/security/secrets-manager.service.ts`, `backend/src/auth/token.service.ts`, `backend/scripts/rotate-keys.ts`
- **Acceptance Criteria:**
  - [ ] JWT keys rotate without logging out active users during the transition period.
  - [ ] Database field encryption keys re-encrypt existing records in background batches.
  - [ ] Old keys cleanly retire after grace period expiration.

---

### BE-096: Course Content Markdown Sanitization & AST Static Analysis for XSS Prevention

- **Category:** Content Security
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Instructors authoring course lessons in Markdown format can inadvertently include malicious `<script>` tags, `javascript:` pseudo-protocols, or HTML onload attributes in lesson descriptions.
- **Specification:** Implement an AST-based Markdown sanitizer in `backend/src/services/contentSanitizer.ts` using `rehype-sanitize` and `unified`. Enforce a strict GitHub-flavored markdown schema, stripping unsafe HTML tags, iframe injections, and event attributes before saving lessons to the database.
- **Files Involved:** `backend/src/services/contentSanitizer.ts`, `backend/src/routes/courses.ts`, `backend/tests/contentSanitization.test.ts`
- **Acceptance Criteria:**
  - [ ] All embedded `<script>`, `<iframe>`, and `onload` attributes are permanently stripped.
  - [ ] Safe formatting (code blocks, tables, images, links) renders without corruption.
  - [ ] Automated regression tests verify 0 bypasses against OWASP XSS payload test suites.

---

### BE-097: Video Transcoding & HLS Chunking Pipeline with Signed CloudFront Cookies

- **Category:** Media & Content Delivery
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** Course video lectures hosted as raw MP4 files buffer excessively on slow connections and are easily downloaded by unauthorized users bypassing course enrollment.
- **Specification:** Implement an automated video processing pipeline in `backend/src/workers/videoTranscodingWorker.ts`. Transcode incoming video uploads into HTTP Live Streaming (HLS) multi-bitrate streams (1080p, 720p, 480p) using FFmpeg. Secure stream chunks with AWS CloudFront signed cookies validated against student enrollment records.
- **Files Involved:** `backend/src/workers/videoTranscodingWorker.ts`, `backend/src/routes/media.routes.ts`
- **Acceptance Criteria:**
  - [ ] Videos transcode into adaptive multi-bitrate HLS streams.
  - [ ] Unenrolled users cannot access HLS video segments; returns HTTP 403.
  - [ ] Video playback adapts dynamically to student network bandwidth without buffering.

---

### BE-098: Real-Time Fraud & Anti-Cheat Heuristics Engine for Exercise Submissions

- **Category:** Anti-Cheat & Assessment Integrity
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Students in competitive hackathons can submit plagiarized smart contract code copied directly from course solution repositories or peers.
- **Specification:** Implement a plagiarism detection engine in `backend/src/services/antiCheatService.ts`. Compute normalized Abstract Syntax Tree (AST) token similarity and Levenshtein code distances across student exercise submissions. Flag submissions exceeding 85% structural similarity for instructor review.
- **Files Involved:** `backend/src/services/antiCheatService.ts`, `backend/src/routes/evaluations.routes.ts`, `backend/prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Accurately detects plagiarized code submissions even if variable names or comments are changed.
  - [ ] Flags suspicious similarity scores in the instructor grading dashboard.
  - [ ] Low-latency comparison runs in < 500ms per submitted exercise.

---

### BE-099: OpenAPI 3.1 Specification Drift Detector & Automated Client SDK Generator

- **Category:** Developer Experience & CI/CD
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Backend route modifications frequently desynchronize from the Swagger documentation in `backend/src/config/swagger.serve.ts`, causing frontend developers to work with stale endpoint contracts.
- **Specification:** Build an automated OpenAPI drift detection script in `backend/scripts/verify-openapi-drift.ts`. Parse actual Express route handlers against OpenAPI 3.1 schemas in CI/CD, failing PR builds if new endpoints lack documentation or if schemas mismatch. Automatically generate typed TypeScript client SDKs upon successful mainnet deployments.
- **Files Involved:** `backend/src/config/swagger.serve.ts`, `backend/scripts/verify-openapi-drift.ts`, `.github/workflows/ci.yml`
- **Acceptance Criteria:**
  - [ ] CI pipeline detects and halts PRs with undocumented or mismatched API endpoints.
  - [ ] Interactive Swagger UI at `/api/docs` reflects 100% of available backend endpoints.
  - [ ] Automatically compiles and publishes typed TypeScript client models.

---

### BE-100: Production Zero-Downtime Blue-Green Deployment & Canary Traffic Router

- **Category:** DevOps & Release Engineering
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Deploying backend updates directly to production risks cascading service downtime if unexpected bugs occur under real user traffic.
- **Specification:** Author an automated Blue-Green Canary deployment pipeline in `.github/workflows/production-deploy.yml` and Kubernetes ingress manifests. Route 5% of production traffic to Canary pods, monitor Prometheus error rates and latency for 10 minutes, and automatically roll back traffic to the Blue cluster if error rates exceed 0.1%.
- **Files Involved:** `.github/workflows/production-deploy.yml`, `k8s/canary-ingress.yaml`, `scripts/canary-verifier.sh`
- **Acceptance Criteria:**
  - [ ] Deployments shift traffic gradually: 5% -> 25% -> 50% -> 100% over 20 minutes.
  - [ ] Elevated error rates (> 0.1%) trigger instant automated rollback to stable pods within 30s.
  - [ ] Zero dropped connections or user downtime during production version upgrades.

---

# Part 3: Soroban Smart Contracts, Formal Invariants & Protocol Security

### SC-051: Cargo Workspace Reconciliation: Inclusion or Archival of Orphan Crates

- **Category:** Workspace Architecture & Compilation
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** `contracts/flash_loan_provider` and `contracts/yield_farming` exist in the repository but are omitted from both `workspace.members` and `workspace.exclude` in `contracts/Cargo.toml`. Running `cargo check` in either directory crashes with Cargo error 101, breaking automated developer builds.
- **Specification:** Reconcile `contracts/Cargo.toml`. Either add `flash_loan_provider` and `yield_farming` to `workspace.exclude` (if archived) or fully implement them and register them into `workspace.members`. Ensure `cargo check --workspace --tests` builds every contract in the repository cleanly.
- **Files Involved:** `contracts/Cargo.toml`, `contracts/flash_loan_provider/Cargo.toml`, `contracts/yield_farming/Cargo.toml`
- **Acceptance Criteria:**
  - [ ] `cargo check --workspace --tests` builds 100% of repository crates without workspace membership errors.
  - [ ] No orphan crates exist in the `contracts/` directory hierarchy.
  - [ ] Clean Cargo profile inheritance without non-root package profile warnings.

---

### SC-052: Complete Re-Engineering of `FlashLoanProvider` with Receiver Callback Trait

- **Category:** DeFi & Protocol Security
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `contracts/flash_loan_provider/src/lib.rs` is non-functional: it transfers tokens to the borrower and immediately attempts to pull `amount + fee` back without invoking any borrower execution hook. The borrower gets no opportunity to utilize borrowed funds, and `borrower.require_auth()` is completely omitted.
- **Specification:** Implement a production-grade flash loan protocol adhering to the FlashLoanReceiver specification. 1) Record pre-loan pool balance. 2) Transfer `amount` to receiver. 3) Invoke `receiver.execute_operation(caller, token, amount, fee, params)`. 4) Assert that post-loan token balance is $\ge \text{pre-loan balance} + \text{fee}$. 5) Enforce reentrancy locks in temporary storage.
- **Files Involved:** `contracts/flash_loan_provider/src/lib.rs`, `contracts/flash_loan_provider/src/receiver.rs`, `contracts/flash_loan_provider/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Receiver contract executes custom arbitrage/liquidation logic before repayment is asserted.
  - [ ] Failure to repay exact principal plus fee in the same transaction envelope reverts the entire call.
  - [ ] Temporary storage reentrancy mutex prevents reentrant borrowing loops.

---

### SC-053: Production Staking & Yield Farming Contract: User Accounting, Unstaking & Rewards

- **Category:** DeFi & Staking Protocols
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `contracts/yield_farming/src/lib.rs` permanently locks funds: it lacks `unstake()`, `withdraw()`, or `claim_reward()` entrypoints, does not track individual user balances (only a global counter), and permits unauthenticated `initialize()` front-running.
- **Specification:** Completely rewrite `YieldFarmingPool` using the Synthetix/UniSwap staking reward algorithm. Track user balances individually via `DataKey::UserStake(Address)`. Implement `stake(user, amount)`, `unstake(user, amount)`, and `claim_rewards(user)`. Calculate time-weighted accrued rewards per token with checked integer math.
- **Files Involved:** `contracts/yield_farming/src/lib.rs`, `contracts/yield_farming/src/math.rs`, `contracts/yield_farming/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Users can stake tokens, accrue pro-rata rewards per second, and withdraw principal at any time.
  - [ ] `user.require_auth()` and `admin.require_auth()` strictly enforced across all mutating methods.
  - [ ] Storage entries implement automated TTL extension on interaction.

---

### SC-054: Real Token Asset Integration in `PaymentGateway` via Soroban Token Interface

- **Category:** Payments & Financial Integrity
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `contracts/payment_gateway/src/lib.rs` implements simulated accounting: `deposit(env, user, amount)` and `withdraw(env, user, amount)` manipulate integer storage values without ever transferring actual Soroban tokens (`token::Client::transfer` is never called). Any caller can mint infinite payment balances out of thin air.
- **Specification:** Refactor `PaymentGateway` to accept a registered payment token address (`token: Address`). In `deposit()`, call `token::Client::new(&env, &token).transfer(&user, &env.current_contract_address(), &amount)`. In `withdraw()`, transfer tokens from contract to user. Ensure total deposited tracking equals actual contract token balance.
- **Files Involved:** `contracts/payment_gateway/src/lib.rs`, `contracts/payment_gateway/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Deposits transfer real SEP-41 tokens from caller to contract address.
  - [ ] Fake balance minting is impossible; contract enforces token balance conservation.
  - [ ] Comprehensive test suite verifies real token transfers using `env.register_stellar_asset_contract`.

---

### SC-055: MultiSig Wallet Execution Engine: External Contract Dispatch & Storage De-sharding

- **Category:** Governance & Smart Wallets
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** In `contracts/multisig_wallet_timelock/src/lib.rs`: 1) `execute_proposal()` contains a commented-out stub `// Execute transaction logic here` and performs no external call. 2) Storing all proposals in a single instance storage `Map<u32, Proposal>` will exceed Soroban's 64KB storage entry ceiling as proposals accumulate.
- **Specification:** De-shard proposals into individual persistent keys: `DataKey::Proposal(u32)`. In `execute_proposal()`, execute the scheduled action using `env.invoke_contract::<Val>(&to, &function_symbol, args)` or transfer token funds. Implement `AlreadyInitialized` guards and migrate reentrancy lock to temporary storage.
- **Files Involved:** `contracts/multisig_wallet_timelock/src/lib.rs`, `contracts/multisig_wallet_timelock/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Executing an approved proposal invokes target contract functions with arguments.
  - [ ] Proposals scale to thousands without exceeding Soroban 64KB storage size limits.
  - [ ] Reentrancy guard uses temporary storage; `initialize` cannot be called multiple times.

---

### SC-056: Comprehensive Storage TTL Management & Automated Ledger Bump Architecture

- **Category:** State Lifecycle & Storage Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** On Soroban mainnet, instance and persistent storage entries have limited lifetimes. Contracts like `lending_pool`, `payment_gateway`, `dao_governance`, and `multisig_wallet_timelock` write persistent data without ever calling `extend_ttl`, risking catastrophic state archival and permanently bricked funds.
- **Specification:** Integrate a standardized storage lifetime manager across all member contracts. Define constants: `TTL_THRESHOLD = 100_000` ledgers (~6 days) and `TTL_BUMP = 500_000` ledgers (~30 days). On every state read/write entrypoint, invoke `env.storage().instance().extend_ttl(...)` and `env.storage().persistent().extend_ttl(...)` with floor semantics.
- **Files Involved:** `contracts/lending_pool/src/lib.rs`, `contracts/payment_gateway/src/lib.rs`, `contracts/dao_governance/src/lib.rs`, `contracts/src/storage_ttl.rs`
- **Acceptance Criteria:**
  - [ ] Every mutating and view transaction extends persistent storage TTL automatically.
  - [ ] Storage entries never expire or enter archived state under regular protocol use.
  - [ ] Unit tests assert TTL bump thresholds using `env.ledger().with_mut(...)`.

---

### SC-057: Proxy Upgrade Policy Alignment: Preservation of 48-Hour Timelock Across V1/V2

- **Category:** Upgradability & Governance Security
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** While `contracts/proxy/src/lib.rs` enforces a strict 48-hour timelock and multi-sig voting for upgrades, `contracts/implementation_v1/src/lib.rs` defines a direct `upgrade_to(env, caller, new_implementation)` without delay. Once upgraded to V1, any admin can bypass the governance timelock and upgrade the contract instantly.
- **Specification:** Harmonize implementation contracts with the proxy governance policy. Remove unilateral `upgrade_to` from implementation crates. Ensure contract bytecode upgrades can only be executed by passing through the timelocked proposal and multi-sig approval ceremony defined in the security council governance proxy.
- **Files Involved:** `contracts/proxy/src/lib.rs`, `contracts/implementation_v1/src/lib.rs`, `contracts/implementation_v2/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Instant administrative upgrades without timelock are strictly prohibited.
  - [ ] Bytecode updates mandate 48-hour timelock and multi-sig security council consensus.
  - [ ] Preserves storage layout and schema compatibility across V1 to V2 transitions.

---

### SC-058: SDK Modernization: Deprecating `env.events().publish(...)` for `#[contractevent]`

- **Category:** Code Quality & SDK Modernization
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Smart contracts throughout the workspace generate dozens of compiler deprecation warnings due to using deprecated `env.events().publish(...)`. Soroban SDK v28 deprecates raw event publishing in favor of strongly-typed `#[contractevent]` struct annotations.
- **Specification:** Refactor all contract event emissions across `certificate`, `amm`, `contract_events`, `token_migration`, and `cross_chain_client` to declare typed `#[contractevent]` structs. Replace untyped tuple events with structured event objects providing typed topics and data fields.
- **Files Involved:** `contracts/contract_events/src/lib.rs`, `contracts/certificate/src/lib.rs`, `contracts/token_migration/src/lib.rs`, `contracts/cross_chain_client/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] All `soroban_sdk::events::Events::publish` compiler deprecation warnings are resolved.
  - [ ] Event topics and payloads conform to strongly-typed `#[contractevent]` definitions.
  - [ ] Event indexing compatibility is preserved across off-chain indexer decoders.

---

### SC-059: AMM Reentrancy Guard Hardening: Elimination of Duplicate Unlocks

- **Category:** Smart Contract Quality & Security
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `contracts/amm/src/lib.rs`, `add_liquidity` calls `Self::unlock(&env)` twice (lines 263 and 275), reflecting copy-paste oversights, while manual `Self::unlock` calls prior to `panic_with_error!` create maintenance risks if return paths diverge.
- **Specification:** Clean up reentrancy management in `AMMContract`. Remove redundant unlock calls. Enforce that reentrancy guard keys in temporary storage follow RAII patterns or ensure consistent single exit unlocking. Verify that invariants hold at the end of every trade.
- **Files Involved:** `contracts/amm/src/lib.rs`, `contracts/amm/src/invariants.rs`
- **Acceptance Criteria:**
  - [ ] Redundant unlock calls are completely removed.
  - [ ] Reentrancy guard triggers deterministically on reentrant cross-contract token callbacks.
  - [ ] Comprehensive fuzz tests verify that reentrancy mutex state never persists past transaction boundaries.

---

### SC-060: Upgrading `cicd_pipeline` Crate from `soroban-sdk 27.0.6` to `28.0.0`

- **Category:** Dependency Management
- **Difficulty:** Low | **Priority:** High | **ETA:** 0.5 Days
- **Problem Statement:** `contracts/cicd_pipeline/Cargo.toml` is pinned to `soroban-sdk = "27.0.6"`, while the rest of the workspace is standardized on `28.0.0`. This discrepancy causes version conflicts and excludes `cicd_pipeline` from the root workspace manifest.
- **Specification:** Update `contracts/cicd_pipeline/Cargo.toml` dependencies to `soroban-sdk = "28.0.0"`. Resolve any breaking SDK method changes, and re-integrate `cicd_pipeline` into `workspace.members` in `contracts/Cargo.toml`.
- **Files Involved:** `contracts/cicd_pipeline/Cargo.toml`, `contracts/Cargo.toml`, `contracts/cicd_pipeline/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] `cicd_pipeline` dependencies upgraded to `soroban-sdk = "28.0.0"`.
  - [ ] `cicd_pipeline` added to `workspace.members` in `contracts/Cargo.toml`.
  - [ ] `cargo check --package cicd-pipeline` passes cleanly.

---

### SC-061: Soulbound Certificate NFT Transfer Immutability & Multi-Course Batch Minting

- **Category:** NFT & Identity
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Certificate NFTs in `contracts/certificate_nft/src/lib.rs` must be permanently non-transferable (soulbound). Furthermore, issuing certificates individually for large student cohorts incurs excessive gas fees.
- **Specification:** In `contracts/certificate_nft/src/lib.rs`, permanently disable all standard transfer functions (`transfer`, `transfer_from`), reverting with `CertificateNftError::Soulbound`. Implement a batch issuance method `batch_mint(admin, recipients: Vec<Address>, metadata_uris: Vec<String>)` capped at 50 certificates per call.
- **Files Involved:** `contracts/certificate_nft/src/lib.rs`, `contracts/certificate_nft/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Any attempt to transfer, approve, or delegate a soulbound certificate reverts.
  - [ ] `batch_mint` issues up to 50 certificates in a single atomic transaction.
  - [ ] Gas benchmarks demonstrate > 40% reduction in gas per minted certificate in batch mode.

---

### SC-062: Lending Pool Liquidation Incentive Bonding Curve & Bad Debt Socialization

- **Category:** DeFi & Risk Management
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** When market prices drop sharply, liquidators in `contracts/lending_pool` may delay liquidating undercollateralized positions if liquidation bonuses are static, leaving the protocol with accumulated bad debt.
- **Specification:** Implement a dynamic liquidation bonus curve in `contracts/lending_pool/src/liquidation.rs`. As health factor drops below 1.0, scale the liquidation bonus from 5% up to 15% to accelerate liquidation. If an underwater position has zero collateral left, socialize the remaining deficit across protocol reserve funds.
- **Files Involved:** `contracts/lending_pool/src/liquidation.rs`, `contracts/lending_pool/src/lib.rs`, `contracts/lending_pool/src/math.rs`
- **Acceptance Criteria:**
  - [ ] Dynamic bonus increases liquidation priority for deeply undercollateralized accounts.
  - [ ] Bad debt socialization maintains protocol solvency without draining user deposits.
  - [ ] Property-based fuzz tests verify that total protocol assets always exceed total liabilities.

---

### SC-063: Continuous Bonding Curve (Bancor Formula) Precision Math with Taylor Series

- **Category:** Math & Tokenomics
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/continuous_bonding_curve/src/lib.rs` implements fractional reserve pricing using power approximations that suffer from severe integer rounding truncation on small transactions.
- **Specification:** Re-implement the Bancor fractional reserve bonding curve formula ($P = \text{Reserve} / (\text{Supply} \times \text{Weight})$) using an 18-decimal fixed-point Taylor series expansion. Implement safe logarithmic and exponential functions with overflow guards and deterministic rounding down on buy and rounding up on sell.
- **Files Involved:** `contracts/continuous_bonding_curve/src/lib.rs`, `contracts/continuous_bonding_curve/src/math.rs`
- **Acceptance Criteria:**
  - [ ] Token pricing maintains mathematical precision across 18 decimal places without truncation drift.
  - [ ] Reverts gracefully on arithmetic overflow or zero reserve balances.
  - [ ] Comprehensive unit tests assert mathematical parity against reference Python/Wolfram models.

---

### SC-064: Quadratic Voting Sybil-Resistance with Voice Credit Balances & Nullifiers

- **Category:** Governance & Quadratic Voting
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/quadratic_voting/src/lib.rs` allows votes where the cost in voice credits is $\text{Cost} = V^2$. However, without cryptographic nullifier registration, users can split funds across multiple addresses to manipulate voting outcomes.
- **Specification:** Integrate Sybil nullifier tracking into `contracts/quadratic_voting/src/lib.rs`. Require voters to present an authorized zero-knowledge proof or signed identity nullifier from the DID registry. Track spent nullifiers in persistent storage to ensure one real human casts votes from exactly one address per proposal.
- **Files Involved:** `contracts/quadratic_voting/src/lib.rs`, `contracts/quadratic_voting/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Voice credit cost follows strict quadratic formula: $\text{Credits} = (\text{Votes})^2$.
  - [ ] Re-using an identity nullifier reverts with `VotingError::DuplicateIdentity`.
  - [ ] Final proposal tally correctly calculates the sum of square roots of contributed credits.

---

### SC-065: DAO Quorum Decay & Timelocked Proposal Execution Barrier

- **Category:** Governance & DAOs
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `contracts/dao_governance/src/lib.rs`, proposals passing with slim margins can be executed immediately, leaving token holders no time to exit if a malicious proposal passes during off-hours.
- **Specification:** Implement dynamic quorum decay and an execution timelock in `contracts/dao_governance/src/lib.rs`. Enforce a mandatory 48-hour timelock between proposal voting closure and execution. Scale quorum dynamically based on historical participation, requiring higher quorum (30%) for treasury actions vs standard parameters (15%).
- **Files Involved:** `contracts/dao_governance/src/lib.rs`, `contracts/dao_governance/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Proposals require minimum quorum to be considered valid upon voting deadline.
  - [ ] Passing proposals must wait 48 hours in the execution queue before execution can be triggered.
  - [ ] Any token holder can cancel execution if an administrative veto or critical security pause is triggered.

---

### SC-066: Decentralized Identifier (DID) Registry with W3C Compliance and Key Rotation

- **Category:** Identity & Compliance
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/did_registry/src/lib.rs` stores non-standard identity documents that fail W3C Decentralized Identifier standards, hindering interoperability with external Verifiable Credential ecosystems.
- **Specification:** Upgrade `did_registry` to conform strictly to the W3C `did:stellar` and `did:soroban` method specifications. Implement cryptographic key rotation: students can rotate verification public keys by presenting an authorization signature from their recovery key.
- **Files Involved:** `contracts/did_registry/src/lib.rs`, `contracts/did_registry/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Generates and resolves compliant W3C DID documents containing verification methods and service endpoints.
  - [ ] Key rotation replaces signing keys while preserving historical DID identifier stability.
  - [ ] Rejects unauthorized modification attempts with typed `DidError::Unauthorized`.

---

### SC-067: Fractional NFT Vault Vickrey Auction Slashing for Unrevealed Bids

- **Category:** Auction & NFT Vault
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `contracts/fractional_nft_vault/src/lib.rs`, during commit-reveal Vickrey auctions, malicious bidders can commit high bids to scare away competing bidders and simply refuse to reveal their bid, stalling the buyout auction without penalty.
- **Specification:** Implement deposit slashing in `contracts/fractional_nft_vault/src/lib.rs`. Require bidders to lock an anti-spam deposit (e.g. 10% of minimum bid) during the commit phase. If a bidder fails to reveal their bid before the reveal phase deadline, forfeit and slash their deposit into the vault buyout treasury.
- **Files Involved:** `contracts/fractional_nft_vault/src/lib.rs`, `contracts/fractional_nft_vault/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Unrevealed bids have their deposit slashed and distributed pro-rata to vault fractional share holders.
  - [ ] Valid reveals return the deposit and escrow the true bid amount.
  - [ ] Highest revealed bidder wins the NFT and pays the second-highest bid price (Vickrey second-price).

---

### SC-068: Cross-Chain Verification Client with Ed25519 Light-Client Header Proofs

- **Category:** Cross-Chain & Cryptography
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/cross_chain_client/src/lib.rs` relies on single relayer reports, creating a centralized vector where a compromised relayer can fabricate cross-chain asset bridges.
- **Specification:** Implement a light-client verification module in `cross_chain_client`. Validate block headers signed by a quorum (e.g. 2/3 + 1) of validator public keys. Verify Merkle Patricia Trie proofs of transaction inclusion on the source chain before releasing bridged assets on Soroban.
- **Files Involved:** `contracts/cross_chain_client/src/lib.rs`, `contracts/cross_chain_client/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Rejects cross-chain transactions lacking valid validator threshold signatures.
  - [ ] Validates Merkle inclusion proofs directly in contract logic.
  - [ ] Implements replay protection tracking source chain chain-id and transaction nonces.

---

### SC-069: Peer-Review Reward Distribution with Consensus-Weighted Scoring

- **Category:** Governance & Peer Review
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** In `contracts/peer_review/src/lib.rs`, reviewers who award random grades to farm review rewards are rewarded equally with reviewers who provide diligent, thorough assessments.
- **Specification:** Implement a consensus-scoring algorithm in `contracts/peer_review/src/lib.rs`. Calculate the median grade awarded to a student exercise. Reviewers whose evaluations fall within $\pm 10\%$ of the consensus median receive full reward payouts; outliers receive degraded rewards, and deliberate trolls are slashed.
- **Files Involved:** `contracts/peer_review/src/lib.rs`, `contracts/peer_review/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Diligent reviewers aligned with peer consensus receive maximum reward token allocations.
  - [ ] Extreme outlier reviews (> 2 standard deviations) receive zero rewards and lose reviewer reputation score.
  - [ ] Calculations utilize fixed-point arithmetic preventing decimal rounding theft.

---

### SC-070: Payment Streaming Protocol with Per-Second Vesting and Cancellation Escrow

- **Category:** DeFi & Payments
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Student research grants and mentor retainers paid upfront risk non-delivery, while manual monthly payments incur administrative overhead and transaction fees.
- **Specification:** Author a payment streaming contract in `contracts/payment_streaming/src/lib.rs`. Senders deposit tokens to create a stream with `start_time`, `stop_time`, and `rate_per_second`. Beneficiaries can withdraw accrued vested tokens per second at any time. Senders can pause or cancel streams, refunding unvested tokens immediately.
- **Files Involved:** `contracts/payment_streaming/src/lib.rs`, `contracts/payment_streaming/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Beneficiary withdraws accrued tokens calculated linearly per second: $V = \text{rate} \times (T_{\text{now}} - T_{\text{start}})$.
  - [ ] Cancelling a stream returns 100% of unvested tokens to sender and vests accrued tokens to recipient.
  - [ ] Token balance invariant ($\text{contract balance} == \sum \text{unwithdrawn active stream balances}$) holds at all times.

---

### SC-071: Parametric Insurance Pool with Multi-Oracle Trigger & Solvency Invariant

- **Category:** Insurance & Risk Management
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `contracts/parametric_insurance/src/lib.rs`, insurance payouts for hackathon cancellation or testnet RPC outages rely on a single oracle address, creating single-point-of-failure vulnerabilities.
- **Specification:** Refactor `ParametricInsurance` to require multi-oracle consensus (at least 2 out of 3 authorized independent oracles). Implement a strict capital solvency invariant: the total sum of maximum insured payouts across active policies must never exceed pool reserves multiplied by the coverage ratio.
- **Files Involved:** `contracts/parametric_insurance/src/lib.rs`, `contracts/parametric_insurance/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Payout triggers mandate agreement from at least 2 independent oracles within 10 ledgers.
  - [ ] Policy underwriting halts automatically if new coverage would violate pool solvency.
  - [ ] Policyholders receive automated, instantaneous claim payouts upon verified condition fulfillment.

---

### SC-072: Zero-Knowledge Proof Verifier for Groth16 / BN254 Pairings on Soroban

- **Category:** Cryptography & Privacy
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `contracts/zk_proof_verifier/src/lib.rs` uses mock verification logic, preventing real zero-knowledge student identity and credential attestations on-chain.
- **Specification:** Implement an on-chain Groth16 zk-SNARK verifier targeting the BN254 / Alt-bn128 elliptic curve in `contracts/zk_proof_verifier/src/lib.rs`. Verify pairing equations: $e(A, B) = e(\alpha, \beta) \cdot e(x \cdot \gamma, \delta) \cdot e(C, \gamma)$ using optimized Soroban SDK cryptographic primitives and big-integer arithmetic.
- **Files Involved:** `contracts/zk_proof_verifier/src/lib.rs`, `contracts/zk_proof_verifier/src/curve.rs`, `contracts/zk_proof_verifier/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Cryptographically verifies valid Groth16 proofs generated by SnarkJS / Circom.
  - [ ] Rejects tampered, invalid, or replayed proof elements with `ZkError::InvalidProof`.
  - [ ] Gas consumption remains within Soroban CPU budget ceilings (< 500,000 gas units).

---

### SC-073: Storage Key Prefix Namespacing & State Collision Prevention Standard

- **Category:** Smart Contract Architecture
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Several member contracts use plain symbols (`Symbol::new(&env, "admin")`) or simple integer keys for persistent storage, risking key collisions when upgrading implementations or composing contract modules.
- **Specification:** Standardize storage keys across all workspace contracts to use distinct `#[contracttype]` enums (e.g. `DataKey::Balance(Address)`, `DataKey::Proposal(u32)`). Leverage Soroban's XDR serialization which automatically hashes enum discriminants and arguments into collision-proof storage keys.
- **Files Involved:** `contracts/access_control/src/lib.rs`, `contracts/flash_loan_provider/src/lib.rs`, `contracts/yield_farming/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] 100% of workspace contracts use typed `#[contracttype]` enums for all instance/persistent storage keys.
  - [ ] String literals and untyped symbols in storage keys are completely eliminated.
  - [ ] Storage keys cannot collide across modules or upgrade iterations.

---

### SC-074: Contract Circuit-Breaker Emergency Pause Framework with Guardian Hierarchy

- **Category:** Security & Incident Response
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** In the event of an economic exploit or oracle manipulation attack, contracts lack a unified emergency pause framework, forcing administrators to watch funds drain while preparing upgrades.
- **Specification:** Build a reusable circuit-breaker module in `contracts/access_control/src/circuit_breaker.rs`. Provide multi-tier role hierarchy: a designated Guardian address can pause the contract instantaneously (`pause()`), but only the administrative Security Council with timelock can unpause (`unpause()`). Mutating entrypoints check `require_not_paused!()`.
- **Files Involved:** `contracts/access_control/src/circuit_breaker.rs`, `contracts/amm/src/lib.rs`, `contracts/lending_pool/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Guardians can instantaneously pause state-mutating entrypoints during an attack.
  - [ ] Unpausing requires Admin authorization, preventing compromised guardians from unpausing.
  - [ ] Emergency withdrawals for depositors remain functional even when protocol swaps are paused.

---

### SC-075: Smart Vault Automated Harvest & Compound Yield Strategy with Conservation Invariant

- **Category:** DeFi & Vaults
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** In `contracts/smart_vault/src/lib.rs`, compounding staking yields lacks post-condition assertions verifying that total shares accurately reflect deposited assets plus harvested yield.
- **Specification:** Implement automated compounding and harvesting logic in `contracts/smart_vault/src/lib.rs`. When `compound()` is invoked, swap accrued reward tokens for deposit tokens on the AMM, deposit them into the pool, and assert the post-condition invariant: $\text{TotalAssets} \ge \text{TotalPrincipalDeposited}$.
- **Files Involved:** `contracts/smart_vault/src/lib.rs`, `contracts/smart_vault/src/strategy.rs`, `contracts/smart_vault/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Compounding claims rewards and re-deposits into yield pool in an atomic transaction.
  - [ ] Conservation invariant ensures total vault assets always equal or exceed recorded user shares.
  - [ ] Harvest calls protected by reentrancy locks and maximum slippage tolerance bounds.

---

### SC-076: Anti-MEV Commit-Reveal Trade Batcher for AMM Swap Transactions

- **Category:** MEV Protection & AMM
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Public AMM transactions on decentralized exchanges are vulnerable to predatory MEV searchers sandwiching student trades (front-running with buy, back-running with sell).
- **Specification:** Build an anti-MEV batching mechanism in `contracts/amm/src/anti_mev.rs`. Bidders commit cryptographically blinded swap orders (`sha256(order || secret)`) in Block $N$, and reveal the order in Block $N+1$. All swaps within the batch execute at a single uniform clearing price, eliminating front-running and sandwiching.
- **Files Involved:** `contracts/amm/src/anti_mev.rs`, `contracts/amm/src/lib.rs`, `contracts/amm/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Same-block front-running and sandwich attacks are mathematically eliminated.
  - [ ] Orders within the batch settle at identical fair clearing prices.
  - [ ] Unrevealed commitments expire safely without blocking subsequent pool trades.

---

### SC-077: Time-Weighted Average Price (TWAP) Oracle Geometric Mean Calculator

- **Category:** Oracles & DeFi Math
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Flash-loan price manipulation can skew spot prices in `contracts/amm/src/lib.rs`, enabling attackers to manipulate lending pool collateral valuations within a single transaction.
- **Specification:** Implement a cumulative Time-Weighted Average Price (TWAP) oracle in `contracts/amm/src/twap.rs`. Accumulate price ratios multiplied by elapsed ledger time: $P_{\text{cum}} += P_{\text{spot}} \times \Delta t$. Expose a view function calculating the geometric mean TWAP over configurable 30-minute observation windows with volatility guards.
- **Files Involved:** `contracts/amm/src/twap.rs`, `contracts/amm/src/lib.rs`, `contracts/lending_pool/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Spot price manipulations within the same block have negligible effect on TWAP price feeds.
  - [ ] Lending pool uses TWAP price feeds rather than spot AMM prices for liquidation evaluations.
  - [ ] Overflow-safe math handles multi-year price accumulation without overflow panics.

---

### SC-078: Token Migration Bridge with One-Way Burn-and-Mint & Merkle Snapshots

- **Category:** Tokenomics & Migration
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Migrating legacy student lab tokens to modern SEP-41 standard tokens in `contracts/token_migration/src/lib.rs` risks double-claiming if users deposit tokens across multiple accounts without burn proofs.
- **Specification:** Implement an immutable one-way token migration bridge in `contracts/token_migration/src/lib.rs`. Require users to burn legacy tokens, emitting an on-chain burn event, or verify against a cryptographically anchored Merkle snapshot of legacy ledger balances before minting modern tokens 1:1.
- **Files Involved:** `contracts/token_migration/src/lib.rs`, `contracts/token_migration/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Legacy tokens are permanently burned; modern tokens minted at exact 1:1 parity.
  - [ ] Spent Merkle snapshot claims tracked via persistent bit-packed nullifiers preventing double-minting.
  - [ ] Total migrated tokens cannot exceed initial legacy token supply cap.

---

### SC-079: Multi-Token Payment Splitter Decimal Rounding Remediation & Dust Sweeper

- **Category:** Payments & Precision Math
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `contracts/payment_gateway/src/payment_splitter.rs`, integer division truncation during proportional share allocations (`total_received * share / total_shares`) leaves unwithdrawable dust tokens permanently stranded in the contract.
- **Specification:** Update `PaymentSplitter` arithmetic. Track unallocated fractional dust remainders in a dedicated reserve pool. Provide an administrative `sweep_dust(token, destination)` entrypoint callable only when all beneficiary shares have been fully settled, redirecting dust to protocol reserves.
- **Files Involved:** `contracts/payment_gateway/src/payment_splitter.rs`, `contracts/payment_gateway/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Proportional splits allocate funds with maximum possible integer precision.
  - [ ] Beneficiaries pull exact owed allocations without leaving unaccounted balances.
  - [ ] Zero unhandled division-by-zero panics when `total_shares == 0`.

---

### SC-080: Cross-Contract Reentrancy Guard Using Temporary Storage Floor Semantics

- **Category:** Reentrancy & Security
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Reentrancy guards using persistent or instance storage write unnecessary data to permanent ledger state, wasting developer fees and leaving lingering locks if a transaction execution path aborts without unlocking.
- **Specification:** Standardize reentrancy protection across all contracts using Soroban's native `env.storage().temporary()`. Temporary storage is automatically discarded at the close of the ledger transaction frame, ensuring locks never persist across separate transactions while strictly blocking reentrancy within the same transaction envelope.
- **Files Involved:** `contracts/src/reentrancy_guard.rs`, `contracts/amm/src/lib.rs`, `contracts/lending_pool/src/lib.rs`, `contracts/multisig_wallet_timelock/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Reentrant calls within the same transaction frame revert with `ReentrancyGuardTriggered`.
  - [ ] Locks automatically clear at transaction frame end without incurring persistent storage fees.
  - [ ] Standardized macro `guard_reentrancy!(env)` applied across all external token call sites.

---

### SC-081: Hackathon Team Formation & Prize Escrow Contract with Multi-Judge Threshold

- **Category:** Hackathons & Escrow
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** In `contracts/hackathon-team-matching/src/lib.rs`, prize payouts for student hackathons rely on a single organizer key, creating counterparty risk where organizers can abscond with student prize pools.
- **Specification:** Build a multi-judge prize escrow contract. Sponsors deposit prize bounties into timelocked escrow. A panel of 5 judges grades hackathon projects. Prize payouts require digital signature thresholds from at least 3 out of 5 judges confirming final leaderboard standings.
- **Files Involved:** `contracts/hackathon-team-matching/src/lib.rs`, `contracts/hackathon-team-matching/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Sponsor prize pools are locked in escrow until the hackathon evaluation deadline passes.
  - [ ] Releasing prizes mandates cryptographic approval from at least 3 authorized judge keypairs.
  - [ ] If hackathon is cancelled prior to submissions, sponsors can reclaim escrowed funds.

---

### SC-082: Content Management System Storage Archival & Content-Hash Verification

- **Category:** CMS & Content Integrity
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** In `contracts/content_management_system/src/lib.rs`, storing large markdown course syllabi directly on-chain consumes excessive storage rent fees and bloats ledger state.
- **Specification:** Refactor `content_management_system` to store 32-byte cryptographic content hashes (`SHA256(content)`) and IPFS CID pointers rather than raw text. When updating or publishing courses, emit on-chain verification events and extend storage TTL automatically.
- **Files Involved:** `contracts/content_management_system/src/lib.rs`, `contracts/content_management_system/src/storage.rs`, `contracts/content_management_system/src/test.rs`
- **Acceptance Criteria:**
  - [ ] On-chain footprint is reduced from kilobytes to a single 32-byte SHA-256 hash per lesson.
  - [ ] Verification method confirms off-chain lesson markdown matches on-chain content hash.
  - [ ] Storage rent consumption decreases by > 90%.

---

### SC-083: Course Completion Soulbound Achievement Attestation with ZK Skill Verification

- **Category:** Identity & ZK Attestation
- **Difficulty:** Advanced | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** Certificates publicly expose which specific student completed which course, violating student privacy laws in jurisdictions where educational records must remain confidential.
- **Specification:** Build a private credential attestation contract in `contracts/certificate/src/zk_attestation.rs`. Issue certificates as blinded zero-knowledge commitments (`sha256(student_secret || course_id)`). Students prove they hold a passing certificate using ZK-SNARK proofs without revealing their real name or student ID.
- **Files Involved:** `contracts/certificate/src/zk_attestation.rs`, `contracts/certificate/src/lib.rs`, `contracts/zk_proof_verifier/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Students can prove credential ownership to third-party employers without revealing personal identity.
  - [ ] Verification executes in < 300,000 gas units on-chain.
  - [ ] Revoked certificates invalidate the corresponding ZK nullifier proof.

---

### SC-084: Automated Gas Benchmark Tracking with CI Pipeline Regression Gate (< 100k Gas)

- **Category:** Benchmarking & Gas Optimization
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Contract updates frequently introduce unoptimized data structures and redundant storage reads without developers realizing the impact on transaction execution gas fees.
- **Specification:** Author an automated gas benchmarking test harness in `contracts/gas_benchmarks/src/lib.rs` and `.github/workflows/gas-benchmarks.yml`. Track CPU and memory instruction counts for core user journeys (mint certificate, swap AMM, borrow lending pool), failing CI pull requests if gas consumption regresses by more than 5%.
- **Files Involved:** `contracts/gas_benchmarks/src/lib.rs`, `contracts/gas_benchmarks/Cargo.toml`, `.github/workflows/gas-benchmarks.yml`
- **Acceptance Criteria:**
  - [ ] Generates deterministic gas report comparing PR gas benchmarks against main branch baseline.
  - [ ] Pull requests causing > 5% gas regression automatically fail CI check gates.
  - [ ] Certificate verification gas budget stays strictly under 100,000 gas units.

---

### SC-085: Native Soroban Faucet Integration with Sybil-Proof Dripping Rate-Limiter

- **Category:** Testnet Infrastructure
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** `contracts/testnet_faucet_integration/src/lib.rs` allows arbitrary accounts to drain faucet reserve tokens in automated loops, leaving real students without testnet tokens for exercises.
- **Specification:** Implement a sliding-window rate limiter in `contracts/testnet_faucet_integration/src/lib.rs`. Enforce a maximum drip amount of 100 tokens every 24 hours per recipient address. Store drip timestamps in persistent storage with automated TTL extensions, and require valid student identity verification.
- **Files Involved:** `contracts/testnet_faucet_integration/src/lib.rs`, `contracts/testnet_faucet_integration/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Drip requests within the 24-hour cooldown period revert with `FaucetError::RateLimited`.
  - [ ] Maximum drip amount strictly enforced at 100 tokens per transaction.
  - [ ] Admin can replenish faucet reserves or update rate limit cooldown periods.

---

### SC-086: Dead-Shares First-Liquidity Burn Pattern Enforcement Across Pool Share Tokens

- **Category:** AMM & Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Standard AMM implementations are vulnerable to the "first depositor inflation exploit" where an attacker deposits 1 wei of liquidity, donates a large balance to the pool, and inflates share prices to steal subsequent user deposits via rounding errors.
- **Specification:** Mandate dead-share burning in `contracts/amm/src/lib.rs` and `contracts/amm/src/lp_token.rs`. When the very first liquidity deposit is executed, permanently mint and lock the first 1,000 shares (`DEAD_SHARES = 1000`) into address `0x0` or contract custody, establishing a non-zero denominator that mathematically neutralizes share inflation exploits.
- **Files Involved:** `contracts/amm/src/lib.rs`, `contracts/amm/src/lp_token.rs`, `contracts/amm/src/test.rs`
- **Acceptance Criteria:**
  - [ ] First liquidity deposit permanently burns 1,000 dead shares.
  - [ ] Subsequent deposits calculate fair share allocations without integer truncation vulnerability.
  - [ ] Unit tests prove share price inflation attack is economically unfeasible.

---

### SC-087: Multi-Asset Collateral Lending Pool with Cross-Margin & Health Factor Alerts

- **Category:** DeFi & Lending
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** `contracts/lending_pool` only supports isolated single-asset collateral, forcing students to manage multiple disconnected borrow positions rather than utilizing cross-margin collateral efficiency.
- **Specification:** Enhance `contracts/lending_pool/src/lib.rs` to support cross-margin collateral accounting. Sum the risk-weighted collateral valuations across all deposited assets: $\text{TotalCollateral} = \sum (\text{Balance}_i \times \text{Price}_i \times \text{LTV}_i)$. Evaluate borrow health factors holistically across the user's multi-token portfolio.
- **Files Involved:** `contracts/lending_pool/src/lib.rs`, `contracts/lending_pool/src/interest.rs`, `contracts/lending_pool/src/math.rs`
- **Acceptance Criteria:**
  - [ ] Users can deposit diverse collateral tokens (XLM, USDC, EURC) backing a single debt position.
  - [ ] Health factor evaluates accurately across multi-asset collateral portfolios.
  - [ ] Liquidators can seize user-selected collateral up to the liquidatable debt value.

---

### SC-088: Security Council Emergency Multi-Sig Override with Hardware Timelock

- **Category:** Governance & Emergency Response
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** If a critical zero-day exploit is discovered on mainnet, waiting 48 hours for standard timelocked governance could allow an attacker to drain millions in protocol value.
- **Specification:** Build a Security Council Emergency Override module in `contracts/proxy/src/security_council.rs`. If a unanimous 5-out-of-5 signature threshold from designated security council hardware keys is presented, permit instant emergency protocol pausing and targeted parameter adjustments, bypassing standard timelock delays.
- **Files Involved:** `contracts/proxy/src/security_council.rs`, `contracts/proxy/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Unanimous 5-of-5 security council consensus can trigger instantaneous emergency circuit breaking.
  - [ ] Non-unanimous attempts (4-of-5 or fewer) must adhere to standard 48-hour timelock delays.
  - [ ] All emergency actions emit high-priority security audit events on-chain.

---

### SC-089: Non-Fungible Royalty Standard (SEP-0029) Enforcement on Secondary Sales

- **Category:** NFTs & Royalties
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Secondary marketplace sales of achievement NFTs in `contracts/fractional_nft_vault` do not enforce creator royalties, depriving student artists and open-source contributors of secondary revenue.
- **Specification:** Implement the Stellar NFT Royalty Standard (SEP-0029) in `contracts/certificate/src/lib.rs` and `contracts/fractional_nft_vault/src/lib.rs`. Expose `royalty_info(token_id, sale_price) -> (Address, i128)` returning the configured royalty recipient and cut in basis points (capped at 10% / 1,000 bps).
- **Files Involved:** `contracts/certificate/src/lib.rs`, `contracts/fractional_nft_vault/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] Exposes standardized `royalty_info` interface matching SEP-0029 specification.
  - [ ] Royalty basis points are strictly capped below `MAX_ROYALTY_BPS` (1,000 bps).
  - [ ] Buyout auctions automatically distribute royalty cuts to creator addresses before disbursing net proceeds.

---

### SC-090: PR Simulation Exercise State Machine with Deterministic Step Verification

- **Category:** Interactive Education & Simulation
- **Difficulty:** Hard | **Priority:** Medium | **ETA:** 2 Days
- **Problem Statement:** `contracts/pr_simulation/src/lib.rs` uses loose state transitions, allowing students to skip interactive exercise steps or complete git PR workflow simulations out of order.
- **Specification:** Author a strict finite state machine in `contracts/pr_simulation/src/lib.rs`. Enforce sequential step transitions: `Initialized` -> `BranchCreated` -> `CommitAuthored` -> `PrOpened` -> `CiChecksPassed` -> `Approved` -> `Merged`. Revert any attempt to skip steps or merge unreviewed pull requests.
- **Files Involved:** `contracts/pr_simulation/src/lib.rs`, `contracts/pr_simulation/src/test.rs`
- **Acceptance Criteria:**
  - [ ] State transitions enforce strict chronological progression through the simulated PR workflow.
  - [ ] Submitting invalid commit hashes or unapproved PRs reverts with typed simulation errors.
  - [ ] Completion of the simulation mints an on-chain course contribution verification badge.

---

### SC-091: High-Precision Math Library (`FixedPoint128`): Safe `mul_div` and Directional Rounding

- **Category:** Math & Security
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** DeFi smart contracts across the workspace implement ad-hoc division and multiplication, leading to subtle precision loss and rounding vulnerabilities exploitable by flash-loan arbitrageurs.
- **Specification:** Implement an enterprise-grade fixed-point math library in `contracts/src/math.rs`. Support 128-bit fixed-point numbers with 18 decimal places of precision (`WAD = 10^18`). Implement full 256-bit intermediate multiplication `mul_div(a, b, c)` and directional rounding controls (`RoundUp` vs `RoundDown`).
- **Files Involved:** `contracts/src/math.rs`, `contracts/amm/src/math.rs`, `contracts/lending_pool/src/math.rs`
- **Acceptance Criteria:**
  - [ ] Computes `(a * b) / c` without intermediate overflow even when `a * b` exceeds `i128::MAX`.
  - [ ] Directional rounding options prevent protocol reserve leakage during deposits and withdrawals.
  - [ ] Passes extensive property-based test suites across millions of edge-case numeric ranges.

---

### SC-092: Verifiable Random Function (VRF) Consumer Contract with Cryptographic Seed

- **Category:** Randomness & Oracles
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/commit_reveal_rng/src/lib.rs` uses commit-reveal mechanisms that require two separate transactions, causing high latency for hackathon tie-breakers and NFT minting lotteries.
- **Specification:** Create an on-chain Verifiable Random Function (VRF) verification module in `contracts/commit_reveal_rng/src/vrf.rs`. Cryptographically verify Ed25519 VRF proofs output by authorized oracle beacons, asserting proof validity against the oracle's public key and request seed in a single atomic transaction.
- **Files Involved:** `contracts/commit_reveal_rng/src/vrf.rs`, `contracts/commit_reveal_rng/src/lib.rs`, `contracts/commit_reveal_rng/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Single-transaction verified randomness without multi-block commit-reveal delays.
  - [ ] Rejects forged or mismatched VRF proofs with `RngError::InvalidProof`.
  - [ ] Generated random integers are mathematically unpredictable and bias-resistant.

---

### SC-093: Merkle Airdrop Distributor with Bit-Packed Bitmap Claim Tracking

- **Category:** Token Distribution & Scalability
- **Difficulty:** Hard | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Distributing achievement reward tokens individually to 10,000 students on-chain costs thousands of dollars in gas and bloats contract storage with individual claimed boolean flags.
- **Specification:** Implement a gas-optimized Merkle Airdrop Distributor contract in `contracts/smart_vault/src/merkle_distributor.rs`. Anchor a single 32-byte Merkle root representing all eligible recipients and token allocations. Track spent claims using a bit-packed `u128` bitmap, consuming only 1 bit per recipient.
- **Files Involved:** `contracts/smart_vault/src/merkle_distributor.rs`, `contracts/smart_vault/src/bitmap.rs`, `contracts/smart_vault/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Inclusion proofs verify in $O(\log N)$ time, consuming minimal gas (< 50,000 units).
  - [ ] Bit-packed bitmap storage prevents double-claiming with 1 bit per student allocation.
  - [ ] Unclaimed tokens can be reclaimed by protocol treasury after 90-day window expires.

---

### SC-094: Comprehensive Invariant Fuzz Testing Suite with `proptest` and `cargo-fuzz`

- **Category:** Formal Testing & Verification
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Unit tests only exercise anticipated happy-path and error cases, missing edge-case state machine exploits and arithmetic overflows that appear during mainnet operation.
- **Specification:** Implement a property-based fuzz testing suite using `proptest` across all core member crates in `contracts/automated_testing_suite/`. Define and fuzz test core protocol invariants: constant-product $k_1 \ge k_0$ in AMM, collateral solvency in Lending, and share conservation in Vaults across millions of random operations.
- **Files Involved:** `contracts/automated_testing_suite/src/lib.rs`, `contracts/amm/tests/fuzz_amm.rs`, `contracts/lending_pool/tests/fuzz_lending.rs`
- **Acceptance Criteria:**
  - [ ] AMM invariant $k_1 \ge k_0$ holds across 1,000,000 randomized continuous trade actions.
  - [ ] Lending pool solvency invariant ($\text{assets} \ge \text{liabilities}$) is never violated.
  - [ ] Zero unhandled arithmetic panics, memory corruption, or assertion failures across fuzzing runs.

---

### SC-095: Formal Verification of AMM and Lending Pool State Machines using Kani

- **Category:** Formal Verification
- **Difficulty:** Advanced | **Priority:** Critical | **ETA:** 2 Days
- **Problem Statement:** Traditional unit and fuzz testing cannot mathematically prove that subtle rounding bugs or state desynchronization exploits are completely impossible in smart contracts.
- **Specification:** Model check core contract functions in `contracts/amm` and `contracts/lending_pool` using the Kani Rust Model Checker (formal verification tool based on CBMC). Formally verify that state transitions never panic, integer overflows cannot occur, and pool reserves never drop below total user equity.
- **Files Involved:** `contracts/amm/src/verification.rs`, `contracts/lending_pool/src/verification.rs`
- **Acceptance Criteria:**
  - [ ] Kani formal verifier mathematically proves absence of integer overflow across all reachable inputs.
  - [ ] Proves that reserve conservation invariants hold unconditionally.
  - [ ] Formally verified contracts export mathematical proof certificates into documentation.

---

### SC-096: Soroban Native Auth Invoker Framework Refactor: Complete Elimination of Custom Signatures

- **Category:** Stellar Protocol & Security
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Custom signature verification logic in contract code bypasses Soroban's native authorization framework, introducing signature malleability risks and breaking multisig account compatibility.
- **Specification:** Refactor all contract authorization routines across `certificate`, `payment_gateway`, `dao_governance`, and `lending_pool` to exclusively utilize native Soroban authentication: `caller.require_auth()` and `caller.require_auth_for_args(...)`. Eliminate all legacy custom signature parsing and ed25519 payload verification routines.
- **Files Involved:** `contracts/auth_checker/src/lib.rs`, `contracts/certificate/src/lib.rs`, `contracts/dao_governance/src/lib.rs`, `contracts/payment_gateway/src/lib.rs`
- **Acceptance Criteria:**
  - [ ] 100% adoption of native `Address::require_auth` across all public mutating entrypoints.
  - [ ] Eliminates all custom cryptographic signature parsing susceptible to malleability.
  - [ ] Contracts natively support Smart Wallets, multisig signers, and passkey invocations.

---

### SC-097: Upgradeable Course Proxy with Immutable Initialization Barrier & Schema Migration

- **Category:** Proxy Architecture & Upgradability
- **Difficulty:** Hard | **Priority:** High | **ETA:** 2 Days
- **Problem Statement:** `contracts/course_proxy/src/lib.rs` lacks structured storage versioning. Upgrading implementation logic risks corrupting student course progress data if storage schemas diverge.
- **Specification:** Enhance `contracts/course_proxy/src/lib.rs`. Implement a monotonically increasing storage version marker (`storage_version: u32`). Enforce an atomic schema migration hook `migrate(env, from_version: u32)` that executes within the upgrade transaction to migrate data structures safely before new logic is activated.
- **Files Involved:** `contracts/course_proxy/src/lib.rs`, `contracts/course_proxy/src/test.rs`
- **Acceptance Criteria:**
  - [ ] Upgrade ceremony automatically verifies and increments `storage_version`.
  - [ ] Incompatible storage layouts are rejected before WASM bytecode update is committed.
  - [ ] Student enrollment and certificate records migrate seamlessly without data loss.

---

### SC-098: Gas-Efficient Bit-Packing for High-Density Storage Records (Progress & Permissions)

- **Category:** Gas & Storage Optimization
- **Difficulty:** Medium | **Priority:** High | **ETA:** 1 Day
- **Problem Statement:** Storing student lesson completion flags and permission roles as separate persistent storage entries incurs high ledger rent and gas costs on Stellar mainnet.
- **Specification:** Implement a compact bit-packing library in `contracts/src/bitpack.rs`. Pack up to 128 individual boolean lesson completion flags or access control roles into a single `u128` integer in storage, utilizing fast bitwise operations (`&`, `|`, `^`, `<<`) to test and update student progress states.
- **Files Involved:** `contracts/src/bitpack.rs`, `contracts/certificate/src/lib.rs`, `contracts/access_control/src/roles.rs`
- **Acceptance Criteria:**
  - [ ] Student progress for a 100-lesson course packs into a single 16-byte storage entry.
  - [ ] Bitwise read/write operations consume negligible CPU instructions (< 1,000 gas units).
  - [ ] Storage rent consumption decreases by > 80% compared to individual boolean keys.

---

### SC-099: Production Release WASM Build Profile Optimization: Stripping, LTO & Panic Abort

- **Category:** Compilation & Build Engineering
- **Difficulty:** Medium | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Unoptimized contract compilation flags produce bloated WASM binaries exceeding Soroban's maximum contract size limit (64KB compressed), resulting in high deployment fees or failed deployments.
- **Specification:** Reconcile release compilation profiles in `contracts/Cargo.toml`. Configure `opt-level = "z"` (optimize for size), `lto = true`, `codegen-units = 1`, `panic = "abort"`, `overflow-checks = true`, and `strip = true`. Add automated bytecode size assertion in CI ensuring all compiled binaries stay comfortably below Soroban limits.
- **Files Involved:** `contracts/Cargo.toml`, `scripts/build-contracts.sh`, `.github/workflows/soroban-contracts.yml`
- **Acceptance Criteria:**
  - [ ] All 35+ workspace member contracts compile to release WASM binaries below 64KB compressed.
  - [ ] Automated CI script asserts bytecode size budgets and generates size breakdown tables.
  - [ ] Overflow checks remain strictly enabled in release builds to prevent silent wrapping bugs.

---

### SC-100: Final Soroban Mainnet Pre-Flight Deployment & Bytecode Hash Verification Script

- **Category:** Deployment & Release Engineering
- **Difficulty:** Hard | **Priority:** Critical | **ETA:** 1 Day
- **Problem Statement:** Deploying dozens of contracts to Stellar mainnet manually via CLI invites human error, inconsistent configuration parameters, and mismatched bytecode hashes.
- **Specification:** Author an automated, idempotent deployment orchestration script in `scripts/deploy-mainnet.sh`. 1) Compile all contracts with deterministic builds. 2) Compute and verify SHA-256 bytecode hashes. 3) Deploy WASM binaries and record contract IDs. 4) Initialize contracts atomically with verified production governance and multisig parameters. 5) Export deployment manifests to frontend and backend environment configurations.
- **Files Involved:** `scripts/deploy-mainnet.sh`, `contracts/deployments.md`, `.github/workflows/production-deploy.yml`
- **Acceptance Criteria:**
  - [ ] Script deploys and initializes all core contracts idempotently in correct dependency order.
  - [ ] Verifies all on-chain bytecode hashes match local audited compilation artifacts.
  - [ ] Generates updated `deployments.json` and automatically configures frontend `.env.production` contract IDs.

---

# Verification & Production Rollout Checklist

| Milestone                                          | Target Objective                                                       | Issues Included                                      |
| :------------------------------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------- |
| **Wave 1: Compiler & Build Integrity**             | TypeScript strict zero-error, ESLint 9, Cargo workspace reconciliation | FE-051 to FE-060, BE-051 to BE-058, SC-051 to SC-060 |
| **Wave 2: Security, Auth & Gas Optimization**      | Account takeover fix, SEP-10 hardening, ZK verifiers, Anti-MEV         | FE-061 to FE-075, BE-059 to BE-075, SC-061 to SC-075 |
| **Wave 3: Real-Time Sync & Enterprise Resilience** | Yjs WebSockets, Distributed Redis/PostgreSQL HA, Fuzz testing          | FE-076 to FE-090, BE-076 to BE-090, SC-076 to SC-090 |
| **Wave 4: Mainnet Launch & Canary Deploy**         | E2E Playwright, Blue-Green Canary, Mainnet deployment script           | FE-091 to FE-100, BE-091 to BE-100, SC-091 to SC-100 |
