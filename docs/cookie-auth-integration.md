# Cookie-Based Auth Integration Guide

This document covers everything the frontend needs to integrate with the HTTP-only cookie auth system.

---

## The `x-channel` Header (Required on All Requests)

Every request to the API — authenticated or not — **must** include the `x-channel` header. Requests missing this header or using an invalid value receive a `400 Bad Request`.

| Value | Who sends it | Token transport |
|---|---|---|
| `web` | Browser-based clients | Cookies set by the server (httpOnly) |
| `mobile` | Native mobile apps | `Authorization: Bearer` header + body tokens |

```http
x-channel: web
```

The server uses this header to enforce which token transport is valid for each channel. A web client **cannot** bypass the cookie requirement by sending a Bearer token, and a mobile client **cannot** rely on cookies.

**Exceptions — endpoints that do NOT require `x-channel`:**

| Endpoint | Reason |
|---|---|
| `GET /api/health` | Called by load balancers and monitoring tools |
| `GET /api/` | Root ping endpoint |
| `POST /api/stripe/webhook` | Sent by Stripe's servers, not a browser/app |

---

## Overview

Auth tokens are delivered as **HTTP-only cookies**. JavaScript cannot read these cookies — the browser sends them automatically on every request. This eliminates the XSS token-theft risk of storing tokens in `localStorage` or `sessionStorage`.

The admin portal is **web-only** and always uses cookies. The business and client portals support both `web` (cookie) and `mobile` (Bearer header) channels.

**Business and client portal behaviour per channel:**

| Behaviour | `web` | `mobile` |
|---|---|---|
| Login / create business | Sets `access_token` + `refresh_token` cookies | Returns tokens in body only |
| Refresh | Reads `refresh_token` cookie; sets new `access_token` + `refresh_token` cookies | Requires `refreshToken` in body; returns new `accessToken` + `refreshToken` in body |
| Logout | Reads `refresh_token` cookie; clears both cookies | Requires `refreshToken` in body |
| `verify-pin` / `complete-setup` | Reads `access_token` cookie | Reads `Authorization: Bearer` header |
| `GET /client-auth/me` | Reads `c_access_token` cookie | Reads `Authorization: Bearer` header |
| JWT extraction on all authed routes | Cookie only | Bearer header only |

**Admin portal behaviour (web-only, always cookies):**

| Behaviour | Admin |
|---|---|
| Login | Sets `a_access_token` (15 min) + `a_refresh_token` (30 days) cookies |
| Verify OTP (invited admins) | Sets `a_access_token` + `a_refresh_token` cookies |
| Refresh | Reads `a_refresh_token` cookie; sets new `a_access_token` cookie |
| Logout | Reads `a_refresh_token` cookie; clears both cookies |
| JWT extraction on all authed admin routes | `a_access_token` cookie only |

Tokens are **still returned in the response body** for business/client portals — the web frontend should ignore them; they exist only for mobile clients.

---

## Refresh Token Rotation

The server rotates the refresh token on every use. When you call `/auth/refresh`:
- The old refresh token is immediately **revoked**
- A brand-new refresh token is issued

For `web`, the new refresh token is placed in the `refresh_token` cookie automatically — no action needed. For `mobile`, store the new `refreshToken` from the response body and discard the old one before the next refresh call.

A stolen refresh token can only be used **once** before it is invalidated.

---

## Setup: Two Required Changes

### 1. Add `x-channel: web` to every request

#### Axios (global setup)

```ts
// src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://api.servixos.com/api',
  withCredentials: true,      // sends cookies cross-origin
  headers: {
    'x-channel': 'web',       // required on every request
  },
});
```

#### Fetch

```ts
fetch('https://api.servixos.com/api/auth/login', {
  method: 'POST',
  credentials: 'include',     // sends cookies cross-origin
  headers: {
    'Content-Type': 'application/json',
    'x-channel': 'web',       // required
  },
  body: JSON.stringify({ email, password }),
});
```

### 2. `credentials: 'include'` / `withCredentials: true`

This tells the browser to include the httpOnly cookies on cross-origin requests. Without it, no cookies are sent and all authenticated requests will return `401`.

---

## What to Remove from the Frontend

