# Messaging API

The messaging system enables real-time chat between the business team and their clients. It has two layers:

1. **REST** — fetch conversations and messages, send messages, mark as read, upload attachments.
2. **WebSocket** (Socket.io) — real-time message sending, delivery receipts, typing indicators, edit/delete.

Both a **business-portal** side and a **client-portal** side exist. See the [Client Portal](#client-portal) section for the client-facing REST and WebSocket APIs.

---

## Business Portal

Base URL: `/api/messages`

All REST endpoints require:

**Required headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature (see README) |

---

### GET /api/messages/conversations

List all conversations for the business, sorted by most recent activity.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Messages retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "clientId": "...",
      "lastMessageContent": "See you tomorrow!",
      "lastMessageAt": "2024-03-15T14:00:00.000Z",
      "lastMessageSender": "business",
      "businessUnreadCount": 0,
      "clientUnreadCount": 1,
      "isActive": false,
      "updatedAt": "2024-03-15T14:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

**Conversation fields**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `clientId` | ObjectId | |
| `lastMessageContent` | string | |
| `lastMessageAt` | ISO date? | |
| `lastMessageSender` | enum | `business` `client` |
| `businessUnreadCount` | integer | messages from client not yet read by business |
| `clientUnreadCount` | integer | messages from business not yet read by client |
| `isActive` | boolean | true while a socket is connected to this room |

---

### GET /api/messages/:clientId

List messages for a specific conversation (identified by `clientId`).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `clientId` | ObjectId | |

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `100` |

Messages are returned in reverse-chronological order (newest first).

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Messages retrieved",
  "data": [
    {
      "_id": "...",
      "businessId": "...",
      "clientId": "...",
      "conversationId": "...",
      "sender": "business",
      "senderName": "Jane Doe",
      "content": "Hello, your job is scheduled for tomorrow.",
      "status": "read",
      "deliveredAt": "2024-03-15T13:00:00.000Z",
      "readAt": "2024-03-15T13:05:00.000Z",
      "attachmentUrl": null,
      "mimeType": null,
      "fileName": null,
      "fileSize": null,
      "createdAt": "2024-03-15T12:59:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 34,
    "totalPages": 2
  }
}
```

**Message fields**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `clientId` | ObjectId | |
| `conversationId` | ObjectId | |
| `sender` | enum | `business` `client` |
| `senderName` | string | display name of the sender |
| `content` | string? | text body (null for attachment-only messages) |
| `status` | enum | `sent` `delivered` `read` |
| `deliveredAt` | ISO date? | when the recipient's socket acknowledged receipt |
| `readAt` | ISO date? | when the recipient opened the conversation |
| `editedAt` | ISO date? | |
| `attachmentUrl` | string? | Cloudinary URL |
| `publicId` | string? | Cloudinary public ID |
| `mimeType` | string? | e.g. `image/jpeg`, `application/pdf` |
| `fileName` | string? | original file name |
| `fileSize` | number? | bytes |

---

### POST /api/messages

Send a message from the business to a client via REST. After saving, the server emits a `message_received` WebSocket event to the conversation room — so clients already connected via WebSocket will see it in real time without polling.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | |
| `content` | string | no | Max 5000 characters. Required if no attachment. |
| `attachmentUrl` | string | no | From `POST /api/messages/upload-attachment` |
| `publicId` | string | no | Cloudinary public ID |
| `mimeType` | string | no | e.g. `image/jpeg`, `application/pdf` |
| `fileName` | string | no | Original file name |
| `fileSize` | integer | no | Bytes, ≥ 0 |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Message sent",
  "data": { ...MessagePayload }
}
```

**Errors:** `400` if both `content` and `attachmentUrl` are absent; `404` if client not found.

---

### PATCH /api/messages/read

Mark all messages in a conversation as read, up to and including a specific message. Emits a `message_read` WebSocket event to the conversation room.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | |
| `upToMessageId` | ObjectId | yes | All messages ≤ this ID are marked read |

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "Messages marked as read", "data": null }
```

---

### POST /api/messages/upload-attachment

Upload a file before sending a message. The returned fields must then be emitted via the WebSocket `send_message` event.

**Content-Type:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | binary | max 10 MB |

**Supported MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/quicktime`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Message sent",
  "data": {
    "attachmentUrl": "https://res.cloudinary.com/.../file.pdf",
    "publicId": "servixos/attachments/abc123",
    "mimeType": "application/pdf",
    "fileName": "invoice.pdf",
    "fileSize": 204800
  }
}
```

---

## WebSocket (Socket.io)

**Namespace:** `/chat`

### Connection

```js
const socket = io('https://<host>/chat', {
  auth: { token: '<accessToken>' },
  extraHeaders: { 'X-Business-Id': '<businessId>' }
});
```

Authentication is validated on connection. On failure, the server emits `connection_error` and disconnects.

### Events

#### Client → Server

---

**`join_room`** — Subscribe to a conversation room.

```js
socket.emit('join_room', { clientId: '<clientId>' });
```

Server responds with `room_joined`:
```json
{ "clientId": "...", "conversationId": "..." }
```

---

**`leave_room`** — Unsubscribe from a conversation room.

```js
socket.emit('leave_room', { clientId: '<clientId>' });
```

---

**`send_message`** — Send a text or attachment message.

```js
socket.emit('send_message', {
  clientId: '<clientId>',
  content: 'Hello!',
  // For attachments, omit content and include these fields from upload-attachment:
  attachmentUrl: 'https://...',
  publicId: 'servixos/attachments/abc123',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  fileSize: 102400
});
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | |
| `content` | string | no | max 5000 chars; required if no attachment |
| `attachmentUrl` | string | no | from `upload-attachment` |
| `publicId` | string | no | |
| `mimeType` | string | no | |
| `fileName` | string | no | |
| `fileSize` | number | no | |

