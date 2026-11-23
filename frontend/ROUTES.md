# Frontend Routes — Web3 Student Lab

> **Issue #975** · Audit of all routes in `frontend/src/app/`.
>
> **Legend**
> | Status | Meaning |
> |---|---|
> | ✅ Complete | Fully implemented with async loading state |
> | 🧪 Experimental | Feature-complete UI but may change; shows ExperimentalBanner |
> | 🚧 Stub | Minimal placeholder — tracked for completion |

---

## Core Application Routes

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/` | ✅ Complete | Home / landing page | Next.js default |
| `/dashboard` | ✅ Complete | Personalised learning dashboard via `LearningDashboard` | `dashboard/loading.tsx` |
| `/auth/login` | ✅ Complete | Email + wallet authentication | — |
| `/auth/register` | ✅ Complete | New account registration | — |
| `/auth/callback` | ✅ Complete | OAuth callback handler | — |

---

## Learning & Curriculum

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/courses` | ✅ Complete | Course catalogue | — |
| `/courses/[id]` | ✅ Complete | Individual course detail | — |
| `/lessons` | ✅ Complete | Lesson listing | — |
| `/lessons/[courseId]` | ✅ Complete | Lesson player | — |
| `/roadmap` | ✅ Complete | Guided Web3 learning path | — |
| `/enroll` | ✅ Complete | Multi-step enrollment wizard with wallet check | Skeleton via `EnrollPageSkeleton` |
| `/quiz` | ✅ Complete | Interactive quiz engine (dynamic import, SSR-off) | Spinner in dynamic loader |
| `/peer-review` | ✅ Complete | Peer-review dashboard (dynamic import) | — |
| `/peer-review-new` | ✅ Complete | Redesigned peer-review flow | — |
| `/snippets` | ✅ Complete | Code snippet library | — |
| `/video` | ✅ Complete | Video learning module | — |
| `/bookmarks` | ✅ Complete | Saved content bookmarks | — |

---

## Blockchain Simulator & Tools

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/simulator` | ✅ Complete | Visual blockchain / block-mining simulator | `simulator/loading.tsx` |
| `/simulator/scanner` | ✅ Complete | Block scanner sub-view | — |
| `/simulator/crypto` | ✅ Complete | Cryptography tool sub-view | — |
| `/simulator/explorer` | ✅ Complete | Chain explorer sub-view | — |
| `/playground` | ✅ Complete | In-browser Soroban / Rust contract editor | — |
| `/playground/triage` | ✅ Complete | Issue-triage mini-playground | — |
| `/mempool-auction` | ✅ Complete | Mempool fee-auction simulator | `mempool-auction/loading.tsx` |
| `/chain-reorg` | ✅ Complete | Chain-reorganisation visualiser | `chain-reorg/loading.tsx` |
| `/merkle-tree` | ✅ Complete | Interactive Merkle-tree builder | `merkle-tree/loading.tsx` |
| `/stellar-consensus-protocol` | ✅ Complete | SCP / Federated Byzantine Agreement visualiser | — |
| `/contract-performance` | ✅ Complete | D3-powered contract execution metrics | — |

---

## Experimental Features

> These pages show an **ExperimentalBanner** warning. Functionality is present but the feature
> may change or be gated in future releases.

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/webrtc` | 🧪 Experimental | P2P audio/video lab room via WebRTC | `webrtc/loading.tsx` |
| `/microfrontends` | 🧪 Experimental | Module Federation / micro-frontend host | `microfrontends/loading.tsx` |
| `/network-streamer` | 🧪 Experimental | Live Stellar network transaction stream | `network-streamer/loading.tsx` |
| `/bridge-tracker` | 🧪 Experimental | Cross-chain bridge status tracker | `bridge-tracker/loading.tsx` |

---

## Web3 / DeFi Tools

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/yield-calculator` | ✅ Complete | DeFi yield / APY calculator with chart | `yield-calculator/loading.tsx` |
| `/asset-management` | ✅ Complete | Portfolio / tokenised-asset management | — |
| `/airdrop` | ✅ Complete | Airdrop claim dashboard | — |
| `/crowdfunding` | ✅ Complete | On-chain crowdfunding campaigns | — |
| `/notarization` | ✅ Complete | File/document notarisation on-chain | — |
| `/subscriptions` | ✅ Complete | Subscription plan management | Suspense spinner |

---

## Identity & Certificates

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/certificates` | ✅ Complete | Certificate gallery | — |
| `/certificates/[id]` | ✅ Complete | Certificate detail / share page | — |
| `/certificates/generate` | ✅ Complete | Issue a new certificate | — |
| `/certificates/analytics` | ✅ Complete | Certificate issuance analytics | — |
| `/verify` | ✅ Complete | On-chain certificate verifier | — |
| `/version-control` | ✅ Complete | Open-source trainer with DID-backed proof | — |

---

## Community & Content

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/blog` | ✅ Complete | Community blog powered by `BlogDashboard` | `blog/loading.tsx` |
| `/forum` | ✅ Complete | Discussion forum | `forum/loading.tsx` |
| `/ideas` | ✅ Complete | Hackathon idea feed | — |
| `/hackathon-ideas` | ✅ Complete | Extended hackathon idea generator | — |
| `/hackathon-ideas/explorer` | ✅ Complete | Idea explorer sub-view | — |
| `/brainstorm` | ✅ Complete | Collaborative brainstorm canvas | — |
| `/open-source` | ✅ Complete | Open-source contribution trainer | — |
| `/open-source/gas-calculator` | ✅ Complete | Gas-fee estimator sub-tool | — |
| `/collaborative-lab` | ✅ Complete | Real-time collaborative coding lab | — |
| `/peer-review-new` | ✅ Complete | Next-gen peer-review interface | — |

---

## Analytics & Monitoring

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/analytics` | ✅ Complete | User learning analytics dashboard | — |
| `/performance-metrics` | ✅ Complete | Platform performance visualisations | — |
| `/resource-estimator` | ✅ Complete | Compute/resource cost estimator | — |

---

## Developer Tools

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/devtools` | ✅ Complete | DevTools shell with sub-section layout | — |
| `/devtools/events` | ✅ Complete | Event log viewer | — |
| `/devtools/fees` | ✅ Complete | Fee inspector | — |
| `/devtools/storage` | ✅ Complete | Contract storage explorer | — |
| `/devtools/simulator` | ✅ Complete | Embedded simulator | — |
| `/devtools/wallet` | ✅ Complete | Wallet debugger | — |

---

## Admin

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/admin` | ✅ Complete | Admin shell | — |
| `/admin/content` | ✅ Complete | Content management | — |
| `/instructor` | ✅ Complete | Instructor portal | — |
| `/instructor/analytics` | ✅ Complete | Instructor analytics | — |

---

## Misc / Hardware

| Route | Status | Purpose | Loading State |
|---|---|---|---|
| `/hardware-wallet` | ✅ Complete | Ledger/WebHID hardware wallet lab | — |

---

## API Routes (`/api/*`)

| Route | Purpose |
|---|---|
| `/api/assistant` | AI assistant chat completions (Next.js Route Handler) |

---

## Notes

- **Loading states** are provided via Next.js `loading.tsx` convention (React Suspense boundary) or
  via `next/dynamic` with an explicit `loading` prop.
- **Experimental routes** display `<ExperimentalBanner>` from
  `@/components/ui/ExperimentalBanner`.
- Routes marked `not-found.tsx` fall back to the global 404 handler at
  `frontend/src/app/not-found.tsx`.
