# Curriculum and Progress Testing Documentation

## Overview

This document provides comprehensive information about the test suite for the curriculum and progress services in the Web3 Student Lab platform.

## Test Structure

### Test Files

1. **curriculum.unit.test.ts** - Unit tests for curriculum retrieval
2. **progress.unit.test.ts** - Unit tests for progress tracking
3. **curriculum-progress.integration.test.ts** - Integration tests covering full API flows

## Coverage Goals

✓ **Target**: >90% code coverage
✓ **Lines**: All service functions covered
✓ **Branches**: All conditional paths tested
✓ **Edge Cases**: Comprehensive error scenarios

## Test Categories

### Unit Tests

#### Curriculum Service Tests (`curriculum.unit.test.ts`)

**Purpose**: Test curriculum data retrieval and filtering in isolation

**Test Scenarios**:
- ✅ Cache hit scenarios (data from Redis)
- ✅ Cache miss scenarios (data from database)
- ✅ Database fallback (when DB fails, use mock data)
- ✅ Difficulty filtering (beginner, intermediate, advanced)
- ✅ Empty result handling
- ✅ Malformed data handling
- ✅ Concurrent request safety
- ✅ Course ordering preservation

**Mocked Dependencies**:
- Prisma database client
- Cache service
- Cache invalidation service

**Key Functions Tested**:
- `listCourses()` - Returns all courses with optional difficulty filter
- `getCourseCurriculum()` - Returns single course with full curriculum

#### Progress Service Tests (`progress.unit.test.ts`)

**Purpose**: Test student progress tracking and lesson completion logic

**Test Scenarios**:
- ✅ Progress retrieval from cache
- ✅ Progress retrieval from database
- ✅ Initial progress generation
- ✅ Lesson completion tracking
- ✅ Lesson removal (un-completion)
- ✅ Duplicate prevention
- ✅ Percentage calculation
- ✅ Explicit percentage override
- ✅ Course completion detection
- ✅ Student activity logging
- ✅ Module tracking updates
- ✅ Status transitions (not_started → in_progress → completed)
- ✅ Cache invalidation after updates
- ✅ Database fallback resilience

**Mocked Dependencies**:
- Prisma database client
- Cache service
- Student activity logging
- Cache invalidation

**Key Functions Tested**:
- `getStudentProgress()` - Retrieves current progress for student-course pair
- `updateStudentProgress()` - Updates progress based on lesson completion

### Integration Tests

#### Full API Tests (`curriculum-progress.integration.test.ts`)

**Purpose**: Test complete user workflows through HTTP APIs

**Test Scenarios**:

**GET /api/v1/learning/courses**
- ✅ List all courses
- ✅ Filter by difficulty (beginner/intermediate/advanced)
- ✅ Empty filter handling

**GET /api/v1/learning/courses/:courseId**
- ✅ Get specific course curriculum
- ✅ Filter curriculum by difficulty
- ✅ 404 for non-existent course
- ✅ 400 for malformed course ID

**GET /api/v1/learning/courses/:courseId/progress**
- ✅ Requires authentication (401 without token)
- ✅ Returns initial progress for new students
- ✅ Returns existing progress from database
- ✅ Isolates progress between students
- ✅ Validates course ID parameter

**PATCH /api/v1/learning/courses/:courseId/progress**
- ✅ Requires authentication
- ✅ Creates initial progress on first update
- ✅ Updates existing progress (no duplicates)
- ✅ Calculates percentage correctly
- ✅ Uses explicit percentage when provided
- ✅ Validates percentage range (0-100)
- ✅ Returns 404 for invalid lesson ID
- ✅ Prevents lesson duplication
- ✅ Marks course as completed (100%)
- ✅ Isolates updates between students
- ✅ Removes lessons when unmarked
- ✅ Validates required fields
- ✅ Updates timestamps correctly

