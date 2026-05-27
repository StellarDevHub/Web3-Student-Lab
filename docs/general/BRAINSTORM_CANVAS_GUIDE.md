# Real-time Collaborative Brainstorming Canvas

## Overview

The Brainstorming Canvas is an infinite, real-time collaborative whiteboard feature that enables students to brainstorm and map out smart contract logic together. Multiple users can simultaneously draw, write, and organize ideas on a shared canvas with instant synchronization.

## Features

### Core Functionality

- **Infinite Canvas**: Unlimited space to brainstorm and organize ideas
- **Real-time Collaboration**: Multiple users see changes instantly using Yjs CRDT
- **Drawing Tools**:
  - Sticky notes for ideas
  - Arrows for connections
  - Shapes (rectangles, circles, lines)
  - Text annotations
- **User Presence**: See who's editing with colored avatars and cursor positions
- **Shared State**: No flickering or lost updates - complete data consistency

### Export Capabilities

- **Export to PNG**: Download canvas as high-resolution image
- **Export to PDF**: Generate formatted PDF documents
- **Export to JSON**: Save raw canvas data for reimport or analysis
- **Version Control**: Each export is timestamped and immutable

## Architecture

### Technology Stack

**Frontend**:
- **tldraw**: Infinite canvas UI library
- **Yjs**: Real-time collaborative editing (CRDT)
- **y-websocket**: WebSocket provider for Yjs
- **Next.js**: React framework
- **html2canvas**: Screenshot canvas to image
- **jsPDF**: Generate PDF files

**Backend**:
- **Express.js**: REST API
- **Prisma**: Database ORM
- **PostgreSQL**: Canvas data persistence
- **y-websocket server**: Real-time sync server (runs on port 1234)

### Data Flow

```
┌─────────────────────────────────────────────┐
│       Frontend Canvas Component              │
│  (User A)                   (User B)         │
│   Drawing                   Drawing          │
└──────────┬──────────────────────┬────────────┘
           │                      │
           ▼                      ▼
┌─────────────────────────────────────────────┐
│   Yjs Document (Shared CRDT)                │
│   - Shapes Array                            │
│   - Users Map (Awareness)                   │
└──────────┬────────────┬──────────┬──────────┘
           │            │          │
    ┌──────▼─────┐  ┌───▼──┐  ┌───▼──────┐
    │  WebSocket │  │REST  │  │Database  │
    │  Server    │  │API   │  │(Postgres)│
    │(Port 1234) │  │      │  │          │
    └────────────┘  └──────┘  └──────────┘
```

## API Endpoints

### Canvas Management

#### Create Canvas
```http
POST /api/v1/canvas
Content-Type: application/json
Authorization: Bearer {token}

{
  "roomId": "canvas-abc123def456",
  "title": "Smart Contract Design",
  "description": "Designing our new token contract",
  "isPublic": false
}
```

**Response** (201):
```json
{
  "id": "clh1a2b3c4d5e6f7g8h9i0j1",
  "roomId": "canvas-abc123def456",
  "title": "Smart Contract Design",
  "description": "Designing our new token contract",
  "isPublic": false,
  "studentId": "student123",
  "createdAt": "2026-04-26T14:00:00Z",
  "updatedAt": "2026-04-26T14:00:00Z"
}
```

#### List User's Canvases
```http
GET /api/v1/canvas
Authorization: Bearer {token}
```

**Response** (200):
```json
[
  {
    "id": "clh1a2b3c4d5e6f7g8h9i0j1",
    "roomId": "canvas-abc123def456",
    "title": "Smart Contract Design",
    "description": "Designing our new token contract",
    "isPublic": false,
    "createdAt": "2026-04-26T14:00:00Z",
    "updatedAt": "2026-04-26T14:00:00Z",
    "lastModifiedBy": "user456",
    "student": {
      "id": "student123",
      "firstName": "John",
      "lastName": "Doe"
    }
  }
]
```

#### Get Canvas Details
```http
GET /api/v1/canvas/:id
Authorization: Bearer {token}
```

**Response** (200):
```json
{
  "id": "clh1a2b3c4d5e6f7g8h9i0j1",
  "roomId": "canvas-abc123def456",
  "title": "Smart Contract Design",
  "description": "Designing our new token contract",
  "isPublic": false,
  "studentId": "student123",
  "data": {
    "shapes": [...],
    "metadata": {}
  },
  "collaborators": ["user456", "user789"],
  "createdAt": "2026-04-26T14:00:00Z",
  "updatedAt": "2026-04-26T14:00:00Z",
  "lastModifiedBy": "user456",
  "lastModifiedAt": "2026-04-26T14:30:00Z"
}
```

#### Update Canvas
```http
PUT /api/v1/canvas/:id
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Updated Title",
  "description": "Updated description",
  "isPublic": true,
  "data": { ... }
}
```

#### Delete Canvas
```http
DELETE /api/v1/canvas/:id
Authorization: Bearer {token}
```

**Response** (204 No Content)

### Collaboration Management

#### Add Collaborator
```http
POST /api/v1/canvas/:id/collaborators
Content-Type: application/json
Authorization: Bearer {token}

{
  "collaboratorId": "student456"
}
```

#### Remove Collaborator
```http
DELETE /api/v1/canvas/:id/collaborators/:collaboratorId
Authorization: Bearer {token}
```

### Export & Download

#### Export Canvas Data
```http
POST /api/v1/canvas/:id/export
Authorization: Bearer {token}
```