| Remove | Why |
|---|---|
| `localStorage.setItem('access_token', ...)` | Tokens are in httpOnly cookies — JS cannot write or read them |
| `localStorage.setItem('refresh_token', ...)` | Same |
| `Authorization: Bearer <token>` on authenticated requests | `access_token` cookie is sent automatically for `x-channel: web` |
| Manual JWT parsing or expiry checks on stored tokens | Not needed; 401 responses drive refresh |
| Passing `Authorization` header to `verify-pin` or `complete-setup` | `access_token` cookie is sent automatically |
| Sending `refreshToken` in the body of `refresh` or `logout` | Cookie is used automatically for `x-channel: web` |

You **do still need** to send:
- `X-Business-Id` on all business-portal authenticated requests
- `X-Client-Token` on public client-portal requests
- `X-Timestamp` + `X-Signature` HMAC headers as before

---

## Auth Flows

### Business Portal Login (2-step with PIN)

```
Step 1 — credentials
POST /api/auth/login
Headers: x-channel: web
Body: { email, password }

← Sets cookies: access_token (15 min), refresh_token (7 days)
← Body: { data: { accessToken, refreshToken, user } }   ← ignore token fields on web

Step 2 — PIN verification
POST /api/auth/verify-pin
Headers: x-channel: web
Body: { pin }
(access_token cookie is sent automatically — no Authorization header needed)

← Replaces access_token cookie with a pinVerified=true token
← Body: { data: { accessToken } }   ← ignore on web
```

### Onboarding — Create Business

```
POST /api/auth/onboarding/business
Headers: x-channel: web
Body: { ... }

← Sets cookies: access_token (15 min), refresh_token (7 days)
← Body: { data: { accessToken, refreshToken, user } }   ← ignore token fields on web
```

### Token Refresh

Call this when you receive a `401` on any authenticated endpoint.

```
POST /api/auth/refresh
Headers: x-channel: web
Body: {}   ← empty body; refresh_token cookie is sent automatically

← Replaces BOTH access_token cookie (15 min) AND refresh_token cookie (7 days)
← Old refresh token is immediately revoked (rotation)
← Body: { data: { accessToken, refreshToken } }   ← ignore token fields on web
```

### Logout

```
POST /api/auth/logout
Headers: x-channel: web
Body: {}   ← empty body; refresh_token cookie is sent automatically

← Clears access_token and refresh_token cookies
```

### Client Portal Login

```
POST /api/client-auth/login
Headers: x-channel: web
Body: { email, password }

← Sets cookies: c_access_token (15 min), c_refresh_token (7 days)
← Body: { data: { accessToken, refreshToken, user } }   ← ignore token fields on web

POST /api/client-auth/refresh   ← empty body; rotates refresh token via cookie
POST /api/client-auth/logout    ← empty body; clears cookies
```

### Client Portal Profile

This endpoint reads from the `c_access_token` cookie for web — no `Authorization` header needed.

```
GET /api/client-auth/me
Headers: x-channel: web
(c_access_token cookie is sent automatically)

← Body: { data: { id, clientId, name, email, businessId, timezone } }
```

---

## Cookie Names Reference

| Cookie | Portal | TTL | Notes |
|---|---|---|---|
| `access_token` | Business | 15 min | JWT with `pinVerified`, `permissions` |
| `refresh_token` | Business | 7 days | Rotated on every `/auth/refresh` call |
| `c_access_token` | Client | 15 min | JWT with `userRole: 'client'` |
| `c_refresh_token` | Client | 7 days | Rotated on every `/client-auth/refresh` call |
| `a_access_token` | Admin | 15 min | JWT with `aud: 'admin'` |
| `a_refresh_token` | Admin | 30 days | Long-lived; not rotated on refresh |

All cookies are:
- `HttpOnly` — not accessible to JavaScript
- `Secure` — HTTPS only (in production)
- `SameSite=Lax` — sent on same-site requests and top-level navigations

---

## Implementing a 401 Interceptor (Axios example)

```ts
// src/lib/api.ts
import axios, { type AxiosError } from 'axios';

export const api = axios.create({
  baseURL: 'https://api.servixos.com/api',
  withCredentials: true,
  headers: { 'x-channel': 'web' },
});

let isRefreshing = false;
let queue: Array<() => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config!;

    if (
      error.response?.status !== 401 ||
      original.url?.includes('/auth/refresh') ||
      original.url?.includes('/auth/logout')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<void>((resolve) => {
        queue.push(resolve);
      }).then(() => api(original));
    }

    isRefreshing = true;

    try {
      // No body needed — refresh_token cookie is sent and rotated automatically
      await api.post('/auth/refresh');
      queue.forEach((resolve) => resolve());
      queue = [];
      return api(original);
    } catch {
      queue = [];
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
```

