# Website Management API — Dashboard Integration Guide

This document covers the business-portal (dashboard) side of the website builder: fetching the website config, generating AI content, updating design tokens, editing content sections, uploading a logo, and configuring the booking form.

For the **public-facing** side (subdomain routing, the landing page, the booking form embed), see [public-website-frontend-integration.md](./public-website-frontend-integration.md).

---

## Authentication

All endpoints require business-portal authentication.

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

---

## Standard response envelope

```json
{
  "success": true,
  "statusCode": 200,
  "message": "...",
  "data": { ... }
}
```

---

## GET /api/website

Returns the full website configuration for the authenticated business, including unpublished/draft state.

Returns `404` if the business has not generated a website yet (i.e. `POST /api/website/generate` has never been called).

**Response `200`**

```ts
{
  "success": true,
  "statusCode": 200,
  "message": "Website configuration retrieved successfully",
  "data": {
    "isPublished": boolean;       // false until generate is called
    "subdomain": string;          // e.g. "acme-cleaning"
    "colorPrimary": string;       // hex colour, e.g. "#2563eb"
    "colorSecondary": string;     // hex colour, e.g. "#64748b"
    "font": string;               // e.g. "Inter"
    "logoUrl"?: string;           // CDN URL — absent until logo is uploaded
    "aiContent"?: {
      "hero": { "headline": string; "subheadline": string; "ctaText": string };
      "about": { "title": string; "body": string };
      "services": Array<{ "name": string; "description": string }>;
      "testimonialPlaceholder": { "quote": string; "author": string };
      "contact": { "callToAction": string };
    };
    "bookingForm"?: {
      "title": string;
      "description"?: string;
      "fields": Array<{
        "key": BookingFieldKey;
        "label": string;
        "placeholder"?: string;
        "required": boolean;
      }>;
    };
  }
}
```

`aiContent` and `bookingForm` are both optional — absent until generated/saved respectively.

---

## POST /api/website/generate

Triggers AI generation of website copy and publishes the site. Can also be called again to re-generate copy without changing design or booking form settings.

This is an idempotent operation — safe to call multiple times.

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Website published successfully",
  "data": {
    "subdomain": "acme-cleaning",
    "url": "https://acme-cleaning.servixos.com"
  }
}
```

After a successful call, `GET /api/website` will return `isPublished: true` and a populated `aiContent`.

---

## PATCH /api/website/design

Saves colour and font design tokens. Partial updates are supported — send only the fields that changed.

**Request body**

```json
{
  "colorPrimary": "#2563eb",
  "colorSecondary": "#64748b",
  "font": "Inter"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `colorPrimary` | string | no | Hex colour value |
| `colorSecondary` | string | no | Hex colour value |
| `font` | string | no | Font family name (must be available in your design system) |

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Design settings saved successfully",
  "data": null
}
```

---

## PATCH /api/website/content

Saves edits to individual AI content sections. Only sections included in the request body are overwritten — omitted sections remain unchanged.

**Request body** (all fields optional)

```ts
{
  "hero"?: { "headline": string; "subheadline": string; "ctaText": string };
  "about"?: { "title": string; "body": string };
  "services"?: Array<{ "name": string; "description": string }>;
  "testimonialPlaceholder"?: { "quote": string; "author": string };
  "contact"?: { "callToAction": string };
}
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Website content saved successfully",
  "data": null
}
```

---

## PATCH /api/website/logo

Uploads and replaces the business logo shown on the website. Send the file as `multipart/form-data` with the field named `file`.

- **Accepted types:** `image/jpeg`, `image/jpg`, `image/png`
- **Max size:** 5 MB
- The previous logo is automatically deleted from storage when a new one is uploaded.

**Request**

```
Content-Type: multipart/form-data
field name:   file
```

Example using `fetch`:

```ts
const form = new FormData();
form.append('file', fileInput.files[0]);

