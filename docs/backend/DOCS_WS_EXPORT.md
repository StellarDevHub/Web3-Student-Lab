# WebSocket and Export Documentation

## WebSocket Gateway

The WebSocket gateway is built using Socket.io and provides real-time updates to the frontend.

### Connection
- **URL**: `ws://localhost:8080` (or the backend URL)
- **Authentication**: Required via JWT.
  - Send the token in the `auth` object when connecting:
    ```javascript
    const socket = io('ws://localhost:8080', {
      auth: {
        token: 'YOUR_JWT_TOKEN'
      }
    });
    ```
  - Or via `Authorization` header.

### Channels/Rooms
1. **Private User Room**: `user:{userId}`
   - Automatically joined upon connection.
   - Receives events specific to the user (e.g., `EXPORT_COMPLETED`).
2. **Dashboard Channel**: `dashboard_updated`
   - Broadcasts general system events (e.g., `STUDENT_CREATED`).

### Events
- `dashboard_updated`: Generic system events.
- `user_metrics_updated`: User-specific updates.

---

## Asynchronous Exports

Large data exports are processed in the background using BullMQ and Redis.

### 1. Trigger Export
- **Endpoint**: `POST /api/v1/export`
- **Body**:
  ```json
  {
    "type": "students", // "students" | "audit" | "courses"
    "format": "csv"    // "csv" | "json"
  }
  ```
- **Response**:
  ```json
  {
    "jobId": "123"
  }
  ```

### 2. Check Status
- **Endpoint**: `GET /api/v1/export/:id/status`
- **Response**:
  ```json
  {
    "id": "123",
    "state": "completed", // "waiting" | "active" | "completed" | "failed"
    "progress": 0,
    "result": {
      "fileName": "export-students-123.csv",
      "downloadUrl": "/api/v1/export/download/export-students-123.csv",
      "expiresAt": "2026-04-26T12:00:00.000Z"
    }
  }
  ```

### 3. Download File
- **Endpoint**: `GET /api/v1/export/download/:fileName`
- **Note**: Files expire after 24 hours.

### WebSocket Integration
When an export is completed, a `user_metrics_updated` event is sent to the user's private room:
```json
{
  "userId": "...",
  "type": "EXPORT_COMPLETED",
  "jobId": "123",
  "result": { ... }
}
```
