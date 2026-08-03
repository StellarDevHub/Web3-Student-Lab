#!/usr/bin/env tsx
/**
 * Curriculum content validator (#909).
 *
 * Validates backend/src/routes/learning/curriculum.data.ts (the
 * authoritative course/module/lesson structure served by the learning
 * API) the same way application data would be validated: required
 * fields, unique identifiers, and correct navigation ordering. Exits
 * non-zero with the specific course/module/lesson identifier and field
 * that failed, so a CI failure or local run points directly at the
 * problem instead of just saying "curriculum is invalid".
 *
 * Run locally: `npx tsx scripts/validate-curriculum.ts` (see
 * package.json's `validate:curriculum` script).
 */
import { curriculumByCourseId } from '../src/routes/learning/curriculum.data.js';
import type { Module, Lesson } from '../src/routes/learning/types.js';

const ALLOWED_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);

interface ValidationIssue {
  location: string;
  message: string;
}

const issues: ValidationIssue[] = [];

function fail(location: string, message: string): void {
  issues.push({ location, message });
}

function requireNonEmptyString(location: string, field: string, value: unknown): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(location, `field '${field}' must be a non-empty string, got ${JSON.stringify(value)}`);
  }
}

function requireFiniteNumber(location: string, field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(location, `field '${field}' must be a finite number, got ${JSON.stringify(value)}`);
  }
}

/**
 * Checks that `order` values form a contiguous 1..N sequence with no
 * duplicates and no gaps — anything else means navigation (next/previous,
 * progress percentage math) will behave incorrectly.
 */
function validateOrdering(location: string, items: Array<{ id: string; order: number }>): void {
  const seenOrders = new Map<number, string>();
  for (const item of items) {
    const existing = seenOrders.get(item.order);
    if (existing) {
      fail(location, `duplicate order=${item.order} on '${item.id}' and '${existing}'`);
    } else {
      seenOrders.set(item.order, item.id);
    }
  }

  const sortedOrders = [...seenOrders.keys()].sort((a, b) => a - b);
  for (let i = 0; i < sortedOrders.length; i++) {
    const expected = i + 1;
    if (sortedOrders[i] !== expected) {
      fail(
        location,
        `order sequence has a gap or does not start at 1 — expected ${expected}, found ${sortedOrders[i]} ` +
          `(full sequence: [${sortedOrders.join(', ')}])`
      );
      break;
    }
  }
}

function validateLesson(location: string, lesson: Lesson, allLessonIds: Map<string, string>): void {
  requireNonEmptyString(location, 'id', lesson.id);
  requireNonEmptyString(location, 'title', lesson.title);
  requireNonEmptyString(location, 'description', lesson.description);
  requireFiniteNumber(location, 'order', lesson.order);

  if (!ALLOWED_DIFFICULTIES.has(lesson.difficulty)) {
    fail(
      location,
      `field 'difficulty' must be one of ${[...ALLOWED_DIFFICULTIES].join('/')}, got ${JSON.stringify(lesson.difficulty)}`
    );
  }

  if (lesson.id) {
    const existing = allLessonIds.get(lesson.id);
    if (existing) {
      fail(location, `duplicate lesson id '${lesson.id}' (also used at ${existing})`);
    } else {
      allLessonIds.set(lesson.id, location);
    }
  }
}

function validateModule(
  courseId: string,
  module: Module,
  allModuleIds: Map<string, string>,
  allLessonIds: Map<string, string>
): void {
  const location = `course '${courseId}' > module '${module.id ?? '<missing id>'}'`;

  requireNonEmptyString(location, 'id', module.id);
  requireNonEmptyString(location, 'title', module.title);
  requireNonEmptyString(location, 'description', module.description);
  requireFiniteNumber(location, 'order', module.order);

  if (module.id) {
    const existing = allModuleIds.get(module.id);
    if (existing) {
      fail(location, `duplicate module id '${module.id}' (also used at ${existing})`);
    } else {
      allModuleIds.set(module.id, location);
    }
  }

  if (!Array.isArray(module.lessons) || module.lessons.length === 0) {
    fail(location, `must have at least one lesson`);
    return;
  }

  for (const lesson of module.lessons) {
    validateLesson(`${location} > lesson '${lesson.id ?? '<missing id>'}'`, lesson, allLessonIds);
  }

  validateOrdering(`${location} (lesson ordering)`, module.lessons);
}

function validateCurriculum(): void {
  const allModuleIds = new Map<string, string>();
  const allLessonIds = new Map<string, string>();

  const courseIds = Object.keys(curriculumByCourseId);
  if (courseIds.length === 0) {
    fail('curriculumByCourseId', 'must define at least one course');
  }

  for (const courseId of courseIds) {
    const modules = curriculumByCourseId[courseId];
    const location = `course '${courseId}'`;

    if (!Array.isArray(modules) || modules.length === 0) {
      fail(location, 'must have at least one module');
      continue;
    }

    for (const module of modules) {
      validateModule(courseId, module, allModuleIds, allLessonIds);
    }

    validateOrdering(`${location} (module ordering)`, modules);
  }
}

validateCurriculum();

if (issues.length > 0) {
  console.error(`\n✗ Curriculum validation failed with ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.error(`  [${issue.location}] ${issue.message}`);
  }
  console.error('');
  process.exit(1);
}

console.log('✓ Curriculum validation passed.');
