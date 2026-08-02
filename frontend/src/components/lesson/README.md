# Interactive Lesson Workspace (Monaco Side-Panel)

A lesson layout that places an interactive **Monaco** code editor side-by-side
with lesson content, so students can read and experiment in the same view.

Demo route: `/lessons`

## Components

| File | Responsibility |
|------|----------------|
| [`LessonCodeEditor.tsx`](LessonCodeEditor.tsx) | The Monaco editor side-panel — dynamically loaded, Rust highlighting + autocomplete, reset, plain-text fallback |
| [`LessonWorkspace.tsx`](LessonWorkspace.tsx) | Responsive split layout: lesson content + editor |
| [`../../app/lessons/page.tsx`](../../app/lessons/page.tsx) | Sample lesson wiring the workspace together |

## Why a dedicated editor (not the playground one)?

The playground's `CodeEditor` is coupled to collaboration (Yjs), a global
"compile" action, and a fixed Soroban default. The lesson side-panel needs none
of that — it just needs to load starter code, report edits, and reset. So
`LessonCodeEditor` is a focused component that **reuses the shared language
helpers** (`extendRustLanguage`, `registerSorobanCompletion`) for Rust syntax
highlighting and autocomplete, keeping behaviour consistent without the coupling.

## Key implementation details

- **Bundle size** — Monaco is imported with `next/dynamic` + `ssr: false`, so it
  is excluded from the server bundle and only fetched on the client when a
  lesson editor renders (Acceptance: optimised bundle / dynamic load).
- **State** — the editor owns its code string and emits every change via
  `onChange`; `LessonWorkspace` lifts that state to show an "unsaved changes"
  hint. Editing and reset are smooth and predictable (Acceptance: handles state
  modifications smoothly).
- **Resilience** — a small error boundary swaps in an accessible `<textarea>` if
  Monaco fails to load.
- **Accessibility** — labelled `region`, an `aria-label`led reset button that is
  disabled until the code is dirty, and a polite live region for status.

## Usage

```tsx
import LessonWorkspace from '@/components/lesson/LessonWorkspace';

<LessonWorkspace title="Your First Soroban Contract" starterCode={starter}>
  <p>Lesson prose goes here…</p>
</LessonWorkspace>
```

## Tests

```bash
cd frontend
npx vitest run src/components/lesson/__tests__/LessonCodeEditor.test.tsx
```

Covers: loads with the Rust language, registers highlighting/autocomplete on
mount, propagates edits via `onChange`, and reset restores the starter code.
