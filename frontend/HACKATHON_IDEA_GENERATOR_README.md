# Hackathon Idea Generator (Tech-Stack Filtering)

An enhanced idea generator that helps students beat creative block during
hackathon prep. Students filter by **difficulty level**, **domain template**, and
**technology stack**; the app then generates a tailored project idea using the
existing **AI backend** (server-side OpenAI), with a deterministic local
template fallback when the service is offline.

Built with **React 19 + TypeScript**, styled to match the existing app.

Route: `/hackathon-ideas`

Block Explorer sub-route: `/hackathon-ideas/explorer`

## Architecture

Follows the project's **data → derive → render** separation so each layer is
small and independently testable:

| Layer | File | Responsibility |
|-------|------|----------------|
| Pure logic | [`src/lib/idea-generator/ideaGenerator.ts`](src/lib/idea-generator/ideaGenerator.ts) | Filter model, constants (difficulty / domain / tech), validation, AI-param mapping, domain templates, deterministic local fallback — no React, no I/O |
| Data | [`src/hooks/useIdeaGenerator.ts`](src/hooks/useIdeaGenerator.ts) | Validates → calls `generatorAPI.generateIdea` → falls back to local synthesis on error |
| View | [`src/components/idea-generator/IdeaGeneratorPanel.tsx`](src/components/idea-generator/IdeaGeneratorPanel.tsx) | Accessible filter form + result card |
| Route | [`src/app/hackathon-ideas/page.tsx`](src/app/hackathon-ideas/page.tsx) | Mounts the panel in the standard hub layout |

## AI / ML integration

Idea generation is AI-powered on the **backend** (`/generator/generate`, OpenAI
`gpt-4o-mini` with a circuit breaker). The frontend integrates through the
existing [`generatorAPI`](src/lib/api.ts) in `src/lib/api.ts` — no new client is
introduced. `buildGeneratorParams()` maps the UI filters to the request shape the
endpoint already accepts (`{ theme, techStack, difficulty }`).

The backend endpoint also accepts an optional `customRpcUrl` string in the
request body; when provided the AI prompt will be instructed to prefer that RPC
endpoint for any blockchain interactions mentioned in the generated idea.

## Filtering

- **Difficulty** — `Beginner | Intermediate | Advanced` (matches `ProjectIdea`).
- **Domain template** — DeFi, NFT, DAO, Gaming, Social, Infrastructure, Identity,
  Sustainability. Each domain has curated title/description/feature variants.
- **Technology stack** — multi-select; at least one is required (validated).

Adding a domain is a data-only change: add an entry to `DOMAINS` and
`DOMAIN_TEMPLATES`.

## Error handling & fallbacks

1. **Validate first** — bad filters (e.g. empty stack) never spend an AI call;
   the error is shown via `role="alert"`.
2. **AI call** — `generatorAPI.generateIdea(...)`.
3. **Local fallback** — on any failure, `generateLocalIdea()` deterministically
   synthesises a relevant idea from domain templates and flags `isFallback`, so
   the user always gets a result instead of an error screen.

## Accessibility (WCAG 2.1)

- Every control has a `<label>`; the tech stack is a `<fieldset>`/`<legend>`
  group of native checkboxes.
- Generating state uses `role="status"` + `aria-busy`; the result region is
  `aria-live="polite"`; validation errors use `role="alert"`.
- Fallback status is conveyed in text, not colour alone (SC 1.4.1).

## Tests

Minimal unit tests cover the core pure logic (toggle, validation, param mapping,
deterministic fallback):

```bash
cd frontend
npx vitest run src/lib/idea-generator/__tests__/ideaGenerator.test.ts
```
