# Subscription Management API Documentation

## Base URL
```
http://localhost:8080/api/v1
```

## Authentication

All protected endpoints require authentication using a JWT token:

```http
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow this standard format:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- **General endpoints**: 100 requests per 15 minutes
- **Subscription operations**: 10 requests per 15 minutes
- **Admin endpoints**: 50 requests per 15 minutes

---

## Public Endpoints

### Get All Subscription Plans

Retrieve all available subscription plans.

```http
GET /subscriptions/plans
```

**Response:**
```json
{
  "success": true,
  "message": "Plans retrieved successfully",
  "data": [
    {
      "id": "1",
      "tier": "BASIC",
      "name": "Basic",
      "description": "Perfect for getting started",
      "price": 10000000,
      "currency": "XLM",
      "billingPeriod": "MONTHLY",
      "features": [
        "Access to basic courses",
        "Email support",
        "Certificate of completion"
      ],
      "maxUsers": 1,
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "2",
      "tier": "PRO",
      "name": "Pro",
      "description": "For serious learners",
      "price": 25000000,
      "currency": "XLM",
      "billingPeriod": "QUARTERLY",
      "features": [
        "Access to all courses",
        "Priority support",
        "Verified certificates",
        "Course completion tracking"
      ],
      "maxUsers": 3,
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Specific Plan

Retrieve a specific subscription plan by tier.

```http
GET /subscriptions/plans/{tier}
```

**Path Parameters:**
- `tier` (string): Subscription tier (BASIC, PRO, ENTERPRISE)

**Response:**
```json
{
  "success": true,
  "message": "Plan retrieved successfully",
  "data": {
    "id": "1",
    "tier": "BASIC",
    "name": "Basic",
    "description": "Perfect for getting started",
    "price": 10000000,
    "currency": "XLM",
    "billingPeriod": "MONTHLY",
    "features": [
      "Access to basic courses",
      "Email support",
      "Certificate of completion"
    ],
    "maxUsers": 1,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Protected Endpoints (Authentication Required)

### Get User Subscriptions

Retrieve all subscriptions for the authenticated user.

```http
GET /subscriptions/user
```

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User subscriptions retrieved successfully",
  "data": [
    {
      "id": 1,
      "userId": "user123",
      "planId": "1",
      "status": "ACTIVE",
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-02-01T00:00:00.000Z",
      "lastBillingDate": "2024-01-01T00:00:00.000Z",
      "nextBillingDate": "2024-02-01T00:00:00.000Z",
      "autoRenew": true,
      "paymentMethod": "stellar",
      "stellarTransactionId": "tx123...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "plan": {
        "id": "1",
        "tier": "BASIC",
        "name": "Basic",
        "description": "Perfect for getting started",
        "price": 10000000,
        "currency": "XLM",
        "billingPeriod": "MONTHLY",
        "features": [
          "Access to basic courses",
          "Email support",
          "Certificate of completion"
        ],
        "maxUsers": 1,
        "isActive": true
      },
      "payments": [
        {
          "id": 1,
          "subscriptionId": 1,
          "userId": "user123",
          "amount": 10000000,
          "currency": "XLM",
          "status": "COMPLETED",
          "transactionId": "tx123...",
          "billingPeriod": "MONTHLY",
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

### Create Subscription

Create a new subscription for the authenticated user.

```http
POST /subscriptions/create
```

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "tier": "BASIC",
  "billingPeriod": "MONTHLY",
  "paymentMethod": "stellar",
  "autoRenew": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription created successfully",
  "data": {
    "id": 2,
    "userId": "user123",
    "planId": "1",
    "status": "ACTIVE",
    "startDate": "2024-01-15T00:00:00.000Z",
    "endDate": "2024-02-15T00:00:00.000Z",
    "lastBillingDate": "2024-01-15T00:00:00.000Z",
    "nextBillingDate": "2024-02-15T00:00:00.000Z",
    "autoRenew": true,
    "paymentMethod": "stellar",
    "stellarTransactionId": "tx456...",
    "createdAt": "2024-01-15T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "plan": { ... }
  }
}
```

### Cancel Subscription

Cancel an existing subscription.

```http
POST /subscriptions/{subscriptionId}/cancel
```

**Path Parameters:**
- `subscriptionId` (number): ID of the subscription to cancel

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "data": {
    "refundAmount": 8000000
  }
}
```

### Renew Subscription

Renew an existing subscription.

```http
POST /subscriptions/{subscriptionId}/renew
```

**Path Parameters:**
- `subscriptionId` (number): ID of the subscription to renew

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription renewed successfully",
  "data": {
    "id": 1,
    "userId": "user123",
    "planId": "1",
    "status": "ACTIVE",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-03-01T00:00:00.000Z",
    "lastBillingDate": "2024-02-01T00:00:00.000Z",
    "nextBillingDate": "2024-03-01T00:00:00.000Z",
    "autoRenew": true,
    "paymentMethod": "stellar",
    "stellarTransactionId": "tx789...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-02-01T00:00:00.000Z",
    "plan": { ... }
  }
}
```

### Get Subscription Details

Get detailed information about a specific subscription.

```http
GET /subscriptions/{subscriptionId}
```

**Path Parameters:**
- `subscriptionId` (number): ID of the subscription

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription retrieved successfully",
  "data": {
    "id": 1,
    "userId": "user123",
    "planId": "1",
    "status": "ACTIVE",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-02-01T00:00:00.000Z",
    "lastBillingDate": "2024-01-01T00:00:00.000Z",
    "nextBillingDate": "2024-02-01T00:00:00.000Z",
    "autoRenew": true,
    "paymentMethod": "stellar",
    "stellarTransactionId": "tx123...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "plan": { ... },
    "payments": [ ... ]
  }
}
```

### Get Payment History

Get payment history for a specific subscription.

```http
GET /subscriptions/{subscriptionId}/payments
```

**Path Parameters:**
- `subscriptionId` (number): ID of the subscription

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Payment history retrieved successfully",
  "data": [
    {
      "id": 1,
      "subscriptionId": 1,
      "userId": "user123",
      "amount": 10000000,
      "currency": "XLM",
      "status": "COMPLETED",
      "transactionId": "tx123...",
      "billingPeriod": "MONTHLY",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "subscriptionId": 1,
      "userId": "user123",
      "amount": -8000000,
      "currency": "XLM",
      "status": "REFUNDED",
      "transactionId": "refund123...",
      "billingPeriod": "MONTHLY",
      "createdAt": "2024-01-15T00:00:00.000Z",
      "updatedAt": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

---

## Admin Endpoints (Admin Role Required)

### Get All Subscriptions

Retrieve all subscriptions with pagination and filtering.

```http
GET /subscriptions/admin/subscriptions?page=1&limit=50&status=ACTIVE&tier=BASIC
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 50)
- `status` (string): Filter by status (optional)
- `tier` (string): Filter by plan tier (optional)

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "All subscriptions retrieved successfully",
  "data": {
    "subscriptions": [
      {
        "id": 1,
        "userId": "user123",
        "planId": "1",
        "status": "ACTIVE",
        "startDate": "2024-01-01T00:00:00.000Z",
        "endDate": "2024-02-01T00:00:00.000Z",
        "lastBillingDate": "2024-01-01T00:00:00.000Z",
        "nextBillingDate": "2024-02-01T00:00:00.000Z",
        "autoRenew": true,
        "paymentMethod": "stellar",
        "stellarTransactionId": "tx123...",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "plan": { ... },
        "user": {
          "id": "user123",
          "email": "user@example.com",
          "name": "John Doe"
        },
        "payments": [ ... ]
      }
    ],
    "total": 150,
    "page": 1,
    "totalPages": 3
  }
}
```

### Get Analytics

Retrieve subscription analytics and metrics.

```http
GET /subscriptions/admin/analytics?period=30d
```

**Query Parameters:**
- `period` (string): Time period (7d, 30d, 90d, 1y) (default: 30d)

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription analytics retrieved successfully",
  "data": {
    "totalSubscriptions": 150,
    "activeSubscriptions": 120,
    "newSubscriptions": 25,
    "cancelledSubscriptions": 5,
    "revenue": 1500000000,
    "subscriptionsByTier": [
      {
        "planId": "1",
        "_count": 80
      },
      {
        "planId": "2",
        "_count": 50
      },
      {
        "planId": "3",
        "_count": 20
      }
    ],
    "churnRate": 3.33,
    "period": "30d"
  }
}
```

