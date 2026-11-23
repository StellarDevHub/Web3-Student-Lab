# API Response Schema Guide

## Overview

This document defines the standard JSON structure for all API responses in the Web3 Student Lab
backend to ensure consistency across all endpoints.

## Standard Response Structure

### Success Response Format

All successful API responses follow this structure:

```json
{
  "success": true,
  "data": <response_data>,
  "message": "Optional success message",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

### Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Optional additional error details"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

## Response Fields

### Common Fields

- `success` (boolean): Indicates whether the request was successful
- `timestamp` (string): ISO 8601 timestamp of the response
- `message` (string, optional): Additional context or success message

### Success Response Fields

- `data` (any): The actual response payload, varies by endpoint

### Error Response Fields

- `error` (object): Error information container
  - `code` (string): Machine-readable error code
  - `message` (string): Human-readable error description
  - `details` (string, optional): Additional error context

## HTTP Status Codes

| Status Code | Description           | Usage                                             |
| ----------- | --------------------- | ------------------------------------------------- |
| 200         | OK                    | Successful GET, PUT, PATCH requests               |
| 201         | Created               | Successful POST requests that create resources    |
| 204         | No Content            | Successful DELETE requests                        |
| 400         | Bad Request           | Invalid request data or parameters                |
| 401         | Unauthorized          | Missing or invalid authentication                 |
| 403         | Forbidden             | Valid authentication but insufficient permissions |
| 404         | Not Found             | Resource not found                                |
| 409         | Conflict              | Resource already exists or conflict               |
| 422         | Unprocessable Entity  | Valid request format but invalid data             |
| 500         | Internal Server Error | Server-side errors                                |

## Common Error Codes

| Error Code            | HTTP Status | Description               |
| --------------------- | ----------- | ------------------------- |
| `VALIDATION_ERROR`    | 400         | Request validation failed |
| `UNAUTHORIZED`        | 401         | Authentication required   |
| `FORBIDDEN`           | 403         | Insufficient permissions  |
| `NOT_FOUND`           | 404         | Resource not found        |
| `ALREADY_EXISTS`      | 409         | Resource already exists   |
| `INVALID_CREDENTIALS` | 401         | Invalid login credentials |
| `TOKEN_EXPIRED`       | 401         | JWT token has expired     |
| `INVALID_TOKEN`       | 401         | JWT token is invalid      |
| `INTERNAL_ERROR`      | 500         | Unexpected server error   |

## Endpoint Examples

### Authentication Endpoints

#### POST /api/auth/register

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "student@example.com",
      "name": "John Doe"
    },
    "token": "jwt-token-string"
  },
  "message": "Registration successful",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is already registered",
    "details": "A user with this email address already exists"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

#### POST /api/auth/login

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "student@example.com",
      "name": "John Doe"
    },
    "token": "jwt-token-string"
  },
  "message": "Login successful",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

### Course Endpoints

#### GET /api/courses

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "courses": [
      {
        "id": "course-uuid",
        "title": "Introduction to Blockchain",
        "description": "Learn the fundamentals of blockchain technology",
        "difficulty": "beginner",
        "duration": 120,
        "createdAt": "2026-03-20T10:00:00.000Z",
        "updatedAt": "2026-03-20T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

#### GET /api/courses/:id

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "course-uuid",
    "title": "Introduction to Blockchain",
    "description": "Learn the fundamentals of blockchain technology",
    "difficulty": "beginner",
    "duration": 120,
    "modules": [
      {
        "id": "module-uuid",
        "title": "What is Blockchain?",
        "order": 1,
        "lessons": []
      }
    ],
    "createdAt": "2026-03-20T10:00:00.000Z",
    "updatedAt": "2026-03-20T10:00:00.000Z"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Course not found"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

### Feedback Endpoints

#### POST /api/feedback

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "feedback-uuid",
    "studentId": "student-uuid",
    "courseId": "course-uuid",
    "rating": 5,
    "review": "Excellent course content!",
    "createdAt": "2026-03-24T10:30:00.000Z",
    "updatedAt": "2026-03-24T10:30:00.000Z"
  },
  "message": "Feedback submitted successfully",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

#### GET /api/feedback/course/:courseId

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "feedback": [
      {
        "id": "feedback-uuid",
        "studentId": "student-uuid",
        "courseId": "course-uuid",
        "rating": 5,
        "review": "Great course!",
        "createdAt": "2026-03-24T10:30:00.000Z",
        "updatedAt": "2026-03-24T10:30:00.000Z",
        "student": {
          "id": "student-uuid",
          "name": "John Doe",
          "email": "john@example.com"
        }
      }
    ],
    "summary": {
      "courseId": "course-uuid",
      "averageRating": 4.5,
      "totalReviews": 10,
      "ratingDistribution": {
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
        "5": 4
      }
    }
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

### Health Check Endpoint

#### GET /health

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "message": "Web3 Student Lab Backend is running",
    "uptime": 3600,
    "version": "1.0.0"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

## Pagination

For endpoints that return lists, use this pagination structure:

```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

## Validation Errors

For validation errors, provide detailed field-level information:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Email is required", "Email format is invalid"],
      "password": ["Password must be at least 8 characters"]
    }
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

## Implementation Guidelines

1. **Consistency**: All endpoints must follow this schema
2. **Timestamps**: Always include ISO 8601 formatted timestamps
3. **Error Handling**: Use appropriate HTTP status codes and error codes
4. **Validation**: Provide clear validation error messages
5. **Security**: Never expose sensitive information in error messages
6. **Logging**: Log all errors server-side for debugging
7. **Documentation**: Keep this schema updated when adding new endpoints

## TypeScript Types

Define response types in your TypeScript code:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  message?: string;
  timestamp: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

This schema ensures consistent, predictable API responses that are easy to consume by frontend
applications and third-party integrations.
