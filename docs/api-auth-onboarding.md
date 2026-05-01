# ServixOS API — Auth & Onboarding

**Base URL**: `https://api.servixos.com/api`  
**Local URL**: `http://localhost:3000/api`

---

## Global Headers (Required on Every Request)

| Header | Value | Notes |
|---|---|---|
| `x-api-key` | `<your-api-key>` | Always required — global guard, cannot be bypassed |
| `Content-Type` | `application/json` | All request bodies are JSON |
| `Authorization` | `Bearer <accessToken>` | Required on protected routes only |
| `x-business-id` | `<businessId>` | Required on protected routes only |

> **Protected route** = any route not listed as `@Public`. These require both `Authorization` and `x-business-id`.

---

## Standard Response Envelope

Every response — success or error — is wrapped in this shape:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable result",
  "data": { }
}
```

Errors:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Descriptive error message"
}
```

---

## JWT Payload Shape

When you decode a JWT access token, the payload looks like:

```json
{
  "sub": "664abc123...",
  "businessId": "664def456...",
  "userRole": "owner",
  "pinVerified": false,
  "iat": 1714500000,
  "exp": 1714500900
}
```

| Field | Notes |
|---|---|
| `sub` | User ID |
| `businessId` | Business the user belongs to |
| `userRole` | `"owner"` or `"employee"` |
| `pinVerified` | `false` after login — becomes `true` after `/verify-pin` |

---

## Onboarding Flow Overview

The signup flow is **4 sequential steps** before a user can login:

```
Step 1  POST /auth/onboarding/account       → create user account (inactive)
Step 2  POST /auth/onboarding/verify-email  → verify email OTP
Step 3  POST /auth/onboarding/set-pin       → set 4-digit security PIN
Step 4  POST /auth/onboarding/business      → create business → returns session tokens
```

After step 4 the user is fully active and receives tokens immediately. Subsequent logins go through:

```
POST /auth/login      → returns token with pinVerified: false
POST /auth/verify-pin → returns token with pinVerified: true  (required to access the app)
```

---

# Onboarding Endpoints

All onboarding routes are `@Public` — no `Authorization` or `x-business-id` header needed.

---

## Step 1 — Create Account

```
POST /api/auth/onboarding/account
```

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+2348012345678",
  "password": "SecurePass1",
  "confirmPassword": "SecurePass1"
}
```

| Field | Type | Rules |
|---|---|---|
| `firstName` | string | Required, whitespace trimmed |
| `lastName` | string | Required, whitespace trimmed |
| `email` | string | Valid email, stored lowercase |
| `phone` | string | Valid international format (e.g. `+2348012345678`) |
| `password` | string | Min 8 chars, 1 uppercase, 1 digit |
| `confirmPassword` | string | Must exactly match `password` |

**Success Response — 201 Created**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created. Check your email for a verification code.",
  "data": null
}
```

**Error Cases**

| Status | Scenario |
|---|---|
| 400 | Validation failure (missing field, password mismatch, invalid email) |
| 409 | Email already registered |

> A 6-digit OTP is emailed to the user. OTP expires in **10 minutes**.

---

## Step 2 — Verify Email

```
POST /api/auth/onboarding/verify-email
```

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com",
  "otp": "482910"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | Valid email, stored lowercase |
| `otp` | string | Exactly 6 digits |

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verified successfully",
  "data": null
}
```

**Error Cases**

| Status | Scenario |
|---|---|
| 400 | OTP invalid, OTP expired, already verified, user not found |

---

## Resend OTP (Optional)

```
POST /api/auth/onboarding/resend-otp
```

Use when the user didn't receive or the OTP expired.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com"
}
```

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "A new verification code has been sent to your email",
  "data": null
}
```

> Always returns 200. Does not reveal whether the email exists (OWASP enumeration prevention). New OTP expires in **10 minutes**.

---

## Step 3 — Set PIN

```
POST /api/auth/onboarding/set-pin
```

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com",
  "pin": "1234",
  "confirmPin": "1234"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | Valid email, stored lowercase |
| `pin` | string | Exactly 4 digits (e.g. `"0391"`) |
| `confirmPin` | string | Must exactly match `pin` |

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "PIN set successfully",
  "data": null
}
```

**Error Cases**

| Status | Scenario |
|---|---|
| 400 | User not found, email not verified yet, PINs don't match |

---

## Step 4 — Create Business

```
POST /api/auth/onboarding/business
```

This is the final onboarding step. It atomically creates the business, website config, default roles, and activates the user's account. Returns session tokens on success.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com",
  "businessName": "Sparkle Cleaners",
  "businessCategory": "664abc000000000000000001",
  "businessDescription": "Professional residential and commercial cleaning services in Lagos.",
  "colorPrimary": "#2563eb",
  "colorSecondary": "#64748b",
  "font": "Inter",
  "services": ["Deep Cleaning", "Move-In/Out Cleaning", "Office Cleaning"],
  "timezone": "Africa/Lagos"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email, stored lowercase |