**Response** (200):
```json
{
  "id": "clh1a2b3c4d5e6f7g8h9i0j1",
  "roomId": "canvas-abc123def456",
  "title": "Smart Contract Design",
  "description": "Designing our new token contract",
  "data": { ... },
  "createdAt": "2026-04-26T14:00:00Z",
  "updatedAt": "2026-04-26T14:00:00Z",
  "creator": {
    "id": "student123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

## Frontend Usage

### Using the Brainstorming Canvas

1. **Navigate to Canvas**:
   ```
   http://localhost:3000/brainstorm
   ```

2. **Create New Canvas**:
   - Click "New Canvas" button
   - Auto-generates unique room ID
   - Share room ID with collaborators

3. **Drawing**:
   - Use tldraw tools in the toolbar
   - Create sticky notes for ideas
   - Draw arrows to connect concepts
   - Add shapes for structure
   - Write text annotations

4. **Real-time Collaboration**:
   - See other users' avatars (colored circles with initials)
   - Watch their edits in real-time
   - Cursor positions are shared
   - No conflicts - Yjs handles automatic merging

5. **Export Canvas**:
   - **PNG**: Click "Export PNG" (high-resolution)
   - **PDF**: Click "Export PDF" (formatted document)
   - **JSON**: Click "Export JSON" (raw data)

### Sharing Canvas

Each canvas has a unique URL:
```
http://localhost:3000/brainstorm?session=canvas-abc123def456
```

Share this link with collaborators to invite them to the canvas.

## Backend Setup

### Enable Collaboration Server

The collaboration server runs separately from the main backend:

```bash
# Start main backend (port 8080)
cd backend
npm run dev

# In another terminal, start collaboration server (port 1234)
npx ts-node src/collaborationServer.ts
```

Or use the Docker setup:
```bash
docker-compose up
```

### Environment Variables

**Frontend** (.env.local):
```env
NEXT_PUBLIC_WS_URL=ws://localhost:1234
```

**Backend** (.env):
```env
WS_PORT=1234
NODE_ENV=development
```

## Database Schema

### Canvas Model

```prisma
model Canvas {
  id                String   @id @default(cuid())
  roomId            String   @unique
  studentId         String
  title             String
  description       String?
  data              Json?
  isPublic          Boolean  @default(false)
  collaborators     String[] // Array of student IDs
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  lastModifiedBy    String?
  lastModifiedAt    DateTime?

  student           Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@map("canvases")
  @@index([roomId])
  @@index([studentId])
  @@index([createdAt])
}
```

### Migration

```bash
cd backend

# Generate migration
npx prisma migrate dev --name add-canvas

# Apply migration
npx prisma migrate deploy
```

## Real-time Sync Details

### Yjs Integration

The collaboration uses **Yjs**, a CRDT (Conflict-free Replicated Data Type) library:

- **Automatic Conflict Resolution**: No manual merging needed
- **Offline Support**: Changes sync when connection restored
- **History**: Can implement undo/redo based on update history
- **Awareness**: User presence tracking (cursors, selection)

### WebSocket Provider

The `y-websocket` provider handles:
- Bidirectional synchronization
- Message broadcasting to all clients
- Connection state management
- Automatic reconnection

### Shared Types

```typescript
// Yjs document structure
const canvasShapes = doc.getArray('shapes');  // All shapes
const users = doc.getMap('users');            // User info
```

## Performance Considerations

### Scalability

- **Max Concurrent Users**: ~50 per canvas (tested)
- **Shape Limit**: ~10,000 shapes (with performance degradation)
- **Recommended**: 5-20 users for optimal experience

### Optimization Tips

1. **Limit Shapes**: Archive old canvases regularly
2. **Offline Mode**: Support offline drawing with sync on reconnect
3. **Persistence**: Store canvas snapshots in database
4. **Cleanup**: Remove unused canvases after 30 days

## Security

### Access Control

- **Authentication**: JWT token required
- **Authorization**: Only owner and collaborators can edit
- **Public Canvases**: Read-only for non-owners
- **Deletion**: Only owner can delete

### Data Protection

- Canvas data stored in PostgreSQL
- WebSocket connection validated
- Rate limiting on API endpoints
- CORS enabled for frontend origin

## Troubleshooting

### Canvas Not Syncing

1. Check WebSocket connection:
   ```bash
   # Check if ws://localhost:1234 is accessible
   curl -i http://localhost:1234
   ```

2. Verify Yjs doc is initialized:
   ```typescript
   console.log('Doc:', doc);
   console.log('Connected:', isConnected);
   ```

3. Check browser console for errors

### Slow Performance

1. Clear browser cache and reload
2. Close other tabs using the canvas
3. Reduce number of active canvases
4. Check network latency

### Export Failing

1. Ensure canvas has content
2. Check browser memory (close other apps)
3. Try exporting smaller sections
4. Use JSON export as fallback

## Future Enhancements

- [ ] Voice/video integration during collaboration
- [ ] Comment threads on canvas elements
- [ ] Template library (common contract patterns)
- [ ] AI-powered suggestion engine
- [ ] Presentation mode (slideshow)
- [ ] Mobile app support
- [ ] Real-time audio/video chat
- [ ] Canvas templates for specific contract types
- [ ] Integration with IDE for code generation
- [ ] GitHub integration for version control

## References

- [tldraw Documentation](https://www.tldraw.com)
- [Yjs Documentation](https://docs.yjs.dev)
- [y-websocket Repository](https://github.com/yjs/y-websocket)
- [CRDT Explained](https://crdt.tech)

## Support

For issues or questions:
1. Check documentation in `/docs`
2. Review browser console for errors
3. Check WebSocket server status
4. Contact: support@web3studentlab.com