Server broadcasts `message_received` to both parties in the room.

---

**`typing_start`** / **`typing_stop`**

```js
socket.emit('typing_start', { clientId: '<clientId>' });
socket.emit('typing_stop', { clientId: '<clientId>' });
```

Server broadcasts `user_typing` / `user_stopped_typing` to the other party.

---

**`mark_read`** — Mark all messages up to a given message as read.

```js
socket.emit('mark_read', {
  clientId: '<clientId>',
  upToMessageId: '<messageId>'
});
```

Server broadcasts `message_read` to the other party.

---

**`edit_message`** — Edit the content of a previously sent message.

```js
socket.emit('edit_message', {
  messageId: '<messageId>',
  content: 'Updated text'
});
```

Server broadcasts `message_edited`:
```json
{ "messageId": "...", "content": "Updated text", "editedAt": "..." }
```

---

**`delete_message`** — Soft-delete a message.

```js
socket.emit('delete_message', { messageId: '<messageId>' });
```

Server broadcasts `message_deleted`:
```json
{ "messageId": "..." }
```

---

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `connected` | `{ socketId, userId }` | Emitted immediately after successful auth |
| `connection_error` | `{ message }` | Auth failure — socket disconnects |
| `room_joined` | `{ clientId, conversationId }` | Confirmation of `join_room` |
| `message_received` | `MessagePayload` | New message in the room |
| `message_delivered` | `{ messageId, deliveredAt }` | Delivery acknowledgement |
| `message_read` | `{ upToMessageId, readAt }` | Read receipt |
| `user_typing` | `{ clientId, senderName }` | Other party is typing |
| `user_stopped_typing` | `{ clientId }` | Other party stopped typing |
| `user_online` | `{ userId }` | A team member came online |
| `user_offline` | `{ userId }` | A team member went offline |
| `message_edited` | `{ messageId, content, editedAt }` | Message was edited |
| `message_deleted` | `{ messageId }` | Message was deleted |
| `error` | `{ message }` | Generic error |

**`MessagePayload` shape**

```typescript
{
  id: string;
  conversationId: string;
  businessId: string;
  clientId: string;
  sender: 'business' | 'client';
  senderName: string;
  content?: string;
  status: 'sent' | 'delivered' | 'read';
  deliveredAt?: string;
  readAt?: string;
  editedAt?: string;
  attachmentUrl?: string;
  publicId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
}
```

---

## Typical Business-Side Message Flow

```
1. Business opens conversation list  →  GET /api/messages/conversations
2. Business opens a chat             →  GET /api/messages/:clientId  (load history)
3. Connect socket                    →  socket.connect()
4. Join room                         →  emit('join_room', { clientId })
5. Send text                         →  emit('send_message', { clientId, content })
6. Other party receives              →  on('message_received', ...)
7. Mark as read                      →  emit('mark_read', { clientId, upToMessageId })
8. Leave room / close chat           →  emit('leave_room', { clientId })
```

