# Database Indexing Strategy

This guide explains the new Prisma indexing strategy for the Web3 Student Lab backend.

## Why indexing matters

Indexes reduce query execution time for common filters, sort operations, and workspace-scoped reads.

## Updated models

### Student
- Indexed `workspaceId` and `email` together for fast tenant-scoped user lookup.
- Indexed `firstName`, `lastName`, and `createdAt` for search and reporting.

### Course
- Indexed `workspaceId` and `title` together for workspace-specific catalog access.
- Indexed `instructor`, `credits`, and `createdAt` for common filtering and sorting.

### Certificate
- Indexed `studentId`, `courseId`, `status`, and `issuedAt` so certificate lookups are efficient during verification flows.
- Added compound indexes for `[studentId, status]` and `[courseId, issuedAt]` to support common analytics and query patterns.

### Enrollment
- Indexed `studentId`, `courseId`, and `status` for fast enrollment lookup and course roster / progress queries.

### LearningProgress
- Indexed `studentId`, `courseId`, `status`, and `lastAccessedAt` for dashboard queries and progress tracking.

## Practical benefit

These indexes are designed to support:

- `findMany` calls filtered by workspace and student/course relationships
- certificate search by token status or issuance date
- enrollment and progress queries used by the dashboard
- analytics and sorting on created date fields

## How to apply

After updating `prisma/schema.prisma`, run:

```bash
cd backend
npx prisma migrate dev --name add-indexes
```

Then regenerate the Prisma client:

```bash
npx prisma generate
```
