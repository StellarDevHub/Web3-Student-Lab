# Subscription Management System Documentation

## Overview

The Subscription Management System is a comprehensive full-stack solution built with Soroban smart contracts, Node.js backend, and React/Next.js frontend. It provides tiered subscription plans, automated billing, real-time updates, and comprehensive analytics.

## Architecture

### Smart Contract (Soroban/Rust)
- **Location**: `contracts/src/subscription_manager.rs`
- **Features**: Tiered subscriptions, access control, emergency pause mechanisms
- **Security**: Comprehensive input validation, access control, gas optimization

### Backend API (Node.js/Express)
- **Location**: `backend/src/routes/subscriptions.routes.ts`
- **Features**: RESTful API, caching, WebSocket support, rate limiting
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for performance optimization

### Frontend (React/Next.js)
- **Location**: `frontend/src/components/subscriptions/SubscriptionManager.tsx`
- **Features**: Real-time dashboard, responsive design, WebSocket integration
- **State Management**: Zustand with persistence
- **UI Components**: Tailwind CSS with shadcn/ui

## Features

### Smart Contract Features

#### Core Functionality
- **Tiered Subscription Plans**: Basic, Pro, Enterprise tiers with different features
- **Flexible Billing Periods**: Monthly, Quarterly, Yearly options
- **Access Control**: Admin-only functions for plan management
- **Emergency Controls**: Pause/unpause and emergency pause mechanisms
- **Comprehensive Events**: All actions emit detailed events for tracking

#### Security Features
- **Input Validation**: All user inputs are validated
- **Access Control**: Role-based permissions for all operations
- **Gas Optimization**: Efficient storage patterns and minimal gas usage
- **Emergency Recovery**: Pause mechanisms for critical situations

#### Data Structures
```rust
pub struct SubscriptionPlan {
    pub tier: SubscriptionTier,
    pub name: String,
    pub description: String,
    pub price: i128,
    pub currency: Symbol,
    pub billing_period: BillingPeriod,
    pub features: Vec<String>,
    pub max_users: u32,
    pub is_active: bool,
}

pub struct Subscription {
    pub user: Address,
    pub plan_tier: SubscriptionTier,
    pub start_date: u64,
    pub end_date: u64,
    pub last_billing_date: u64,
    pub next_billing_date: u64,
    pub status: SubscriptionStatus,
    pub auto_renew: bool,
    pub payment_method: Address,
    pub subscription_id: u64,
    pub created_at: u64,
}
```

### Backend API Features

#### RESTful Endpoints

**Public Routes**
- `GET /subscriptions/plans` - Get all subscription plans
- `GET /subscriptions/plans/:tier` - Get specific plan by tier

**Protected Routes** (Authentication Required)
- `GET /subscriptions/user` - Get user's subscriptions
- `POST /subscriptions/create` - Create new subscription
- `POST /subscriptions/:id/cancel` - Cancel subscription
- `POST /subscriptions/:id/renew` - Renew subscription
- `GET /subscriptions/:id` - Get subscription details
- `GET /subscriptions/:id/payments` - Get payment history

**Admin Routes** (Admin Role Required)
- `GET /subscriptions/admin/subscriptions` - Get all subscriptions
- `GET /subscriptions/admin/analytics` - Get analytics data
- `POST /subscriptions/admin/plans` - Update subscription plan
- `POST /subscriptions/admin/pause` - Pause contract
- `POST /subscriptions/admin/unpause` - Unpause contract
- `POST /subscriptions/admin/emergency-pause` - Emergency pause

#### Security Features
- **Authentication**: JWT-based authentication
- **Rate Limiting**: Configurable rate limits per endpoint
- **Input Validation**: Zod schema validation
- **Caching**: Redis caching for performance
- **Logging**: Comprehensive logging with Winston

#### Database Schema
```sql
-- Subscription Plans
CREATE TABLE subscription_plans (
  id SERIAL PRIMARY KEY,
  tier VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  billing_period VARCHAR(20) NOT NULL,
  features JSONB,
  max_users INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  plan_id INTEGER REFERENCES subscription_plans(id),
  status VARCHAR(20) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  last_billing_date TIMESTAMP NOT NULL,
  next_billing_date TIMESTAMP NOT NULL,
  auto_renew BOOLEAN DEFAULT false,
  payment_method VARCHAR(255) NOT NULL,
  stellar_transaction_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id),
  user_id VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(255),
  billing_period VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Frontend Features

#### User Interface
- **Dashboard**: Overview of subscriptions and analytics
- **Plan Management**: Browse and subscribe to plans
- **Billing History**: View payment history and receipts
- **Real-time Updates**: WebSocket integration for live updates
- **Responsive Design**: Mobile-friendly interface

#### Components
- **SubscriptionManager**: Main dashboard component
- **Plan Cards**: Interactive plan selection
- **Payment History**: Detailed payment records
- **Analytics Dashboard**: Charts and metrics
- **Status Indicators**: Real-time subscription status

#### State Management
```typescript
interface SubscriptionStore {
  subscriptions: Subscription[];
  plans: SubscriptionPlan[];
  analytics: SubscriptionAnalytics | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchUserSubscriptions: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchAnalytics: (period?: string) => Promise<void>;
  createSubscription: (data: CreateSubscriptionData) => Promise<void>;
  cancelSubscription: (subscriptionId: number) => Promise<void>;
  renewSubscription: (subscriptionId: number) => Promise<void>;
}
```

## Installation & Setup

### Prerequisites
- Node.js 18+
- Rust 1.70+
- PostgreSQL 14+
- Redis 6+
- Soroban CLI

### Smart Contract Setup

1. **Install Soroban CLI**
```bash
cargo install --locked soroban-cli
```

2. **Build Contract**
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

3. **Deploy to Testnet**
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --source <ADMIN_KEY> \
  --network testnet
```