**End-to-End Journey**
- ✅ Complete user flow: register → list courses → view curriculum → track progress → complete course

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Set up test database (optional - tests use fallback if unavailable)
export DATABASE_URL="postgresql://user:password@localhost:5432/test_db"
```

### Run All Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

### Run Specific Test Suites

```bash
# Unit tests only
npm test -- curriculum.unit.test.ts
npm test -- progress.unit.test.ts

# Integration tests only
npm test -- curriculum-progress.integration.test.ts
```

### Watch Mode

```bash
# Run tests in watch mode for development
npm test -- --watch
```

## Coverage Reports

After running `npm run test:coverage`, view reports:

```bash
# Terminal summary
cat coverage/coverage-summary.json

# HTML report
open coverage/lcov-report/index.html
```

## Test Patterns and Best Practices

### AAA Pattern

All tests follow the Arrange-Act-Assert pattern:

```typescript
it('should return courses from cache when available', async () => {
  // Arrange: Set up test data and mocks
  const cachedCourses = [{ id: 'course-1', title: 'Test' }];
  mockCacheGet.mockResolvedValueOnce(cachedCourses);

  // Act: Execute the function under test
  const result = await listCourses();

  // Assert: Verify the expected outcome
  expect(result).toEqual(cachedCourses);
  expect(mockPrismaFindMany).not.toHaveBeenCalled();
});
```

### Descriptive Test Names

- Use `should` statements that describe expected behavior
- Be specific about what is being tested
- Include context when relevant

### Isolation

- Each test is independent and can run in any order
- Database is cleaned before each integration test
- Mocks are reset before each unit test

### Edge Cases

Tests include comprehensive edge case coverage:

- Empty data sets
- Malformed inputs
- Database failures
- Network errors
- Concurrent operations
- Boundary conditions (0%, 100%, etc.)

## Continuous Integration

### GitHub Actions Workflow

Tests run automatically on:
- Push to `main` branch
- Pull request creation/update
- Manual workflow dispatch

```yaml
# .github/workflows/backend-tests.yml
- name: Run tests with coverage
  run: npm run test:coverage
- name: Check coverage threshold
  run: |
    coverage=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$coverage < 90" | bc -l) )); then
      echo "Coverage $coverage% is below 90% threshold"
      exit 1
    fi
```

## Debugging Tests

### Enable Verbose Output

```bash
# Run with verbose logging
npm test -- --verbose

# Run single test
npm test -- --testNamePattern="should return courses from cache"
```

### Database Debugging

```typescript
// Add logging in tests
beforeEach(async () => {
  console.log('Cleaning database...');
  await prisma.learningProgress.deleteMany();
  console.log('Database cleaned');
});
```

## Educational Comments

Tests include extensive educational comments:

```typescript
/**
 * This test ensures the service falls back gracefully when the database
 * is unavailable. The in-memory mock store acts as a resilience layer,
 * preventing complete service failure.
 */
it('should fallback to mock store when database fails', async () => {
  // Implementation
});
```

## Security Considerations

- Authentication is tested on all protected endpoints
- Authorization isolation is verified (users can't access others' data)
- Input validation is comprehensive
- SQL injection prevention is implicit (using Prisma ORM)

## Performance

- Unit tests: < 5 seconds total
- Integration tests: < 30 seconds total
- Individual tests: < 100ms each

## Future Enhancements

Potential areas for expansion:

- [ ] Load testing for concurrent users
- [ ] Performance benchmarking
- [ ] Snapshot testing for API responses
- [ ] Contract testing with frontend
- [ ] Mutation testing for code quality

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "Database not available"
**Solution**: This is expected behavior. Tests will skip or use fallback data.

**Issue**: Coverage below 90%
**Solution**: Check `coverage/lcov-report/index.html` for uncovered lines.

**Issue**: Flaky tests
**Solution**: Ensure proper cleanup in `afterEach` hooks and avoid timing-dependent assertions.

## Contributing

When adding new features:

1. Write unit tests first (TDD approach)
2. Add integration tests for API endpoints
3. Update this documentation
4. Ensure coverage stays above 90%
5. Add educational comments for complex logic

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Guide](https://github.com/ladjs/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
