# System Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WEB3 STUDENT LAB PLATFORM                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   FRONTEND   │ ◄─────► │   BACKEND    │ ◄─────► │  DATABASE    │
│   Next.js    │  REST   │   Node.js    │  SQL     │  PostgreSQL  │
│   React 19   │  JSON   │   Express    │          │   Prisma     │
└──────────────┘         └──────────────┘         └──────────────┘
       │                        │
       │                        │
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│   Browser    │         │   SMART      │
│   Storage    │         │  CONTRACTS   │
│  (localStorage)         │   Soroban    │
└──────────────┘         │   Stellar    │
                         └──────────────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   STELLAR    │
                         │  BLOCKCHAIN  │
                         └──────────────┘
```

## Component Flow

### User Journey

```
User Browser
    │
    ├─► Landing Page (/)
    │   ├─► Features Overview
    │   ├─► Course Preview
    │   └─► Call to Action
    │
    ├─► Registration (/auth/register)
    │   ├─► Create Account
    │   ├─► Store JWT Token
    │   └─► Redirect to Dashboard
    │
    ├─► Login (/auth/login)
    │   ├─► Authenticate
    │   ├─► Receive JWT Token
    │   └─► Restore Session
    │
    ├─► Dashboard (/dashboard)
    │   ├─► View Statistics
    │   ├─► See Enrolled Courses
    │   ├─► Check Certificates
    │   └─► Track Progress
    │
    ├─► Browse Courses (/courses)
    │   ├─► Search Courses
    │   ├─► View Details
    │   └─► Enroll (if authenticated)
    │
    ├─► Course Detail (/courses/[id])
    │   ├─► View Syllabus
    │   ├─► See Instructor
    │   └─► Enroll Button
    │
    └─► Verify Certificate (/verify)
        ├─► Enter Certificate ID
        ├─► Query Blockchain
        └─► Display Verification
```

## Data Flow

### Authentication Flow

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Client  │      │  Frontend│      │ Backend  │      │ Database │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ 1. Register     │                 │                 │
     │────────────────►│                 │                 │
     │                 │ 2. POST /register                │
     │                 │────────────────►│                 │
     │                 │                 │ 3. Create User  │
     │                 │                 │────────────────►│
     │                 │                 │◄────────────────│
     │                 │                 │ 4. User Data    │
     │                 │◄────────────────│                 │
     │ 5. Store Token  │◄────────────────│                 │
     │◄────────────────│                 │                 │
     │                 │                 │                 │
     │ 6. Login        │                 │                 │
     │────────────────►│                 │                 │
     │                 │ 7. POST /login                   │
     │                 │────────────────►│                 │
     │                 │                 │ 8. Verify Pass  │
     │                 │                 │────────────────►│
     │                 │                 │◄────────────────│
     │                 │◄────────────────│ 9. JWT Token    │
     │ 10. Auth Success│◄────────────────│                 │
     │◄────────────────│                 │                 │
```

### Course Enrollment Flow

```
User Action         Frontend            Backend             Database
    │                  │                   │                   │
    │ Browse Courses   │                   │                   │
    │─────────────────►│                   │                   │
    │                  │ GET /courses      │                   │
    │                  │──────────────────►│                   │
    │                  │                   │ SELECT * FROM     │
    │                  │                   │ courses           │
    │                  │                   │──────────────────►│
    │                  │◄──────────────────│                   │
    │ Display Courses  │◄──────────────────│                   │
    │◄─────────────────│                   │                   │
    │                  │                   │                   │
    │ Click Course     │                   │                   │
    │─────────────────►│                   │                   │
    │                  │ GET /courses/:id  │                   │
    │                  │──────────────────►│                   │
    │                  │                   │ SELECT course     │
    │                  │                   │ WHERE id          │
    │                  │                   │──────────────────►│
    │                  │◄──────────────────│                   │
    │ Show Details     │◄──────────────────│                   │
    │◄─────────────────│                   │                   │
    │                  │                   │                   │
    │ Enroll (Auth)    │                   │                   │
    │─────────────────►│                   │                   │
    │                  │ POST /enrollments │                   │
    │                  │ + JWT Token       │                   │
    │                  │──────────────────►│                   │
    │                  │                   │ Verify Token      │
    │                  │                   │ INSERT enrollment │
    │                  │                   │──────────────────►│
    │                  │◄──────────────────│                   │
    │ Enrollment OK    │◄──────────────────│                   │
    │◄─────────────────│                   │                   │
```