4. **Initialize Contract**
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_KEY> \
  --network testnet \
  -- \
  initialize \
  --admin <ADMIN_ADDRESS> \
  --treasury <TREASURY_ADDRESS>
```

### Backend Setup

1. **Install Dependencies**
```bash
cd backend
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

4. **Start Backend**
```bash
npm run dev
```

### Frontend Setup

1. **Install Dependencies**
```bash
cd frontend
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

3. **Start Frontend**
```bash
npm run dev
```

## Usage

### Creating a Subscription

1. **Browse Plans**: Navigate to the Plans tab
2. **Select Plan**: Choose a tier and billing period
3. **Payment**: Confirm payment via Stellar wallet
4. **Confirmation**: Receive subscription confirmation

### Managing Subscriptions

1. **View Subscriptions**: Check the Overview tab
2. **Cancel Subscription**: Use the Cancel button
3. **Renew Subscription**: Use the Renew button
4. **View History**: Check the Billing tab

### Admin Functions

1. **Analytics**: View subscription metrics
2. **Plan Management**: Update plans and pricing
3. **Contract Control**: Pause/unpause as needed
4. **User Management**: Monitor all subscriptions

## API Documentation

### Authentication

All protected endpoints require a JWT token:
```http
Authorization: Bearer <JWT_TOKEN>
```

### Response Format

All API responses follow this format:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Handling

Errors include detailed information:
```json
{
  "success": false,
  "message": "Validation failed",
  "error": [
    {
      "field": "tier",
      "message": "Invalid subscription tier"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Testing

### Smart Contract Tests

Run comprehensive tests:
```bash
cd contracts
cargo test -- --nocapture
```

### Backend Tests

Run API tests:
```bash
cd backend
npm run test
npm run test:coverage
```

### Frontend Tests

Run component tests:
```bash
cd frontend
npm run test
```

### Integration Tests

Run full integration tests:
```bash
npm run test:integration
```

## Security Considerations

### Smart Contract Security

1. **Access Control**: All admin functions require admin role
2. **Input Validation**: All inputs are validated before processing
3. **Reentrancy Protection**: Checks-effects-interactions pattern
4. **Gas Optimization**: Efficient storage and computation

### Backend Security

1. **Authentication**: JWT tokens with expiration
2. **Rate Limiting**: Prevent abuse and DDoS
3. **Input Validation**: Zod schemas for all inputs
4. **SQL Injection**: Parameterized queries with Prisma
5. **XSS Protection**: Input sanitization and output encoding

### Frontend Security

1. **HTTPS**: Always use HTTPS in production
2. **Content Security Policy**: Restrict resource loading
3. **Input Validation**: Client-side validation as first line
4. **Secure Storage**: Use httpOnly cookies for tokens

## Performance Optimization

### Smart Contract Optimization

1. **Storage Efficiency**: Minimal storage usage
2. **Gas Optimization**: Efficient computation patterns
3. **Batch Operations**: Process multiple operations when possible

### Backend Optimization

1. **Caching**: Redis caching for frequently accessed data
2. **Database Indexing**: Proper indexes for queries
3. **Connection Pooling**: Efficient database connections
4. **Compression**: Gzip compression for responses

### Frontend Optimization

1. **Code Splitting**: Lazy load components
2. **Image Optimization**: Optimized images and formats
3. **Bundle Size**: Minimize JavaScript bundle
4. **Caching**: Browser caching strategies

## Monitoring & Analytics

### Metrics Tracked

1. **Subscription Metrics**: Active, new, cancelled subscriptions
2. **Revenue Metrics**: Total revenue, MRR, ARR
3. **User Metrics**: User engagement, retention
4. **Performance Metrics**: Response times, error rates

### Monitoring Tools

1. **Application Monitoring**: Custom dashboard
2. **Error Tracking**: Comprehensive error logging
3. **Performance Monitoring**: Response time tracking
4. **Business Intelligence**: Analytics dashboard

## Troubleshooting

### Common Issues

1. **Contract Deployment**: Ensure proper network configuration
2. **Database Connection**: Check connection strings and credentials
3. **WebSocket Issues**: Verify firewall and proxy settings
4. **Payment Processing**: Check Stellar network status

### Debugging Tools

1. **Logs**: Comprehensive logging at all levels
2. **Debug Mode**: Enable debug logging for detailed info
3. **Health Checks**: Monitor system health endpoints
4. **Error Tracking**: Automatic error reporting

## Deployment

### Production Deployment

1. **Smart Contract**: Deploy to mainnet after thorough testing
2. **Backend**: Use container orchestration (Kubernetes/Docker)
3. **Frontend**: Deploy to CDN with proper caching
4. **Database**: Use managed database service

### Environment Variables

Critical environment variables:
```bash
# Database
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# Authentication
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"

# Stellar
STELLAR_HORIZON_URL="https://horizon.stellar.org"
STELLAR_TREASURY_SECRET="your-treasury-secret"

# Application
NODE_ENV="production"
PORT=8080
FRONTEND_URL="https://your-frontend.com"
```

## Contributing

### Development Workflow

1. **Fork Repository**: Create your own fork
2. **Create Branch**: Feature branch for changes
3. **Write Tests**: Comprehensive test coverage
4. **Submit PR**: Pull request with description
5. **Code Review**: Review and merge

### Code Standards

1. **Rust**: Follow rustfmt and clippy recommendations
2. **TypeScript**: Use strict mode and proper typing
3. **Testing**: >90% code coverage required
4. **Documentation**: Update docs for all changes

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check this guide first
- **Community**: Join our Discord community
- **Email**: support@web3-student-lab.com
