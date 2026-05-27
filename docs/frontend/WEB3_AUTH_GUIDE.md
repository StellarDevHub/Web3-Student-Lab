# Web3 Wallet Authentication Guide

This guide explains the secure Web3 wallet signature authentication system implemented for the Web3 Student Lab platform.

## Overview

The Web3 authentication system allows users to log in using their Ethereum wallets instead of traditional email/password credentials. The system uses cryptographic signatures to verify ownership of the wallet address and issues standard JWT tokens for session management.

## Architecture

### Backend Components

1. **AuthNonce Model** - Stores cryptographic nonces for wallet authentication
2. **Web3 Service** - Handles nonce generation and signature verification
3. **Authentication Routes** - Provides REST endpoints for Web3 authentication
4. **Rate Limiting** - Prevents abuse of nonce generation

### Frontend Components

1. **Web3 Service** - Manages wallet connection and authentication flow
2. **Web3Login Component** - React component for wallet authentication UI
3. **MetaMask Integration** - Connects to browser wallet providers

## Security Features

- **Cryptographic Nonces**: Each authentication request uses a unique, time-limited nonce
- **Signature Verification**: Uses Ethers.js to cryptographically verify wallet signatures
- **Rate Limiting**: Prevents nonce endpoint abuse (10 requests/minute per IP)
- **JWT Tokens**: Standard access and refresh token pattern
- **Nonce Cleanup**: Automatic cleanup of expired nonces

## API Endpoints

### GET /api/auth/nonce

Generates and stores a cryptographic nonce for a wallet address.

**Query Parameters:**
- `walletAddress` (string): Ethereum wallet address (0x-prefixed, 42 characters)

**Response:**
```json
{
  "nonce": "ABC123...XYZ",
  "expiresAt": "2024-01-01T12:05:00.000Z"
}
```

**Rate Limiting:** 10 requests per minute per IP address

### POST /api/auth/verify

Verifies a wallet signature and authenticates the user.

**Request Body:**
```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45",
  "signature": "0x4a5b6c7d8e9f0123456789abcdef...",
  "nonce": "ABC123...XYZ"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "email": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45@wallet.auth",
    "name": "Wallet User",
    "did": null
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Database Schema

### AuthNonce Table

```sql
model AuthNonce {
  id            String   @id @default(cuid())
  walletAddress String
  nonce         String   @unique
  expiresAt     DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Student Model Updates

The existing `Student` model includes a `walletAddress` field for Web3 authentication:

```sql
model Student {
  // ... existing fields
  walletAddress String? @unique
  // ... existing fields
}
```

## Authentication Flow

1. **Client Request**: User clicks "Connect Wallet"
2. **Wallet Connection**: Frontend connects to MetaMask/compatible wallet
3. **Nonce Request**: Frontend requests nonce from `/api/auth/nonce`
4. **Message Signing**: Frontend constructs message and requests user signature
5. **Signature Verification**: Backend verifies signature using Ethers.js
6. **User Creation/Retrieval**: Backend finds or creates user record
7. **Token Issuance**: Backend issues JWT access and refresh tokens
8. **Session Storage**: Frontend stores tokens for authenticated requests

## Frontend Implementation

### Web3 Service Usage

```typescript
import { web3AuthService } from '../services/web3.service';

// Authenticate with wallet
try {
  const authResponse = await web3AuthService.authenticate();
  console.log('Authenticated:', authResponse.user);
} catch (error) {
  console.error('Authentication failed:', error);
}

// Check if already connected
const user = web3AuthService.getStoredUser();
if (user) {
  console.log('Already authenticated:', user);
}

// Disconnect wallet
web3AuthService.disconnect();
```

### React Component Integration

```tsx
import Web3Login from '../components/Web3Login';

export default function LoginPage() {
  const handleLoginSuccess = (authResponse) => {
    // Handle successful authentication
    console.log('User logged in:', authResponse.user);
  };

  const handleLoginError = (error) => {
    // Handle authentication error
    console.error('Login failed:', error);
  };

  return (
    <Web3Login
      onLoginSuccess={handleLoginSuccess}
      onLoginError={handleLoginError}
    />
  );
}
```

## Security Considerations

### Nonce Security
- Nonces are cryptographically random (32 characters)
- Nonces expire after 5 minutes
- Used nonces are immediately deleted
- Expired nonces are periodically cleaned up

### Signature Verification
- Uses Ethers.js `verifyMessage()` for secure signature recovery
- Validates that recovered address matches claimed wallet address
- Prevents signature replay attacks through nonce usage

### Rate Limiting
- Sliding window rate limiter using Redis
- 10 nonce requests per minute per IP
- Prevents database spam and abuse

### Token Security
- Standard JWT tokens with configurable expiration
- Access tokens: 15 minutes (configurable)
- Refresh tokens: 7 days (configurable)
- Token rotation on refresh

## Testing

### Backend Testing

```bash
# Test nonce generation
curl "http://localhost:3000/api/auth/nonce?walletAddress=0x1234567890123456789012345678901234567890"

# Test signature verification (requires valid signature)
curl -X POST "http://localhost:3000/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "signature": "0x...",
    "nonce": "ABC123...XYZ"
  }'
```

### Frontend Testing

1. Install MetaMask browser extension
2. Navigate to the Web3 authentication page
3. Click "Connect Wallet" and approve in MetaMask
4. Sign the authentication message
5. Verify successful authentication and token storage

## Dependencies

### Backend
- `ethers`: Ethereum library for signature verification
- `express-rate-limit`: Rate limiting middleware
- `@prisma/client`: Database ORM
- `jsonwebtoken`: JWT token handling

### Frontend
- `ethers`: Ethereum library for wallet interaction
- `@metamask/detect-provider`: MetaMask detection
- `react`: UI framework
- `lucide-react`: Icon library

## Configuration

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/web3_student_lab

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379
```

### Nonce Configuration

```typescript
// In web3.service.ts
const NONCE_EXPIRY_MINUTES = 5; // Nonce expiration time
const NONCE_LENGTH = 32; // Nonce string length
```

## Troubleshooting

### Common Issues

1. **MetaMask Not Installed**
   - Error: "MetaMask is not installed"
   - Solution: Install MetaMask browser extension

2. **Invalid Wallet Address**
   - Error: "Invalid wallet address format"
   - Solution: Ensure address is 0x-prefixed and 42 characters long

3. **Signature Verification Failed**
   - Error: "Invalid signature"
   - Solution: Ensure the correct message format was signed

4. **Nonce Expired**
   - Error: "Invalid or expired nonce"
   - Solution: Request a fresh nonce and retry

5. **Rate Limited**
   - Error: "Too many requests"
   - Solution: Wait for rate limit window to reset

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

## Future Enhancements

1. **Multi-Wallet Support**: Support for WalletConnect, Coinbase Wallet, etc.
2. **Multi-Chain Support**: Support for other EVM-compatible chains
3. **Biometric Authentication**: Integration with wallet biometric features
4. **Session Management**: Advanced session tracking and management
5. **Audit Logging**: Comprehensive audit trail for Web3 authentication events

## Contributing

When contributing to the Web3 authentication system:

1. Follow the existing code patterns and security practices
2. Add comprehensive tests for new features
3. Update documentation for any API changes
4. Ensure proper error handling and user feedback
5. Test with multiple wallet providers when possible

## License

This Web3 authentication implementation is part of the Web3 Student Lab project and follows the same licensing terms.