For attachments, call `POST /api/messages/upload-attachment` first, then include the returned fields in the `send_message` event.

---

## Client Portal

Base URL: `/api/client/api/messages`

The client portal exposes a simplified REST + WebSocket interface. Clients see only their own conversations (they cannot enumerate other clients' conversations). The `providerId` parameter refers to the `businessId` of the service provider they are messaging.

**Required headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <clientAccessToken>` |

---

### GET /api/client/api/messages/conversations

List all conversations for the authenticated client.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Conversations retrieved",
  "data": [
    {
      "_id": "...",
      "businessId": "...",
      "clientId": "...",
      "lastMessageContent": "Your appointment is confirmed.",
      "lastMessageAt": "2024-03-15T14:00:00.000Z",
      "lastMessageSender": "business",
      "businessUnreadCount": 0,
      "clientUnreadCount": 1,
      "isActive": false
    }
  ],
  "timestamp": "2024-03-15T14:05:00.000Z"
}
```

---

### GET /api/client/api/messages/conversations/:providerId

List messages in a specific conversation. `providerId` is the `businessId`.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `providerId` | ObjectId | `businessId` of the service provider |

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Messages retrieved",
  "data": [ ...messages ],
  "meta": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 },
  "timestamp": "2024-03-15T14:05:00.000Z"
}
```

---

### PATCH /api/client/api/messages/conversations/:providerId/read

Mark all messages in a conversation as read from the client's perspective. Emits a `message_read` WebSocket event to the conversation room.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `providerId` | ObjectId | `businessId` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Conversation marked as read",
  "data": null,
  "timestamp": "2024-03-15T14:05:00.000Z"
}
```

---

## Client Portal WebSocket

**Namespace:** `/client-messages`

### Connection

```js
const socket = io('https://<host>/client-messages', {
  auth: { token: '<clientAccessToken>' }
});
```

On successful connection the server emits `connected`:
```json
{ "clientId": "<clientId>", "message": "Connected" }
```

### Events

#### Client → Server

---

**`join_conversation`** — Join a conversation room with a specific provider.

```js
socket.emit('join_conversation', { providerId: '<businessId>' });
```

---

**`leave_conversation`** — Leave a conversation room.

```js
socket.emit('leave_conversation', { providerId: '<businessId>' });
```

---

**`send_message`** — Send a text message to a provider.

```js
socket.emit('send_message', {
  providerId: '<businessId>',
  content: 'Hi, is my appointment still on?'
});
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `providerId` | ObjectId | yes | `businessId` |
| `content` | string | yes | Max 5000 characters |

Server broadcasts `new_message` to all participants in the room (including the sender).

---

**`mark_read`** — Mark all messages in a conversation as read.

```js
socket.emit('mark_read', { providerId: '<businessId>' });
```

Server emits `message_read` and `conversation_updated` to the room.

---

**`typing_start`** / **`typing_stop`** — Broadcast typing status to the other party.

```js
socket.emit('typing_start', { providerId: '<businessId>' });
socket.emit('typing_stop',  { providerId: '<businessId>' });
```

Server broadcasts `typing` to the other party's room:
```json
{ "clientId": "<clientId>", "isTyping": true }
```

---

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `connected` | `{ clientId, message }` | Emitted on successful connection |
| `new_message` | message object | New message arrived in a conversation room |
| `message_read` | `{ clientId, providerId }` | The other party read the conversation |
| `conversation_updated` | conversation object | Unread counts or last-message updated |
| `typing` | `{ clientId, isTyping }` | The other party's typing status changed |
| `error` | `{ message }` | Error from a socket event handler |

---

## Typical Client-Side Message Flow

```
1. Client opens messaging               →  GET /api/client/api/messages/conversations
2. Client opens a conversation          →  GET /api/client/api/messages/conversations/:providerId
3. Connect socket                       →  socket.connect()
4. Join conversation room               →  emit('join_conversation', { providerId })
5. Client types                         →  emit('typing_start', { providerId })
6. Client sends message                 →  emit('send_message', { providerId, content })
7. Business replies                     →  on('new_message', ...)
8. Client reads messages                →  emit('mark_read', { providerId })
9. Leave conversation / close chat      →  emit('leave_conversation', { providerId })
```