### Update Plan

Update a subscription plan.

```http
POST /subscriptions/admin/plans
```

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "tier": "BASIC",
  "name": "Basic Plus",
  "description": "Enhanced basic plan with more features",
  "price": 12000000,
  "currency": "XLM",
  "features": [
    "Access to basic courses",
    "Email support",
    "Certificate of completion",
    "Bonus content access"
  ],
  "maxUsers": 2,
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Plan updated successfully",
  "data": {
    "id": "1",
    "tier": "BASIC",
    "name": "Basic Plus",
    "description": "Enhanced basic plan with more features",
    "price": 12000000,
    "currency": "XLM",
    "billingPeriod": "MONTHLY",
    "features": [
      "Access to basic courses",
      "Email support",
      "Certificate of completion",
      "Bonus content access"
    ],
    "maxUsers": 2,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### Pause Contract

Pause the subscription contract (admin only).

```http
POST /subscriptions/admin/pause
```

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Scheduled maintenance"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contract paused successfully"
}
```

### Unpause Contract

Unpause the subscription contract (admin only).

```http
POST /subscriptions/admin/unpause
```

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Contract unpaused successfully"
}
```

### Emergency Pause

Activate emergency pause (admin only).

```http
POST /subscriptions/admin/emergency-pause
```

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Security vulnerability detected"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Emergency pause activated successfully"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - Contract paused |

