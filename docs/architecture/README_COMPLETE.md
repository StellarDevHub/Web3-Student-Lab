# Web3 Student Lab - Complete Platform Documentation

A full-stack blockchain education platform with Soroban smart contracts, Stellar blockchain
integration, and modern React frontend.

## 🎯 Project Overview

Web3 Student Lab is a comprehensive learning platform that teaches blockchain development through
hands-on courses. Students can enroll in courses, complete lessons, and earn verifiable certificates
stored on the Stellar blockchain using Soroban smart contracts.

## 🏗️ Architecture

### Monorepo Structure

```
web3-student-lab/
├── frontend/          # Next.js 16 + React 19
├── backend/           # Node.js + Express + Prisma
├── contracts/         # Rust + Soroban Smart Contracts
├── docs/              # Documentation
└── docker-compose.yml # Container orchestration
```

### Technology Stack

**Frontend**:

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Axios
- @stellar/stellar-sdk

**Backend**:

- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication
- bcryptjs

**Smart Contracts**:

- Rust
- Soroban SDK
- Stellar Blockchain

## ✅ Implementation Status

### Frontend - COMPLETE ✅

- [x] Authentication (Login/Register)
- [x] Student Dashboard
- [x] Course Catalog
- [x] Course Enrollment
- [x] Certificate Verification
- [x] Responsive Design
- [x] Dark Mode
- [x] API Integration
- [x] Blockchain Integration (Soroban ready)

### Backend - COMPLETE ✅

- [x] RESTful API
- [x] JWT Authentication
- [x] User Management
- [x] Course Management
- [x] Enrollment System
- [x] Certificate Management
- [x] Database Schema
- [x] Middleware
- [x] Error Handling

### Smart Contract - READY ⚠️

- [x] Certificate Contract (Rust)
- [x] Issue Function
- [x] Verify Function
- [ ] Deployment to Stellar (requires manual deployment)
- [ ] Integration with backend (placeholder functions)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Rust (for contract development)
- Git

### Option 1: Automated Setup (Recommended)

```bash
# From project root
./setup.sh
```

This script will:

1. Install all dependencies
2. Create environment files
3. Set up the database
4. Build the frontend
5. Provide next steps

### Option 2: Manual Setup

#### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start server
npm run dev
```

Backend runs on: `http://localhost:8080`

#### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cp .env.local.example .env.local
# Edit if needed (default works for local development)

# Start development server
npm run dev
```

Frontend runs on: `http://localhost:3000`

#### 3. Database Setup

If you need to set up PostgreSQL:

```bash
# Using Docker (recommended)
docker-compose up -d postgres

# Or install locally and update DATABASE_URL in backend/.env
```

## 📚 Features

### For Students

1. **Browse Courses**
   - Search and filter courses
   - View detailed course information
   - See instructor details

2. **Enroll & Learn**
   - One-click enrollment
   - Track progress
   - Access course materials

3. **Earn Certificates**
   - Complete courses to earn certificates
   - Certificates stored on Stellar blockchain
   - Verifiable by anyone, anywhere

4. **Verify Credentials**
   - Public certificate verification
   - Instant blockchain lookup
   - Tamper-proof credentials

### For Administrators

1. **Course Management**
   - Create/update courses
   - Manage instructors
   - Set credit hours

2. **Student Management**
   - View enrollments
   - Track progress
   - Issue certificates

3. **Certificate Issuance**
   - Issue certificates on blockchain
   - Bulk issuance support
   - Verification dashboard

### Collaborative Tools

1. **Brainstorming Canvas**
   - Real-time infinite canvas for collaborative ideation
   - Multiple users brainstorm simultaneously
   - Sticky notes, shapes, and arrows for mapping ideas
   - User presence indicators (colored avatars)
   - Export to PNG, PDF, or JSON
   - Perfect for designing smart contract logic together

## 🔐 Authentication

The platform uses JWT-based authentication:

1. User registers with email/password
2. Password hashed with bcrypt
3. JWT token generated and returned
4. Token stored in localStorage
5. Token attached to all API requests
6. Automatic token refresh on expiration

## 📦 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new student
- `POST /api/auth/login` - Student login
- `GET /api/auth/me` - Get current user

### Courses

- `GET /api/courses` - List all courses
- `GET /api/courses/:id` - Get course details
- `POST /api/courses` - Create course (admin)
- `PUT /api/courses/:id` - Update course
- `DELETE /api/courses/:id` - Delete course

### Enrollments

- `GET /api/enrollments` - List enrollments
- `GET /api/enrollments/student/:id` - Student's enrollments
- `POST /api/enrollments` - Enroll in course
- `PUT /api/enrollments/:id` - Update enrollment
- `DELETE /api/enrollments/:id` - Cancel enrollment

### Certificates

- `GET /api/certificates` - List all certificates
- `GET /api/certificates/:id` - Get certificate
- `GET /api/certificates/student/:id` - Student's certificates
- `POST /api/certificates` - Issue certificate
- `PUT /api/certificates/:id` - Update certificate
- `DELETE /api/certificates/:id` - Revoke certificate

### Feedback

- `POST /api/feedback` - Submit course feedback
- `GET /api/feedback/course/:id` - Course feedback
- `GET /api/feedback/course/:id/summary` - Feedback summary

### Dashboard

- `GET /api/dashboard/stats` - Platform statistics
- `GET /api/dashboard/student/:id` - Student dashboard data

## 🔗 Blockchain Integration

### Certificate Contract

The Soroban smart contract stores certificates immutably on Stellar:

