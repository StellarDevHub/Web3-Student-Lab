# Full Stack Integration Guide

This guide explains how the frontend, backend, and smart contract work together in the Web3 Student
Lab platform.

## Architecture Overview

```
┌─────────────┐      HTTP/REST       ┌─────────────┐      RPC Calls      ┌──────────────┐
│   Frontend  │ ◄─────────────────►  │   Backend   │ ◄─────────────────► │   Soroban    │
│  (Next.js)  │     JSON + JWT       │  (Node.js)  │   Transactions      │  (Stellar)   │
└─────────────┘                      └─────────────┘                     └──────────────┘
       │                                   │                                      │
       │                                   │                                      │
       ▼                                   ▼                                      ▼
  Browser/Client                    PostgreSQL DB                         Blockchain State
  - Authentication                  - Users                               - Certificates
  - UI Rendering                    - Courses                             - Immutable Records
  - Blockchain Verification         - Enrollments                         - Verification
                                    - Certificates
```

## Component Integration

### 1. Frontend ↔ Backend Communication

**API Base URL**: `http://localhost:8080/api`

All API communication happens through the typed client in `/frontend/src/lib/api.ts`.

#### Authentication Flow

```typescript
// Frontend: User login
const { user, token } = await authAPI.login({
  email: 'student@example.com',
  password: 'password123',
});

// Token is automatically stored in localStorage
// and attached to subsequent requests

// Protected route example
const courses = await coursesAPI.getAll();
// Header: Authorization: Bearer <token>
```

#### Backend API Endpoints

| Endpoint                    | Method | Frontend Function                  | Description              |
| --------------------------- | ------ | ---------------------------------- | ------------------------ |
| `/auth/register`            | POST   | `authAPI.register()`               | Register new student     |
| `/auth/login`               | POST   | `authAPI.login()`                  | Student login            |
| `/auth/me`                  | GET    | `authAPI.getCurrentUser()`         | Get current user         |
| `/courses`                  | GET    | `coursesAPI.getAll()`              | List all courses         |
| `/courses/:id`              | GET    | `coursesAPI.getById()`             | Get course details       |
| `/enrollments`              | POST   | `enrollmentsAPI.enroll()`          | Enroll in course         |
| `/certificates/student/:id` | GET    | `certificatesAPI.getByStudentId()` | Get student certificates |
| `/verify`                   | GET    | `verifyCertificateOnChain()`       | Verify on blockchain     |

### 2. Backend ↔ Database

The backend uses Prisma ORM to interact with PostgreSQL.

**Schema Models**:

- `Student` - User accounts
- `Course` - Available courses
- `Enrollment` - Course enrollments
- `Certificate` - Issued certificates
- `Feedback` - Course reviews

**Database Connection**:

```typescript
// Backend: src/db/index.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export default prisma;
```

### 3. Backend ↔ Soroban Smart Contract

The backend integrates with Soroban contracts for certificate issuance and verification.

**Contract Functions**:

- `issue(symbol, student, course_name)` - Issue certificate on-chain
- `get_certificate(symbol)` - Retrieve certificate from blockchain

**Integration Point**:

```typescript
// Backend: When issuing a certificate
await prisma.certificate.create({
  data: {
    studentId,
    courseId,
    status: 'pending', // Will be updated after on-chain issuance
  },
});

// Then call Soroban contract
const txHash = await issueCertificateOnChain(symbol, student, courseName);
```

### 4. Frontend ↔ Blockchain (Direct Verification)

The frontend can directly verify certificates on the blockchain without going through the backend.

```typescript
// Frontend: Verify certificate
import { verifyCertificateOnChain } from '@/lib/soroban';

const certData = await verifyCertificateOnChain('CERTIFICATE_SYMBOL');
// Returns: { symbol, student, course_name, issue_date }
```

## Data Flow Examples

### Example 1: Student Enrollment Flow

1. **Frontend**: Student browses courses (`/courses`)

   ```typescript
   const courses = await coursesAPI.getAll();
   ```

2. **Backend**: Fetches courses from database

   ```typescript
   const courses = await prisma.course.findMany();
   ```

3. **Frontend**: Student clicks "Enroll" on course detail page

   ```typescript
   await enrollmentsAPI.enroll(user.id, course.id);
   ```

4. **Backend**: Creates enrollment record

   ```typescript
   const enrollment = await prisma.enrollment.create({
     data: { studentId, courseId, status: 'active' },
   });
   ```

5. **Frontend**: Updates UI to show enrollment success

### Example 2: Certificate Issuance & Verification

1. **Backend**: Student completes course

   ```typescript
   // Create certificate in database
   const cert = await prisma.certificate.create({
     data: {
       studentId,
       courseId,
       status: 'pending',
     },
   });
   ```