### Certificate Verification Flow

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Verifier│  │ Frontend │  │ Backend  │  │ Soroban  │  │  Stellar │
│   (User) │  │          │  │          │  │ Contract │  │ Network  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │              │             │              │
     │ Enter Cert  │              │              │              │
     │ ID          │              │              │              │
     │────────────►│              │              │              │
     │             │ Verify API   │              │              │
     │             │ Call         │              │              │
     │             │─────────────►│              │              │
     │             │              │ Simulate Tx  │              │
     │             │              │─────────────►│              │
     │             │              │              │ Read Storage │
     │             │              │              │─────────────►│
     │             │              │              │◄─────────────│
     │             │              │◄─────────────│ Certificate  │
     │             │◄─────────────│ Data         │              │
     │ Display     │◄─────────────│              │              │
     │ Result      │              │              │              │
     │◄────────────│              │              │              │
```

## Technology Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Next.js 16 App Router                                 │ │
│  │  - Pages: Home, Auth, Dashboard, Courses, Verify      │ │
│  │  - Components: Navigation, Cards, Forms               │ │
│  │  - Styling: Tailwind CSS 4                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React Context & State Management                      │ │
│  │  - AuthContext: User session management                │ │
│  │  - API Client: Axios with interceptors                 │ │
│  │  - Error Handling: Global error boundaries             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                          API LAYER                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Express.js REST API                                   │ │
│  │  - Routes: /api/auth, /api/courses, /api/...          │ │
│  │  - Middleware: CORS, JWT auth, request logging         │ │
│  │  - Controllers: Business logic handlers                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        DATA ACCESS LAYER                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Prisma ORM                                            │ │
│  │  - Schema: Student, Course, Enrollment, Certificate   │ │
│  │  - Migrations: Database versioning                     │ │
│  │  - Type Safety: Generated TypeScript types             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE LAYER                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL 14+                                        │ │
│  │  - Tables: students, courses, enrollments, ...        │ │
│  │  - Indexes: Optimized queries                          │ │
│  │  - Relations: Foreign keys, cascades                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN LAYER                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Soroban Smart Contracts                               │ │
│  │  - Contract: Certificate issuance & verification       │ │
│  │  - Storage: Immutable certificate records              │ │
│  │  - Network: Stellar blockchain                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY MEASURES                         │
├─────────────────────────────────────────────────────────────┤
│  Frontend Security                                          │
│  ├─ JWT Token Storage (localStorage)                        │
│  ├─ Automatic Token Attachment                              │
│  ├─ XSS Protection (React auto-escaping)                    │
│  └─ Input Validation                                        │
├─────────────────────────────────────────────────────────────┤
│  Backend Security                                           │
│  ├─ Password Hashing (bcrypt)                               │
│  ├─ JWT Authentication                                      │
│  ├─ CORS Configuration                                      │
│  ├─ SQL Injection Prevention (Prisma)                       │
│  └─ Rate Limiting (recommended)                             │
├─────────────────────────────────────────────────────────────┤
│  Blockchain Security                                        │
│  ├─ Immutable Records                                       │
│  ├─ Cryptographic Verification                              │
│  ├─ Decentralized Storage                                   │
│  └─ Smart Contract Access Control                           │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTION DEPLOYMENT                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│    Vercel    │         │   Railway    │         │   Supabase   │
│   (Frontend) │         │  (Backend)   │         │  (Database)  │
│              │         │              │         │              │
│  - CDN       │         │  - Express   │         │  - PostgreSQL│
│  - SSR/SSG   │◄───────►│  - API       │◄───────►│  - Prisma    │
│  - Edge      │  HTTPS  │  - Auth      │  SQL    │  - Pooling   │
└──────────────┘         └──────────────┘         └──────────────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ Stellar RPC  │
                         │  Providers   │
                         └──────────────┘
```

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────┐
│                  MONITORING STACK                            │
├─────────────────────────────────────────────────────────────┤
│  Frontend                                                   │
│  ├─ Performance: Lighthouse scores                          │
│  ├─ Errors: JavaScript exceptions                           │
│  └─ Analytics: User behavior                                │
├─────────────────────────────────────────────────────────────┤
│  Backend                                                    │
│  ├─ Logs: Request/response logging                          │
│  ├─ Metrics: API latency, error rates                       │
│  └─ Health: Database connectivity, uptime                   │
├─────────────────────────────────────────────────────────────┤
│  Database                                                   │
│  ├─ Query Performance: Slow query log                       │
│  ├─ Connections: Connection pool usage                      │
│  └─ Storage: Disk usage, growth rate                        │
└─────────────────────────────────────────────────────────────┘
```

This architecture ensures:

- ✅ Scalability
- ✅ Security
- ✅ Performance
- ✅ Maintainability
- ✅ Reliability
- ✅ User Experience