```rust
#[contractimpl]
impl CertificateContract {
    pub fn issue(env: Env, symbol: Symbol, student: String, course_name: String) -> Certificate {
        // Issues certificate to blockchain
    }

    pub fn get_certificate(env: Env, symbol: Symbol) -> Certificate {
        // Retrieves certificate from blockchain
    }
}
```

### Deploying the Contract

```bash
cd contracts

# Build contract
cargo build --target wasm32-unknown-unknown --release

# Deploy to Stellar testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/certificate_contract.wasm \
  --source <your-account> \
  --network testnet
```

Update `NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID` in frontend/.env.local after deployment.

## 🎨 Real-time Collaborative Canvas

### Overview

The Brainstorming Canvas feature enables students to collaboratively design and brainstorm smart contract logic in real-time:

- **Infinite Canvas**: Unlimited space to map out ideas
- **Real-time Sync**: Changes appear instantly using Yjs CRDT
- **Shared Elements**: Sticky notes, arrows, shapes, and text annotations
- **User Presence**: See who's editing with colored avatars
- **Export Options**: Download as PNG, PDF, or JSON

### Accessing the Canvas

```
http://localhost:3000/brainstorm
```

### Setup

The canvas requires a separate collaboration server:

```bash
# Terminal 1: Start main backend
cd backend
npm run dev

# Terminal 2: Start collaboration server
npx ts-node src/collaborationServer.ts
```

### Features

- **Create Canvas**: Click "New Canvas" to start brainstorming
- **Invite Collaborators**: Share the room ID with team members
- **Export**: Download your ideas as PNG, PDF, or JSON files

For detailed documentation, see [docs/BRAINSTORM_CANVAS_GUIDE.md](docs/BRAINSTORM_CANVAS_GUIDE.md)

## 🧪 Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Manual Testing Flow

1. Register account at `/auth/register`
2. Login at `/auth/login`
3. Browse courses at `/courses`
4. Enroll in a course
5. View dashboard at `/dashboard`
6. Verify certificate at `/verify`

## 📊 Database Schema

```prisma
model Student {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  firstName String
  lastName  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  enrollments   Enrollment[]
  certificates  Certificate[]
  feedback      Feedback[]
}

model Course {
  id          String   @id @default(cuid())
  title       String
  description String?
  instructor  String
  credits     Int      @default(3)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  enrollments   Enrollment[]
  certificates  Certificate[]
  feedback      Feedback[]
}

model Certificate {
  id          String   @id @default(cuid())
  studentId   String
  courseId    String
  issuedAt    DateTime @default(now())
  certificateHash String?
  status      String   @default("pending")

  student     Student  @relation(fields: [studentId], references: [id])
  course      Course   @relation(fields: [courseId], references: [id])
}

model Enrollment {
  id         String   @id @default(cuid())
  studentId  String
  courseId   String
  enrolledAt DateTime @default(now())
  status     String   @default("active")

  student    Student  @relation(fields: [studentId], references: [id])
  course     Course   @relation(fields: [courseId], references: [id])

  @@unique([studentId, courseId])
}

model Feedback {
  id          String   @id @default(cuid())
  studentId   String
  courseId    String
  rating      Int
  review      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  student     Student  @relation(fields: [studentId], references: [id])
  course      Course   @relation(fields: [courseId], references: [id])

  @@unique([studentId, courseId])
}
```

## 🌐 URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **API Health**: http://localhost:8080/health
- **API Docs**: See `docs/API_SCHEMA.md`

## 📖 Documentation

- `FRONTEND_IMPLEMENTATION_SUMMARY.md` - Frontend details
- `INTEGRATION_GUIDE.md` - Full stack integration
- `docs/API_SCHEMA.md` - API response formats
- `docs/ARCHITECTURE_DEEP_DIVE.md` - System architecture
- `SOROBAN_GUIDE.md` - Smart contract development

## 🔧 Development Tools

### Backend

- Prisma Studio: `npx prisma studio`
- Database migrations: `npx prisma migrate dev`

### Frontend

- Build analyzer: `npm run build`
- Linting: `npm run lint`

### Contracts

- Build: `cargo build --release`
- Test: `cargo test`
- Deploy: `soroban contract deploy`

## 🐛 Troubleshooting

### Backend won't start

- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Run `npx prisma generate`

### Frontend build errors

- Clear `.next` folder
- Delete `node_modules` and reinstall
- Check TypeScript version

### Database connection issues

- Ensure PostgreSQL is running
- Check database credentials
- Verify database exists

## 🚀 Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel deploy --prod
```

Set environment variables in Vercel dashboard.

### Backend (Railway/Heroku)

```bash
cd backend
# Connect to Railway or Heroku
# Deploy via Git or CLI
```

### Database (Supabase/Neon)

Use managed PostgreSQL service for production.

## 📈 Future Enhancements

- [ ] Video lesson player
- [ ] Quiz system
- [ ] Discussion forums
- [ ] Gamification (badges, points)
- [ ] Social features
- [ ] Admin dashboard
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Multi-language support
- [ ] Mobile app (React Native)

## 👥 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- Stellar Development Foundation for Soroban
- Next.js team for the amazing framework
- All contributors to this project

## 📞 Support

- Open an issue on GitHub
- Check documentation in `/docs`
- Contact: support@web3studentlab.com (placeholder)

---

**Web3 Student Lab** - Empowering the next generation of blockchain developers 🚀

Built with ❤️ using Next.js, Node.js, PostgreSQL, and Soroban
