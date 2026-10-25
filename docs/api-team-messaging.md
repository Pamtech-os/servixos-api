# Team Messaging API

The team messaging module provides a real-time internal channel for business staff. Team messages and announcements are business-wide — every connected staff member receives them instantly via WebSocket. REST endpoints handle history retrieval and creation; the WebSocket layer delivers live updates without polling.

All endpoints and socket events are business-portal only. There is no client-portal equivalent.

---

## Authentication

### REST

Every REST request requires:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 signature (see README) |

### WebSocket

Team messaging reuses the existing `/chat` Socket.io namespace — no separate connection is needed. Authentication and connection setup follow the same flow documented in `api-messaging.md` (JWT in the `auth.token` handshake option, same headers).

On successful connection every socket is **automatically enrolled in the business-wide team room** (`team:<businessId>`). No explicit join event is required from the client.

---

## REST Endpoints

Base URL: `/api/team`

---

### GET /api/team/messages

List team messages for the business, newest first. Use this to populate initial history before the WebSocket connection is established.

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
  "message": "Team messages retrieved",
  "data": [
    {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "senderId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "senderName": "Jane Doe",
      "content": "The morning crew starts at 7 AM tomorrow.",
      "createdAt": "2024-03-15T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### POST /api/team/messages

Post a new message to the team channel. After persisting, the server broadcasts a `team_message_sent` event to every staff member currently connected to `/chat`.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Max 5000 characters |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Team message sent",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "senderId": "64f1a2b3c4d5e6f7a8b9c0d5",
    "senderName": "Jane Doe",
    "content": "The morning crew starts at 7 AM tomorrow.",
    "createdAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if content is empty or exceeds 5000 characters.

---

### GET /api/team/announcements

List announcements for the business, newest first. Load this on page mount to show historical announcements before subscribing to live events.

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
  "message": "Announcements retrieved",
  "data": [
    {
      "id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "authorId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "authorName": "Jane Doe",
      "title": "Q2 Performance Review",
      "description": "All employees must complete self-assessments by April 30.",
      "createdAt": "2024-03-15T09:00:00.000Z"
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

---

### POST /api/team/announcements

Create a new announcement. After persisting, the server broadcasts an `announcement_created` event to all connected staff. Email notifications are dispatched asynchronously to every active staff account.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `description` | string | yes | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Announcement created",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d2",
    "authorId": "64f1a2b3c4d5e6f7a8b9c0d5",
    "authorName": "Jane Doe",
    "title": "Q2 Performance Review",
    "description": "All employees must complete self-assessments by April 30.",
    "createdAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if title or description is empty.

---

## WebSocket — `/chat` namespace

Team messaging piggybacks on the existing `/chat` Socket.io namespace. Staff connect once and receive both client-conversation events and team-channel events over the same socket.

### Connection

```js
import { io } from 'socket.io-client';

const socket = io('/chat', {
  auth: { token: accessToken },
  extraHeaders: {
    'x-business-id': businessId,
    'x-client-token': clientToken,
    'x-timestamp': String(Date.now()),
    'x-signature': signature,
  },
});
```

On successful connection the server automatically adds the socket to the `team:<businessId>` room. The client does not need to emit any join event for team messaging.

---

### Server → Client events

#### `team_message_sent`

Emitted to all staff in the business immediately after `POST /api/team/messages` succeeds.

**Payload**
```json
{
  "message": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "senderId": "64f1a2b3c4d5e6f7a8b9c0d5",
    "senderName": "Jane Doe",
    "content": "The morning crew starts at 7 AM tomorrow.",
    "createdAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Payload fields**

| Field | Type | Notes |
|---|---|---|
| `message.id` | string | MongoDB ObjectId of the team message |
| `message.senderId` | string | Employee who posted |
| `message.senderName` | string | Display name at time of posting |
| `message.content` | string | Message body |
| `message.createdAt` | ISO date | Business-local wall-clock time |

---

#### `announcement_created`

Emitted to all staff in the business immediately after `POST /api/team/announcements` succeeds. Email notifications are sent asynchronously in the background — the socket event fires first.

**Payload**
```json
{
  "announcement": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d2",
    "authorId": "64f1a2b3c4d5e6f7a8b9c0d5",
    "authorName": "Jane Doe",
    "title": "Q2 Performance Review",
    "description": "All employees must complete self-assessments by April 30.",
    "createdAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Payload fields**

| Field | Type | Notes |
|---|---|---|
| `announcement.id` | string | MongoDB ObjectId of the announcement |
| `announcement.authorId` | string | Employee who posted |
| `announcement.authorName` | string | Display name at time of posting |
| `announcement.title` | string | |
| `announcement.description` | string | |
| `announcement.createdAt` | ISO date | Business-local wall-clock time |

---

## Frontend integration guide

### Initial load

1. Call `GET /api/team/messages?limit=50` and `GET /api/team/announcements?limit=20` to populate history before the socket connects.
2. Render the results in reverse-chronological order (newest at bottom for messages, newest at top for announcements — choose what fits your UI).

### Real-time updates

```js
socket.on('team_message_sent', ({ message }) => {
  // Append to the team message feed
  addMessageToFeed(message);
});

socket.on('announcement_created', ({ announcement }) => {
  // Prepend to the announcements list and optionally show a toast
  prependAnnouncement(announcement);
  showToast(`New announcement: ${announcement.title}`);
});
```

### Deduplication

The REST response from `POST /api/team/messages` and the subsequent `team_message_sent` socket event carry the same `id`. If the sender is also listening on the socket, deduplicate by `id` before appending to the feed to avoid showing the message twice.

```js
const seenIds = new Set();

function addMessageToFeed(message) {
  if (seenIds.has(message.id)) return;
  seenIds.add(message.id);
  // render message
}
```

### Reconnection

Socket.io handles reconnection automatically. On reconnect, the server re-enrolls the socket in `team:<businessId>`. To catch any messages missed during the disconnect window, call `GET /api/team/messages?limit=20` again and merge the results with what is already in state (deduplicate by `id`).

### Complete example (React)

```js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useTeamMessaging({ accessToken, businessId, clientToken, signature }) {
  const [messages, setMessages] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const seenIds = useRef(new Set());
  const socket = useRef(null);

  useEffect(() => {
    // 1. Load history
    Promise.all([
      fetch('/api/team/messages?limit=50', { headers: authHeaders }).then(r => r.json()),
      fetch('/api/team/announcements?limit=20', { headers: authHeaders }).then(r => r.json()),
    ]).then(([msgs, ann]) => {
      msgs.data.forEach(m => seenIds.current.add(m.id));
      setMessages(msgs.data.reverse());          // oldest first
      setAnnouncements(ann.data);                // newest first
    });

    // 2. Open socket
    socket.current = io('/chat', {
      auth: { token: accessToken },
      extraHeaders: {
        'x-business-id': businessId,
        'x-client-token': clientToken,
        'x-timestamp': String(Date.now()),
        'x-signature': signature,
      },
    });

    // 3. Live updates
    socket.current.on('team_message_sent', ({ message }) => {
      if (seenIds.current.has(message.id)) return;
      seenIds.current.add(message.id);
      setMessages(prev => [...prev, message]);
    });

    socket.current.on('announcement_created', ({ announcement }) => {
      setAnnouncements(prev => [announcement, ...prev]);
    });

    // 4. Catch-up on reconnect
    socket.current.on('connect', () => {
      fetch('/api/team/messages?limit=20', { headers: authHeaders })
        .then(r => r.json())
        .then(({ data }) => {
          const fresh = data.filter(m => !seenIds.current.has(m.id));
          fresh.forEach(m => seenIds.current.add(m.id));
          if (fresh.length) setMessages(prev => [...prev, ...fresh.reverse()]);
        });
    });

    return () => socket.current?.disconnect();
  }, [accessToken, businessId]);

  return { messages, announcements };
}
```

---

## Event reference summary

| Event | Direction | Trigger |
|---|---|---|
| `team_message_sent` | Server → Client | `POST /api/team/messages` |
| `announcement_created` | Server → Client | `POST /api/team/announcements` |

No client-initiated events exist for team messaging — sending goes through REST only.
