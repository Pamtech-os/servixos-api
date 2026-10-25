# Client Portal WebSocket API

Namespace: `/client-messages`

This document covers **client portal realtime messaging only** (not business portal `/chat`).

---

## Purpose

Use this socket namespace to:

- join a client conversation room
- send/receive realtime messages
- emit/read message state updates
- show typing indicators
- keep conversation previews synced (`conversation_updated`)

---

## Prerequisites

1. Authenticate via `POST /api/client-auth/login` and get `accessToken`.
2. Load initial conversation list via `GET /api/client/api/messages/conversations`.
3. Open a conversation and get `providerId` from `serviceProvider.id`.

`providerId` is the service provider's **businessId**.

---

## Connection

```ts
import { io } from 'socket.io-client';

const socket = io(`${API_BASE_URL}/client-messages`, {
  transports: ['websocket', 'polling'],
  auth: { token: accessToken },
});
```

On success, server emits:

```json
{
  "clientId": "64f...",
  "message": "Connected"
}
```

Auth notes:

- token must be a valid client JWT (`aud: "client"`)
- client role must be `client`
- socket disconnects on auth failure

---

## Event Names

Client event constants are defined in [`src/client/constants/ws-events.ts`](../src/client/constants/ws-events.ts).

### Client -> Server

- `join_conversation`
- `leave_conversation`
- `send_message`
- `mark_read`
- `typing_start`
- `typing_stop`

### Server -> Client

- `connected`
- `new_message`
- `message_read`
- `conversation_updated`
- `typing`
- `error`

---

## Client -> Server Payloads

### `join_conversation`

```json
{ "providerId": "<businessId>" }
```

### `leave_conversation`

```json
{ "providerId": "<businessId>" }
```

### `send_message`

```json
{
  "providerId": "<businessId>",
  "content": "Hello"
}
```

Validation:

- `providerId`: required Mongo ObjectId
- `content`: required string, trimmed, max 5000 chars
- client must have joined room first (`join_conversation`)

### `mark_read`

```json
{ "providerId": "<businessId>" }
```

### `typing_start` / `typing_stop`

```json
{ "providerId": "<businessId>" }
```

---

## Server -> Client Payloads

### `new_message`

```json
{
  "id": "msgId",
  "sender": "business",
  "senderName": "Jane Doe",
  "content": "Hello",
  "isRead": false,
  "attachments": [
    {
      "url": "https://...",
      "fileName": "invoice.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "createdAt": "2026-05-15T10:00:00.000Z"
}
```

For text-only messages, `attachments` is `[]`.

### `message_read`

```json
{
  "clientId": "<clientId>",
  "providerId": "<businessId>"
}
```

### `conversation_updated`

```json
{
  "id": "<conversationId>",
  "lastMessageContent": "Most recent message",
  "lastMessageAt": "2026-05-15T10:00:00.000Z",
  "clientUnreadCount": 1
}
```

### `typing`

```json
{
  "clientId": "<clientId>",
  "isTyping": true
}
```

### `error`

Typical payload:

```json
{ "message": "Authentication required" }
```

Validation/exception filters may also include:

```json
{ "code": "WS_ERROR", "message": "..." }
```

---

## Bridge Behavior (Already Enabled)

Client portal now receives realtime updates when messages originate from the business side:

- business sends on `/chat` -> client gets `new_message` on `/client-messages`
- business marks read on `/chat` -> client gets `message_read` on `/client-messages`
- conversation preview is refreshed via `conversation_updated`

No extra frontend work is needed beyond listening to client events above.

---

## Recommended Frontend Flow

1. Connect socket after client login.
2. On chat open, emit `join_conversation` with `providerId`.
3. Listen to `new_message`, append to active thread.
4. Listen to `conversation_updated`, update conversation list row/unread badge.
5. Emit `mark_read` when thread is opened/focused.
6. Emit `typing_start`/`typing_stop` while user types.
7. Emit `leave_conversation` on chat close/unmount.
8. Disconnect socket on logout.

---

## Production Notes

- Namespace URL is `/client-messages` (do not prefix with `/api`).
- Allowed origins follow websocket CORS config (`ALLOWED_ORIGINS` and `*.servixos.com`).
- Redis-backed Socket.io adapter is enabled, so events fan out across multiple API instances.