| `businessName` | string | Yes | Trimmed |
| `businessCategory` | string | Yes | Valid MongoDB ObjectId |
| `businessDescription` | string | Yes | Trimmed, passes content policy |
| `colorPrimary` | string | No | Hex color. Default: `#2563eb` |
| `colorSecondary` | string | No | Hex color. Default: `#64748b` |
| `font` | string | No | Default: `Inter` |
| `services` | string[] | No | Array of service names |
| `timezone` | string | Yes | Valid IANA timezone (e.g. `"Africa/Lagos"`, `"America/New_York"`) |

**Success Response — 201 Created**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Business setup complete",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6...",
    "user": {
      "id": "664abc123000000000000001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "businessId": "664abc456000000000000001",
      "subdomain": "sparkle-cleaners"
    }
  }
}
```

> The returned `accessToken` has `pinVerified: false`. The user must immediately call `/auth/verify-pin` to obtain a usable token for the app.

**What gets created**

- Business with `starter` plan, `trialing` status, 1-month trial
- Website config (unpublished, no AI content yet)
- Default `Owner` role (full permissions) and `Employee` role (limited permissions)
- User is activated (`isActive: true`), linked to business, assigned Owner role
- Welcome email is sent

**Subdomain Logic**

The subdomain is auto-generated from the business name (slugified). If `sparkle-cleaners` is taken, it tries `sparkle-cleaners-1`, `sparkle-cleaners-2`, etc.

**Error Cases**

| Status | Scenario |
|---|---|
| 400 | User not found, email not verified, PIN not set, invalid category, invalid timezone |
| 409 | Business already exists for this user |

---

# Auth Endpoints

---

## Login

```
POST /api/auth/login
```

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com",
  "password": "SecurePass1"
}
```

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6...",
    "user": {
      "id": "664abc123000000000000001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "businessId": "664abc456000000000000001"
    }
  }
}
```

> `accessToken` has `pinVerified: false`. Must call `/auth/verify-pin` next.

**Error Cases**

| Status | Scenario |
|---|---|
| 401 | Invalid credentials (intentionally same message for wrong email or wrong password) |

---

## Verify PIN

```
POST /api/auth/verify-pin
```

Called immediately after login. Validates the user's 4-digit PIN and returns a new access token with `pinVerified: true`.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
Authorization: Bearer <accessToken from /login>
```

> `x-business-id` is **not** required here.

**Request Body**
```json
{
  "pin": "1234"
}
```

| Field | Type | Rules |
|---|---|---|
| `pin` | string | Exactly 4 digits |

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Verified successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> This new `accessToken` has `pinVerified: true` and should replace the previous one. Store it and use it for all subsequent API calls.

**Error Cases**

| Status | Scenario |
|---|---|
| 401 | Wrong PIN (max 3 attempts within 1 hour) |
| 401 | Account locked after 3 failed attempts |
| 401 | Invalid or expired token in Authorization header |

**Rate Limiting**

- Max **3 failed PIN attempts** per user within 1 hour
- After 3 failures the account is temporarily locked (resets after 1 hour)

---

## Refresh Token

```
POST /api/auth/refresh
```

Exchange a valid refresh token for a new access token. Does **not** issue a new refresh token.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Session refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> The refreshed access token has the same `pinVerified` state as before. If the user's session had `pinVerified: true`, the new token will too.

**Error Cases**

| Status | Scenario |
|---|---|
| 401 | Refresh token not found, revoked, or expired |
| 401 | Associated user not found or inactive |

**Token Lifetimes**

| Token | Lifetime |
|---|---|
| Access token | Configured via `JWT_EXPIRES_IN` (default: 15 minutes) |
| Refresh token | 7 days from issuance |

---

## Logout

```
POST /api/auth/logout
```

Revokes the refresh token so it can no longer be used.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```

> Always returns 200 even if the token is already invalid or not found.

---

## Forgot Password

```
POST /api/auth/forgot-password
```

Sends a password reset OTP to the user's email.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "email": "john@example.com"
}
```

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "If an account exists, a reset code has been sent",
  "data": null
}
```

> Always returns 200 regardless of whether the email exists (OWASP enumeration prevention). OTP expires in **10 minutes**.

---

## Reset Password

```
POST /api/auth/reset-password
```

Uses the OTP from the reset email to set a new password.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
```

**Request Body**
```json
{
  "otp": "739241",
  "newPassword": "NewSecurePass1"
}
```

| Field | Type | Rules |
|---|---|---|
| `otp` | string | 6-digit code from email |
| `newPassword` | string | Min 8 chars, 1 uppercase, 1 digit |

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password updated successfully",
  "data": null
}
```

> On success, **all existing refresh tokens are revoked**. The user must log in again on all devices.

**Error Cases**

| Status | Scenario |
|---|---|
| 400 | OTP invalid, OTP expired, password doesn't meet requirements |

---

# Website

---

## Generate & Publish Website

```
POST /api/website/generate
```

Generates AI content for the business website using Claude and marks it as published. The website becomes accessible at `https://<subdomain>.servixos.com`.

**Headers**
```
x-api-key: <api-key>
Content-Type: application/json
Authorization: Bearer <accessToken with pinVerified: true>
x-business-id: <businessId>
```

