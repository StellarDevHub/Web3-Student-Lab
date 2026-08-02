# Adding or Editing a Curriculum Lesson

Course content lives in
`backend/src/routes/learning/curriculum.data.ts` — a
`Record<courseId, Module[]>` map. Each `Module` has an ordered list of
`Lesson`s (types in `backend/src/routes/learning/types.ts`).

## Adding a lesson

1. Find the course/module you're adding to in `curriculum.data.ts`.
2. Add a new lesson object with a **globally unique** `id` (convention:
   `<course-id>-lesson-<n>`), a non-empty `title`/`description`, a
   `difficulty` of `'beginner' | 'intermediate' | 'advanced'`, and an
   `order` that continues the module's existing 1..N sequence with no
   gaps or duplicates.
3. If you're adding a new module, give it its own unique `id`
   (`<course-id>-module-<n>`) and an `order` that continues the course's
   module sequence the same way.

## Validating locally before opening a PR

```bash
cd backend
npm run validate:curriculum
```

This is the same command CI runs (`.github/workflows/ci.yml`, "Validate
curriculum content" step, right after the build — before any database
services are needed). It checks, failing with the specific
course/module/lesson identifier and field that's wrong:

- Every course/module/lesson has the required non-empty fields.
- Module IDs are unique across the whole curriculum; lesson IDs are
  unique across the whole curriculum (not just within their own module).
- `difficulty` is one of the three allowed values.
- `order` values within a module (lessons) and within a course (modules)
  form a contiguous `1, 2, 3, ...` sequence — a duplicate or a gap means
  the module/course was edited without updating every sibling's `order`,
  which breaks "next lesson" navigation and progress-percentage math.

The validator (`backend/scripts/validate-curriculum.ts`) is a plain
script, not a test file — run it directly with `tsx`, no test runner or
database required.
