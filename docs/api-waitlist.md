# Waitlist API

Lets visitors on the ServixOS marketing website join the early-access waitlist, and lets admins view, search and export signups from the admin dashboard.

---

## Join the waitlist

```
POST /api/waitlist
```

Fully public — **no** auth token, HMAC signature headers or `X-Channel` header are required. Send a plain JSON request.

### Request

**Headers**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `firstName` | string | Yes | 1–50 characters after trimming |
| `email` | string | Yes | Valid email, max 254 characters. Trimmed and lowercased server-side |
| `persona` | string (enum) | Yes | One of the values below |

**`persona` values** — render the label, send the value:

| Value | Label shown on the form |
|---|---|
| `aspiring_founder` | I want to start a business but don't know what to start. |
| `has_idea` | I have a business idea and want to get started. |
| `business_owner` | I already run a business. |
| `exploring` | I'm interested in exploring Servix OS. |

Any field not listed above is rejected with `400`.

**Example**

```json
{
  "firstName": "Ada",
  "email": "ada@example.com",
  "persona": "has_idea"
}
```

### Success — `201 Created`

```json
{
  "success": true,
  "statusCode": 201,
  "message": "You're on the list! We'll keep you updated on ServixOS and let you know when early access becomes available.",
  "data": {
    "firstName": "Ada",
    "email": "ada@example.com",
    "persona": "has_idea"
  }
}
```

Display `message` as the success message.

A confirmation email ("You're on the Servix OS waitlist 🚀") is sent to the address in the background, with copy tailored to the selected `persona`. Duplicate signups (`409`) do not trigger a second email. If the email fails to send, the signup is still saved and the response is still `201`.

### Errors

All errors share this shape — display `message` to the user:

```json
{
  "success": false,
  "statusCode": 409,
  "message": "This email address is already on the waitlist"
}
```

| Status | When | `message` |
|---|---|---|
| `400` | First name missing/blank | `First name is required` |
| `400` | First name over 50 characters | `First name must be at most 50 characters` |
| `400` | Email missing | `Email address is required` |
| `400` | Email malformed | `Please enter a valid email address` |
| `400` | Email over 254 characters | `Email address must be at most 254 characters` |
| `400` | Persona missing | `Please tell us what best describes you` |
| `400` | Persona not one of the four values | `Please select a valid option for what best describes you` |
| `400` | Unknown field in body | `property <name> should not exist` |
| `409` | Email already registered (case-insensitive) | `This email address is already on the waitlist` |
| `429` | Rate limit exceeded | `ThrottlerException: Too Many Requests` |
| `500` | Server/database error | `We couldn't add you to the waitlist right now. Please try again in a moment.` |

> When several fields fail validation at once, their messages are joined with `"; "` in a single `message` string, e.g. `"First name is required; Please enter a valid email address"`.

### Rate limiting

**5 requests per minute per IP.** Exceeding it returns `429`. The `429` message is not user-friendly — show your own copy instead, e.g. *"Too many attempts. Please wait a minute and try again."*

### Integration example

```ts
type WaitlistPersona =
  | 'aspiring_founder'
  | 'has_idea'
  | 'business_owner'
  | 'exploring';

interface JoinWaitlistInput {
  firstName: string;
  email: string;
  persona: WaitlistPersona;
}

export async function joinWaitlist(input: JoinWaitlistInput) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null);

  if (res.ok) return { ok: true as const, message: body.message as string };

  if (res.status === 429) {
    return {
      ok: false as const,
      message: 'Too many attempts. Please wait a minute and try again.',
    };
  }

  return {
    ok: false as const,
    message:
      body?.message ?? 'Something went wrong. Please try again in a moment.',
  };
}
```

### Frontend checklist

- Mark all three fields as required and validate email format client-side to avoid round-trips; the server re-validates regardless.
- Disable the submit button while the request is in flight to prevent double submits.
- Treat `409` as a friendly state (the user is already on the list), not a hard failure.
- The website's origin must be included in the API's `ALLOWED_ORIGINS` environment variable, or the browser will block the request (CORS).

---

## Admin endpoints

For the admin dashboard. Both require an admin access token (`Authorization: Bearer <adminAccessToken>`) and the `X-Channel` header, the same as other admin routes.

### List / search signups

```
GET /api/admin/api/waitlist
```

**Query parameters** (all optional)

| Param | Type | Description |
|---|---|---|
| `page` | integer ≥ 1 | Default `1` |
| `limit` | integer ≥ 1 | Default `20` |
| `search` | string (max 100) | Case-insensitive partial match on first name or email |
| `persona` | enum | Filter by one of the persona values |
| `dateFrom` | ISO 8601 date | Signups on or after this time |
| `dateTo` | ISO 8601 date | Signups on or before this time |

**Response — `200 OK`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Waitlist signups retrieved successfully",
  "data": {
    "stats": {
      "total": 128,
      "aspiring_founder": 30,
      "has_idea": 41,
      "business_owner": 38,
      "exploring": 19
    },
    "entries": [
      {
        "_id": "6719f0c2a1b2c3d4e5f60789",
        "firstName": "Ada",
        "email": "ada@example.com",
        "persona": "has_idea",
        "createdAt": "2026-10-25T14:03:11.000Z",
        "updatedAt": "2026-10-25T14:03:11.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

`stats` always covers the whole waitlist (it ignores filters); `meta.total` reflects the filtered result. Entries are sorted newest first.

### Export to CSV

```
GET /api/admin/api/waitlist/export
```

Accepts the same `search`, `persona`, `dateFrom` and `dateTo` filters as the list endpoint (no pagination — exports every match).

**Response — `200 OK`** is a file download, **not** the JSON envelope:

| Header | Value |
|---|---|
| `Content-Type` | `text/csv; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="waitlist-YYYY-MM-DD.csv"` |

Columns: `First Name`, `Email`, `Describes Them` (full label text), `Joined At` (ISO 8601 UTC).

```ts
const res = await fetch(`${API_URL}/api/admin/api/waitlist/export?persona=has_idea`, {
  headers: { Authorization: `Bearer ${token}`, 'X-Channel': 'web' },
});
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), {
  href: url,
  download: 'waitlist.csv',
});
a.click();
URL.revokeObjectURL(url);
```

Errors (`401`, `500`) still use the standard JSON error envelope.
