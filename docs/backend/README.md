# Web3 Student Lab Backend

Backend API for the Web3 Student Lab platform, built with Node.js, Express, and TypeScript.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
cd backend
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:8080` (or the port specified in your `.env` file).

### Build

Build the TypeScript code:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

## 🧪 Testing

This project uses **Jest** and **Supertest** for integration testing.

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

Automatically re-run tests when files change:

```bash
npm run test:watch
```

### Run Tests with Coverage

Generate a coverage report:

```bash
npm run test:coverage
```

Coverage reports will be available in the `coverage/` directory. Open
`coverage/lcov-report/index.html` in your browser to view the HTML report.

### Test Structure

Tests are located in the `tests/` directory:

```
tests/
├── setup.ts           # Test setup and configuration
├── health.test.ts     # Health endpoint tests
├── auth.test.ts       # Authentication module tests
└── learning.test.ts   # Learning module tests
```

### Writing New Tests

1. Create a new `.test.ts` file in the `tests/` directory
2. Import the `app` from `../src/index.js`
3. Use Supertest to make HTTP requests
4. Use Jest assertions to validate responses

Example:

```typescript
import request from 'supertest';
import { app } from '../src/index.js';

describe('My Module Tests', () => {
  describe('GET /api/my-endpoint', () => {
    it('should return expected data', async () => {
      const response = await request(app).get('/api/my-endpoint');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });
});
```

## 📁 Project Structure

# Backend Setup Guide

## Prerequisites

- Node.js v20+ or v22+
- PostgreSQL 14+
- npm or pnpm

## Installation

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
cp .env.example .env
```

3. Update the `.env` file with your PostgreSQL connection string:

```
DATABASE_URL="postgresql://postgres:your-password@localhost:5432/web3-student-lab?schema=public"
PORT=8080
NODE_ENV=development
```

## Database Setup

### Option 1: Using Local PostgreSQL

1. Make sure PostgreSQL is running on your machine
2. Create a database named `web3-student-lab`:

```bash
createdb web3-student-lab
```

3. Run migrations:

```bash
npx prisma migrate deploy
```

### Option 2: Using Docker

```bash
docker run --name web3-student-lab-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=web3-student-lab \
  -p 5432:5432 \
  -d postgres:15
```

Then run migrations:

```bash
npx prisma migrate deploy
```

## Development

Start the development server:

```bash
npm run dev
```

The server will start on `http://localhost:8080` (or the port specified in `.env`).

## Building

Build the TypeScript project:

```bash
npm run build
```

## Running in Production

```bash
npm run build
npm start
```

## API Endpoints

All API endpoints are prefixed with `/api`:

- `GET /api/health` - Health check
- `GET /api/students` - List all students
- `POST /api/students` - Create a student
- `GET /api/students/:id` - Get student by ID
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

- `GET /api/courses` - List all courses
- `POST /api/courses` - Create a course
- `GET /api/courses/:id` - Get course by ID
- `PUT /api/courses/:id` - Update course
- `DELETE /api/courses/:id` - Delete course

- `GET /api/certificates` - List all certificates
- `POST /api/certificates` - Issue a certificate
- `GET /api/certificates/:id` - Get certificate by ID
- `PUT /api/certificates/:id` - Update certificate
- `DELETE /api/certificates/:id` - Revoke certificate

- `GET /api/enrollments` - List all enrollments
- `POST /api/enrollments` - Enroll a student
- `GET /api/enrollments/:id` - Get enrollment by ID
- `PUT /api/enrollments/:id` - Update enrollment
- `DELETE /api/enrollments/:id` - Unenroll student

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Application entry point
│   ├── routes/
│   │   ├── auth/             # Authentication routes
│   │   │   ├── auth.routes.ts
│   │   │   └── types.ts
│   │   └── learning/         # Learning module routes
│   │       ├── learning.routes.ts
│   │       └── types.ts
│   ├── db/                   # Database configuration
│   └── generated/            # Generated code (e.g., Prisma)
├── tests/
│   ├── setup.ts              # Test setup
│   ├── health.test.ts        # Health endpoint tests
│   ├── auth.test.ts          # Auth module tests
│   └── learning.test.ts      # Learning module tests
├── jest.config.js            # Jest configuration
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 API Endpoints

### Health

- `GET /health` - Check server health status

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected route)

### Learning

- `GET /api/learning/modules` - Get all learning modules
- `GET /api/learning/modules/:moduleId` - Get specific module
- `GET /api/learning/progress/:userId` - Get user progress
- `POST /api/learning/progress/:userId/complete` - Mark lesson as complete

## 📝 Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=8080
NODE_ENV=development
```

## 🤝 Contributing

Please read the main [CONTRIBUTING.md](../CONTRIBUTING.md) file for details on how to contribute to
this project.

## 📜 License

MIT License - see the main [LICENSE](../LICENSE) file for details. │ ├── db/ # Database client and
Prisma setup │ ├── routes/ # Modular API routers │ │ ├── index.ts # Main router that mounts all
feature routers │ │ ├── students.ts │ │ ├── courses.ts │ │ ├── certificates.ts │ │ └──
enrollments.ts │ ├── middleware/ # Express middleware │ ├── generated/ # Generated Prisma client
(auto-generated) │ └── index.ts # Application entry point ├── prisma/ │ ├── schema.prisma # Database
schema definition │ └── migrations/ # Database migrations ├── prisma.config.ts # Prisma
configuration ├── .env # Environment variables (not committed) ├── .env.example # Environment
variables template └── package.json

````

## Adding New Features

To add a new feature router:

1. Create a new file in `src/routes/yourFeature.ts`
2. Define your routes using Express Router
3. Export the router as default
4. Import and mount it in `src/routes/index.ts`:

```typescript
import yourFeatureRouter from './yourFeature.js';
router.use('/your-feature', yourFeatureRouter);
````

## Database Schema

The database includes the following models:

- **Student**: Student information (id, email, firstName, lastName)
- **Course**: Course details (id, title, description, instructor, credits)
- **Certificate**: Certificates issued to students (id, studentId, courseId, certificateHash,
  status)
- **Enrollment**: Student course enrollments (id, studentId, courseId, status)

## Troubleshooting

### Can't connect to database

- Ensure PostgreSQL is running
- Check your `DATABASE_URL` in `.env`
- Verify the database exists

### Prisma client not generated

Run:

```bash
npx prisma generate
```

### Migration errors

Reset the database (development only):

```bash
npx prisma migrate reset
```
