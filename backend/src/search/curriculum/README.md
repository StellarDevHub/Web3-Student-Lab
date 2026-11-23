# Advanced Search Indexer for Learning Roadmaps

A fast, relevance-ranked search API over curriculum content (courses, modules,
lessons) backed by **PostgreSQL full-text search**.

## Endpoints

### `GET /api/v1/search`
Keyword search across indexed curriculum.

| Query param | Type | Notes |
|-------------|------|-------|
| `q` | string (required) | Keywords. Parsed with `websearch_to_tsquery` (supports quoted phrases, `or`, `-negation`). |
| `type` | `course` \| `module` \| `lesson` | Filter by entity type. |
| `difficulty` | `beginner` \| `intermediate` \| `advanced` | Filter (applies to lessons). |
| `courseId` | string | Restrict to one course. |
| `limit` | number (1–50, default 20) | Page size. |
| `offset` | number (default 0) | Pagination offset. |

Response:
```json
{ "query": "soroban auth", "count": 2, "limit": 20, "offset": 0,
  "results": [ { "entityType": "lesson", "entityId": "course-1-lesson-3",
                 "courseId": "course-1", "title": "...", "content": "...",
                 "difficulty": "intermediate", "rank": 0.12 } ] }
```

### `POST /api/v1/search/reindex`
Rebuilds the index for the current workspace. Run after curriculum changes or a
fresh deploy.

## How it works

```
curriculum.data.ts (modules/lessons)  ┐
DB Course records                     ┘──▶ collectIndexEntries()
        ──▶ curriculum_search_entries (tsvector + GIN index)
        ──▶ GET /api/v1/search → websearch_to_tsquery + ts_rank
```

- **Index table** `curriculum_search_entries` stores one denormalised, searchable
  row per course/module/lesson. A `tsvector` column (`searchVector`) is kept up
  to date by a database trigger, with the **title weighted above the body** so
  title matches rank higher.
- **GIN index** on `searchVector` makes `@@` lookups fast.
- **Workspace isolation**: every row carries `workspaceId`; queries and reindex
  are scoped to the request's workspace.

## Files

| File | Responsibility |
|------|----------------|
| `curriculumSearchQuery.ts` | Pure builders: `buildIndexEntries`, `buildCurriculumSearchQuery` (parameterised, injection-safe). Unit tested. |
| `CurriculumSearchService.ts` | Prisma wiring: `reindexCurriculum`, `searchCurriculum`, `collectIndexEntries`. |
| `../../routes/search/curriculum-search.routes.ts` | Express routes (mounted at `/api/v1/search`). |
| `../../routes/search/curriculum-search.schemas.ts` | Zod query validation. |
| `prisma/migrations/20260626000000_curriculum_search_index/` | Table + tsvector + GIN index + trigger. |

## Setup

```bash
cd backend
npx prisma migrate deploy   # apply the migration
# then, once per workspace (or via the endpoint):
curl -X POST localhost:8080/api/v1/search/reindex -H 'x-workspace-id: default'
```

## Tests

```bash
cd backend
npm test -- curriculum-search
```

Pure builder tests run without a database. The integration tests auto-skip when
no database / migrated index table is available.