## WebSocket Events

Real-time updates are available through WebSocket connections.

### Connection

```javascript
const socket = io('ws://localhost:8080', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### subscription_created
```json
{
  "type": "subscription_created",
  "data": {
    "id": 1,
    "userId": "user123",
    "tier": "BASIC",
    "status": "ACTIVE"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### subscription_cancelled
```json
{
  "type": "subscription_cancelled",
  "data": {
    "subscriptionId": 1,
    "refundAmount": 8000000
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### subscription_renewed
```json
{
  "type": "subscription_renewed",
  "data": {
    "id": 1,
    "newEndDate": "2024-03-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### plan_updated
```json
{
  "type": "plan_updated",
  "data": {
    "tier": "BASIC",
    "newPrice": 12000000
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### contract_paused
```json
{
  "type": "contract_paused",
  "data": {
    "reason": "Scheduled maintenance",
    "pausedBy": "admin123"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { SubscriptionAPI } from '@web3-student-lab/subscription-sdk';

const api = new SubscriptionAPI({
  baseURL: 'http://localhost:8080/api/v1',
  token: 'your-jwt-token'
});

// Get user subscriptions
const subscriptions = await api.getUserSubscriptions();

// Create subscription
const subscription = await api.createSubscription({
  tier: 'BASIC',
  billingPeriod: 'MONTHLY',
  paymentMethod: 'stellar',
  autoRenew: true
});

// Cancel subscription
await api.cancelSubscription(subscription.id);
```

### Python

```python
from web3_student_lab import SubscriptionClient

client = SubscriptionClient(
    base_url='http://localhost:8080/api/v1',
    token='your-jwt-token'
)

# Get user subscriptions
subscriptions = client.get_user_subscriptions()

# Create subscription
subscription = client.create_subscription({
    'tier': 'BASIC',
    'billing_period': 'MONTHLY',
    'payment_method': 'stellar',
    'auto_renew': True
})

# Cancel subscription
client.cancel_subscription(subscription['id'])
```

## Testing

### Postman Collection

A complete Postman collection is available for testing all endpoints:
- Import the collection from `docs/postman/subscription-api.json`
- Set environment variables for `base_url` and `token`
- Run the collection to test all endpoints

### Unit Tests

```bash
# Backend tests
cd backend
npm run test
npm run test:coverage

# Integration tests
npm run test:integration
```

## Rate Limiting Details

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /plans | 100/hour | 1 hour |
| POST /create | 10/15min | 15 minutes |
| POST /cancel | 10/15min | 15 minutes |
| POST /renew | 10/15min | 15 minutes |
| Admin endpoints | 50/hour | 1 hour |

Rate limiting headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Support

For API support:
- **Documentation**: This guide and inline API docs
- **Issues**: GitHub repository issues
- **Email**: api-support@web3-student-lab.com
- **Status**: https://status.web3-student-lab.com