**Request Body**: Empty `{}`

**Success Response — 200 OK**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Website published successfully",
  "data": {
    "subdomain": "sparkle-cleaners",
    "url": "https://sparkle-cleaners.servixos.com"
  }
}
```

**Error Cases**

| Status | Scenario |
|---|---|
| 401 | Invalid or expired access token |
| 403 | `x-business-id` doesn't match JWT claim, business locked/canceled |

---

# Postman Setup Guide

## Environment Variables

Create a Postman environment with these variables:

| Variable | Initial Value | Description |
|---|---|---|
| `baseUrl` | `http://localhost:3000/api` | API base URL |
| `apiKey` | `<your-api-key>` | Static API key |
| `accessToken` | *(empty)* | Set automatically by login scripts |
| `refreshToken` | *(empty)* | Set automatically by login scripts |
| `businessId` | *(empty)* | Set automatically after onboarding step 4 |
| `userEmail` | *(empty)* | Handy for sharing across onboarding requests |

## Pre-request Script (Global)

Add to collection's **Pre-request Script** tab:

```javascript
pm.request.headers.add({ key: "x-api-key", value: pm.environment.get("apiKey") });
```

## Login Test Script

Add to the **Tests** tab of the `POST /auth/login` request to auto-store tokens:

```javascript
const res = pm.response.json();
if (res.success) {
  pm.environment.set("accessToken", res.data.accessToken);
  pm.environment.set("refreshToken", res.data.refreshToken);
  pm.environment.set("businessId", res.data.user.businessId);
}
```

## Verify PIN Test Script

Add to the **Tests** tab of `POST /auth/verify-pin` to replace the token:

```javascript
const res = pm.response.json();
if (res.success) {
  pm.environment.set("accessToken", res.data.accessToken);
}
```

## Onboarding Step 4 Test Script

Add to the **Tests** tab of `POST /auth/onboarding/business`:

```javascript
const res = pm.response.json();
if (res.success) {
  pm.environment.set("accessToken", res.data.accessToken);
  pm.environment.set("refreshToken", res.data.refreshToken);
  pm.environment.set("businessId", res.data.user.businessId);
}
```

## Refresh Token Test Script

Add to the **Tests** tab of `POST /auth/refresh`:

```javascript
const res = pm.response.json();
if (res.success) {
  pm.environment.set("accessToken", res.data.accessToken);
}
```

## Authorization Header

For all protected requests, set the **Authorization** tab to:
- Type: `Bearer Token`
- Token: `{{accessToken}}`

And add header:
```
x-business-id: {{businessId}}
```

---

# Complete Request Collection

## Collection Folder Structure

```
ServixOS API
├── Onboarding
│   ├── Step 1 — Create Account     POST {{baseUrl}}/auth/onboarding/account
│   ├── Step 2 — Verify Email       POST {{baseUrl}}/auth/onboarding/verify-email
│   ├── Resend OTP                  POST {{baseUrl}}/auth/onboarding/resend-otp
│   ├── Step 3 — Set PIN            POST {{baseUrl}}/auth/onboarding/set-pin
│   └── Step 4 — Create Business    POST {{baseUrl}}/auth/onboarding/business
├── Auth
│   ├── Login                       POST {{baseUrl}}/auth/login
│   ├── Verify PIN                  POST {{baseUrl}}/auth/verify-pin
│   ├── Refresh Token               POST {{baseUrl}}/auth/refresh
│   ├── Logout                      POST {{baseUrl}}/auth/logout
│   ├── Forgot Password             POST {{baseUrl}}/auth/forgot-password
│   └── Reset Password              POST {{baseUrl}}/auth/reset-password
└── Website
    └── Generate & Publish          POST {{baseUrl}}/website/generate
```

---

# Common Error Reference

| HTTP Status | Meaning | Common Cause |
|---|---|---|
| 400 | Bad Request | Validation failure, expired OTP, wrong OTP |
| 401 | Unauthorized | Missing/invalid API key, bad JWT, wrong password/PIN |
| 403 | Forbidden | Business locked, subscription canceled, insufficient permissions |
| 409 | Conflict | Email already registered, business already created |
| 500 | Internal Server Error | Unexpected server failure |

---

# Password & PIN Rules

**Password**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 digit (0–9)

**PIN**
- Exactly 4 digits
- Leading zeros allowed (e.g. `"0391"`) — send as string, not integer
- Max 3 incorrect attempts per hour before temporary lock

---

# Subscription Plans Reference

Created businesses start on the **Starter** plan with a **1-month free trial**.

| Plan | Price | Status after onboarding |
|---|---|---|
| Starter | $29/mo | `trialing` for 1 month, then requires payment |
| Growth | $79/mo | — |
| Pro | $199/mo | — |

**Subscription Statuses**

| Status | Meaning |
|---|---|
| `trialing` | Free trial active — full access |
| `active` | Paid subscription current |
| `grace_period` | Payment failed — 5-day recovery window |
| `locked` | Trial or grace period expired — access blocked |
| `canceled` | Subscription explicitly canceled |

> `locked` and `canceled` businesses are rejected by `TenantGuard` — all protected requests return 403.