---

## Auth State Management

Since tokens are in httpOnly cookies, JavaScript cannot read them. Manage auth state like this:

```ts
// On app load — hydrate by calling any lightweight authenticated endpoint
async function hydrateAuthState(): Promise<User | null> {
  try {
    const res = await api.get('/users/me');
    return res.data.data;
  } catch {
    return null;  // 401 = not logged in or session expired
  }
}

// On login success — read user info from body; never read or store token fields
const res = await api.post('/auth/login', { email, password });
const { user } = res.data.data;
setUser(user);
// ← do NOT touch res.data.data.accessToken or .refreshToken

// On verify-pin success — cookie is replaced automatically; just update UI state
await api.post('/auth/verify-pin', { pin });

// On logout — server clears cookies; clear local auth state
await api.post('/auth/logout');
setUser(null);
```

---

## Admin Portal

The admin portal (`/admin/api/...`) is **web-only** — all requests must include `x-channel: web`. Admin routes skip the HMAC signature requirement but still require the channel header.

```ts
export const adminApi = axios.create({
  baseURL: 'https://api.servixos.com/admin/api',
  withCredentials: true,      // sends a_access_token / a_refresh_token cookies
  headers: { 'x-channel': 'web' },
});
```

### Admin Login Flow

```
Step 1 — credentials (non-invited admin)
POST /admin/api/auth/login
Headers: x-channel: web
Body: { email, password }

← Sets cookies: a_access_token (15 min), a_refresh_token (30 days)
← Body: { data: { accessToken, refreshToken, mustChangePassword, admin } }   ← ignore token fields

Step 1 — credentials (invited admin → OTP required)
← Body: { data: { requiresOtp: true, otpToken } }   ← no cookies set yet

Step 2 — OTP verification (invited admins only)
POST /admin/api/auth/verify-otp
Headers: x-channel: web
Body: { otpToken, otp }

← Sets cookies: a_access_token (15 min), a_refresh_token (30 days)
```

### Admin Token Refresh

```
POST /admin/api/auth/refresh
Headers: x-channel: web
Body: {}   ← empty body; a_refresh_token cookie is sent automatically

← Sets new a_access_token cookie (15 min)
← Note: a_refresh_token is NOT rotated (30-day fixed window)
```

### Admin Logout

```
POST /admin/api/auth/logout
Headers: x-channel: web
Body: {}   ← empty body; a_refresh_token cookie is sent automatically

← Revokes the refresh token; clears a_access_token and a_refresh_token cookies
```

---

## Error Responses

| Status | Scenario |
|---|---|
| `400 Bad Request` | `x-channel` header is missing or invalid |
| `401 Unauthorized` | `web` client sent `verify-pin` / `complete-setup` but `access_token` cookie is absent |
| `401 Unauthorized` | `web` client called `GET /client-auth/me` but `c_access_token` cookie is absent |
| `401 Unauthorized` | `web` client called business/client `refresh` but `refresh_token` / `c_refresh_token` cookie is absent |
| `401 Unauthorized` | `mobile` client called `refresh` without `refreshToken` in body |
| `401 Unauthorized` | Admin called `refresh` but `a_refresh_token` cookie is absent |
| `401 Unauthorized` | Admin called any authenticated route but `a_access_token` cookie is absent or expired |

---

## CORS Note

The API has `credentials: true` and `x-channel` in its CORS config. Your frontend origin must be in `ALLOWED_ORIGINS` (or a `*.servixos.com` subdomain). If cookies are not being sent:

1. Confirm your origin is in `ALLOWED_ORIGINS`
2. Confirm `withCredentials: true` / `credentials: 'include'` is set on every request
3. Confirm `x-channel: web` header is present on every request
4. Confirm you are not on `http://` in production (cookies are `Secure` in prod)

---

## Mobile (Business and Client Portals)

Mobile clients send `x-channel: mobile`. The server will:
- Return tokens in the response body (no cookies set or read)
- Require `refreshToken` in the body for `/auth/refresh` and `/auth/logout`
- Return a new `refreshToken` on every refresh call — store it and discard the old one
- Send the `accessToken` via `Authorization: Bearer` header on authenticated routes

The **admin portal has no mobile channel** — it is web-only.