2. **Backend**: Issue on Soroban blockchain

   ```typescript
   const symbol = `CERT-${course.code}-${student.id}`;
   await sorobanClient.issue(symbol, student.name, course.title);

   // Update certificate with on-chain hash
   await prisma.certificate.update({
     where: { id: cert.id },
     data: {
       certificateHash: txHash,
       status: 'issued',
     },
   });
   ```

3. **Frontend**: Display certificate to student

   ```typescript
   const certificates = await certificatesAPI.getByStudentId(user.id);
   ```

4. **Anyone**: Verify certificate authenticity
   ```typescript
   const cert = await verifyCertificateOnChain('CERT-SYMBOL');
   console.log('Verified:', cert.student === 'Expected Student');
   ```

## Environment Configuration

### Frontend (.env.local)

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8080/api

# Soroban/Stellar
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-test.stellar.org:443
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=CD...  # Deployed contract ID
```

### Backend (.env)

```env
PORT=8080
DATABASE_URL="postgresql://user:pass@localhost:5432/web3lab"
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development

# Soroban Configuration
SOROBAN_RPC_URL=https://soroban-test.stellar.org:443
SOROBAN_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
CONTRACT_ADMIN_SECRET=SA...  # Admin wallet secret key
```

## Setup Instructions

### 1. Database Setup

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 2. Backend Server

```bash
cd backend
npm run dev
# Server runs on http://localhost:8080
```

### 3. Frontend Development

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with correct values
npm run dev
# Frontend runs on http://localhost:3000
```

### 4. Smart Contract Deployment (Optional)

```bash
cd contracts
# Build contract
cargo build --target wasm32-unknown-unknown --release

# Deploy to Stellar testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/certificate_contract.wasm \
  --source admin-account
```

## Testing Integration

### Test Authentication

```bash
# Register new user
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test Course Enrollment

```bash
# Get courses
curl http://localhost:8080/api/courses

# Enroll in course (requires auth token)
curl -X POST http://localhost:8080/api/enrollments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "studentId": "student-id",
    "courseId": "course-id"
  }'
```

## Troubleshooting

### Frontend Can't Connect to Backend

**Problem**: CORS errors or connection refused

**Solutions**:

1. Ensure backend is running: `curl http://localhost:8080/health`
2. Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
3. Verify backend CORS configuration allows `http://localhost:3000`

### Authentication Not Working

**Problem**: 401 Unauthorized errors

**Solutions**:

1. Clear browser localStorage
2. Re-login to get fresh token
3. Check JWT_SECRET matches in backend
4. Verify token expiration time

### Blockchain Verification Fails

**Problem**: Can't verify certificates on-chain

**Solutions**:

1. Check `NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID` is set
2. Verify Soroban RPC endpoint is accessible
3. Ensure contract is deployed to the network
4. Check network passphrase matches (testnet vs mainnet)

## Security Considerations

### Frontend Security

- ✅ JWT tokens stored in localStorage (consider httpOnly cookies for production)
- ✅ HTTPS required in production
- ✅ Input validation on all forms
- ✅ XSS protection via React's automatic escaping
- ⚠️ Implement CSRF protection for production

### Backend Security

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ SQL injection prevention via Prisma
- ✅ CORS configuration
- ✅ Rate limiting (implement for production)
- ⚠️ Add request validation middleware

### Blockchain Security

- ✅ Immutable certificate records
- ✅ Cryptographic verification
- ⚠️ Secure admin key management
- ⚠️ Implement access controls for certificate issuance
- ⚠️ Multi-sig for production contract administration

## Performance Optimization

### Frontend

- Static generation for landing pages
- Incremental static regeneration for course listings
- Client-side caching of API responses
- Lazy loading of heavy components

### Backend

- Database indexing on frequently queried fields
- Connection pooling via Prisma
- Response caching for public endpoints
- Redis for session management (production)

### Blockchain

- Batch certificate issuance for multiple students
- Optimize contract storage usage
- Use Soroban's simulation for gas estimation

## Monitoring & Logging

### Frontend Monitoring

```typescript
// Add error tracking
try {
  await apiCall();
} catch (error) {
  console.error('API Error:', error);
  // Send to error tracking service (e.g., Sentry)
}
```

### Backend Logging

```typescript
// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});
```

## Next Steps

1. **Deploy Contract**: Deploy Soroban contract to Stellar testnet
2. **Seed Database**: Add sample courses and users
3. **Test Flows**: Complete end-to-end testing of all user flows
4. **Production Setup**: Configure production environment variables
5. **Monitoring**: Set up error tracking and analytics

---

This integration ensures seamless communication between all three layers while maintaining security,
performance, and scalability.