const res = await fetch('/api/website/logo', {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'X-Business-Id': businessId,
    'x-timestamp': Date.now().toString(),
    'x-signature': computedSignature,
  },
  body: form,
  // Do NOT set Content-Type — the browser sets it with the boundary automatically
});
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Website logo updated successfully",
  "data": {
    "logoUrl": "https://res.cloudinary.com/..."
  }
}
```

Persist `data.logoUrl` locally (e.g. in your website config store) so the preview updates immediately without a full `GET /api/website` refetch.

**Error responses**

| Status | `message` | Cause |
|---|---|---|
| 400 | `No logo file provided` | Request sent without a file |
| 400 | `Logo must be a JPEG or PNG image` | Unsupported file type |
| 404 | `Website configuration not found` | Business has not generated a website yet |

---

## PATCH /api/website/booking-form

Replaces the entire booking form configuration. See [public-website-frontend-integration.md](./public-website-frontend-integration.md) for the full field schema and rendering guide.

**Request body**

```ts
{
  "title": string;         // required
  "description"?: string;
  "fields": Array<{
    "key": BookingFieldKey;
    "label": string;
    "placeholder"?: string;
    "required": boolean;
  }>;
}
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking form saved successfully",
  "data": null
}
```

---

## Updated: public website response now includes `logoUrl`

`GET /api/website/public/:subdomain` (used by the public-facing Next.js site) now includes `logoUrl` inside the `website` object:

```ts
data.website.logoUrl?: string;   // CDN URL, absent until a logo has been uploaded
```

Render this in the site header / navbar. Guard for its absence — businesses without an uploaded logo should fall back to a text logo or default mark.

```tsx
{data.website.logoUrl ? (
  <img src={data.website.logoUrl} alt={data.business.name} className="h-10 w-auto" />
) : (
  <span className="font-bold text-lg">{data.business.name}</span>
)}
```

---

## New service request email notifications

When a client submits a booking via the public website (`POST /api/requests`), the business owner now automatically receives an email listing the client name, service requested, date, and message.

**What triggers the email:**
- Any call to `POST /api/requests` (public endpoint) that creates a new request.

**When the email is suppressed:**
- The business owner has turned off email notifications (`business.notifications.email === false`). This is the master email toggle managed under `PATCH /api/settings/notifications`.

**Frontend action required — notification preference toggle:**

The existing Notifications tab in Settings (`GET /api/settings/notifications` / `PATCH /api/settings/notifications`) already exposes an `email` master toggle. Make sure it is prominently labelled so owners understand turning it off suppresses all email notifications, including new request alerts.

If you want a dedicated per-event toggle for service requests in the future, a `newRequest` preference field will be added to the notifications schema at that point.

---

## Dashboard website builder — recommended UI flow

```
Website Builder page
│
├── On mount: GET /api/website
│     ├── 404 → show "Generate your website" CTA
│     └── 200 → load into local state (colours, font, logoUrl, aiContent, bookingForm)
│
├── Generate / Re-generate button
│     └── POST /api/website/generate → refresh state from GET /api/website
│
├── Design panel (colour pickers + font selector)
│     └── PATCH /api/website/design (debounced or on blur)
│
├── Logo upload
│     └── PATCH /api/website/logo (multipart)
│           └── on success, update logoUrl in local state immediately
│
├── Content editor (section-by-section)
│     └── PATCH /api/website/content (send only the edited section)
│
└── Booking form configurator
      └── PATCH /api/website/booking-form (on save)
```

---

## Endpoint summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/website` | Required | Fetch full website config (dashboard) |
| `POST` | `/api/website/generate` | Required | AI-generate content and publish |
| `PATCH` | `/api/website/design` | Required | Update colours and font |
| `PATCH` | `/api/website/content` | Required | Update AI content sections |
| `PATCH` | `/api/website/logo` | Required | Upload / replace website logo |
| `PATCH` | `/api/website/booking-form` | Required | Save booking form configuration |
| `GET` | `/api/website/public/:subdomain` | None | Public website data (used by Next.js site) |
