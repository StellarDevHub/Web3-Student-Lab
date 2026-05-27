# Web3 Student Lab - Frontend

A modern, responsive frontend for the Web3 Student Lab platform built with Next.js 16, React 19, and Tailwind CSS.

## Features

### 🎓 Learning Platform

- **Course Catalog** - Browse and search available blockchain courses
- **Course Details** - View detailed course information and enroll
- **Student Dashboard** - Track progress, enrolled courses, and certificates
- **Enrollment System** - One-click enrollment in courses

### 🔐 Authentication

- **User Registration** - Create new student accounts
- **Login/Logout** - Secure JWT-based authentication
- **Session Management** - Persistent login sessions with automatic token refresh
- **Protected Routes** - Authenticated-only access to dashboard and courses

### 🏆 Blockchain Integration

- **Certificate Verification** - Verify certificates on Soroban/Stellar blockchain
- **On-Chain Credentials** - Tamper-proof certificate storage
- **Real-time Verification** - Instant blockchain lookup and validation

### 🎨 User Interface

- **Responsive Design** - Mobile-first design that works on all devices
- **Dark Mode** - Automatic dark mode support based on system preferences
- **Modern UI** - Clean, professional interface with smooth animations
- **Accessibility** - WCAG compliant components and semantic HTML

## Tech Stack

- **Framework**: Next.js 16.1.6 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **HTTP Client**: Axios
- **Blockchain**: @stellar/stellar-sdk
- **State Management**: React Context API
- **Authentication**: JWT tokens

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── auth/
│   │   │   ├── login/         # Login page
│   │   │   └── register/      # Registration page
│   │   ├── courses/
│   │   │   └── [id]/          # Dynamic course detail page
│   │   ├── dashboard/         # Student dashboard
│   │   ├── verify/            # Certificate verification
│   │   ├── page.tsx           # Home page
│   │   ├── layout.tsx         # Root layout with providers
│   │   └── globals.css        # Global styles
│   ├── contexts/
│   │   └── AuthContext.tsx    # Authentication context & provider
│   ├── lib/
│   │   ├── api.ts             # API client & endpoints
│   │   ├── api-client.ts      # Axios instance configuration
│   │   └── soroban.ts         # Soroban blockchain utilities
│   └── types/                 # TypeScript type definitions
├── public/                     # Static assets
├── .env.local.example         # Environment variables template
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend server running on port 8080
- (Optional) Soroban RPC endpoint for blockchain features

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` file:

```bash
cp .env.local.example .env.local
```

3. Configure environment variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-test.stellar.org:443
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=your_contract_id_here
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Production

Build for production:

```bash
npm run build
npm start
```

## Available Pages

- `/` - Landing page with features overview
- `/auth/login` - User login
- `/auth/register` - User registration
- `/dashboard` - Student dashboard (requires auth)
- `/courses` - Course catalog
- `/courses/[id]` - Individual course details
- `/verify` - Certificate verification tool
- `/ideas`, `/playground`, `/roadmap`, `/simulator` - Additional feature pages

## API Integration

The frontend connects to the backend through a typed API client:

```typescript
// Example usage
import { coursesAPI, authAPI } from "@/lib/api";

// Get all courses
const courses = await coursesAPI.getAll();

// Login
const { user, token } = await authAPI.login({ email, password });

// Enroll in course
await enrollmentsAPI.enroll(studentId, courseId);
```

## Blockchain Features

The application integrates with Soroban smart contracts for certificate verification:

```typescript
import { verifyCertificateOnChain } from "@/lib/soroban";

// Verify a certificate
const cert = await verifyCertificateOnChain("CERTIFICATE_SYMBOL");
```

**Note**: Full blockchain integration requires:

1. Deployed Soroban contract on Stellar network
2. Contract ID configured in environment variables
3. Soroban RPC endpoint access

## Authentication Flow

1. User registers or logs in
2. Backend returns JWT token
3. Token stored in localStorage
4. Token automatically attached to API requests
5. Protected routes check authentication status
6. Token validated on session restore

## State Management

Authentication state is managed via React Context:

```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();

  return <div>Welcome, {user?.name}!</div>;
}
```

## Styling System

Built with Tailwind CSS utility classes:

```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow">
  {/* Content */}
</div>
```

Features:

- Dark mode support via `dark:` variants
- Responsive breakpoints: `sm:`, `md:`, `lg:`
- Custom color palette
- Smooth transitions and animations

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:

- Check the documentation
- Open an issue on GitHub
- Contact the development team

---

**Web3 Student Lab** - Building the future of blockchain education
