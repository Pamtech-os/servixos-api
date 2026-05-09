# Authentication & Onboarding API

Base URL: `/api/auth`

All endpoints in this module are **public** — no JWT or `X-Business-Id` header is required. However, most non-auth routes require the global HMAC signature headers (see [Request Signing](#request-signing)).

---

## Request Signing

Every request to the API must carry two headers (except where `@SkipSignature()` is noted):

| Header | Description |
|---|---|
| `x-timestamp` | Unix timestamp in milliseconds (string) |
| `x-signature` | HMAC-SHA256 of `timestamp + method + path + body` signed with the shared `API_KEY` |

---

## Onboarding Flow

Registration is a four-step process:

```
1. POST /api/auth/onboarding/account   → create user account
2. POST /api/auth/onboarding/verify-email → verify OTP sent to email
3. POST /api/auth/onboarding/set-pin   → set a 4-digit PIN
4. POST /api/auth/onboarding/business  → create the business profile
```

After step 4, the user receives an `accessToken` and `refreshToken` and is fully logged in.

---

## Endpoints

### GET /api/auth/client-token

Issues a short-lived anonymous token used to initialise the SDK before login. **Skips signature check.**

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Client token issued",
  "data": {
    "token": "<jwt>"
  }
}
```

---

### POST /api/auth/login

Authenticate an existing user.

**Request body**
```json
{
  "email": "owner@example.com",
  "password": "SecretPass1"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | lowercased |
| `password` | string | yes | |

**Response `200`**

If the user has a PIN set, a `stepUpToken` is returned and the client must call `/verify-pin` to receive the real tokens.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "requiresPin": true,
    "stepUpToken": "<short-lived jwt>"
  }
}
```

Or, when no PIN is required:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "user": {
      "_id": "...",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "owner@example.com"
    }
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 401 | Invalid credentials |
| 403 | Account not verified |

---

### POST /api/auth/verify-pin

Exchange the `stepUpToken` (from login) for real tokens by verifying the 4-digit PIN.

**Headers**
```
Authorization: Bearer <stepUpToken>
```

**Request body**
```json
{
  "pin": "1234"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "PIN verified",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "user": { ... }
  }
}
```

---

### POST /api/auth/refresh

Refresh an expired access token.

**Request body**
```json
{
  "refreshToken": "<opaque>"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>"
  }
}
```

---

### POST /api/auth/logout

Invalidate the refresh token.

**Request body**
```json
{
  "refreshToken": "<opaque>"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```

---

### POST /api/auth/forgot-password

Send a password-reset OTP to the user's email.

**Request body**
```json
{
  "email": "owner@example.com"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset email sent",
  "data": null
}
```

---

### POST /api/auth/reset-password

Reset the password using the OTP received by email.

**Request body**
```json
{
  "otp": "123456",
  "newPassword": "NewSecure1"
}
```

Password rules: min 8 characters, at least one uppercase letter, at least one digit.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset successful",
  "data": null
}
```

---

### POST /api/auth/onboarding/account

Step 1 — create a user account. Sends a 6-digit OTP to the provided email.

**Request body**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+2348012345678",
  "password": "SecretPass1",
  "confirmPassword": "SecretPass1"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | yes | |
| `lastName` | string | yes | |
| `email` | string | yes | |
| `phone` | string | yes | E.164 format, e.g. `+2348012345678` |
| `password` | string | yes | min 8 chars, 1 uppercase, 1 digit |
| `confirmPassword` | string | yes | must match `password` |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created. Please verify your email.",
  "data": null
}
```

---

### POST /api/auth/onboarding/verify-email

Step 2 — verify the OTP sent to email.

**Request body**
```json
{
  "email": "jane@example.com",
  "otp": "483921"
}
```

`otp` must be exactly 6 characters.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verified",
  "data": null
}
```

---

### POST /api/auth/onboarding/resend-otp

Resend the email verification OTP.

**Request body**
```json
{
  "email": "jane@example.com"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP resent",
  "data": null
}
```

---

### POST /api/auth/onboarding/set-pin

Step 3 — set a 4-digit security PIN.

**Request body**
```json
{
  "email": "jane@example.com",
  "pin": "1234",
  "confirmPin": "1234"
}
```

`pin` must be exactly 4 numeric digits.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "PIN set successfully",
  "data": null
}
```

---

### POST /api/auth/onboarding/business

Step 4 — create the business profile. Returns tokens; the user is now fully authenticated.

**Request body**
```json
{
  "email": "jane@example.com",
  "businessName": "Jane's Plumbing",
  "businessCategory": "64f1a2b3c4d5e6f7a8b9c0d1",
  "businessDescription": "Professional residential plumbing services.",
  "timezone": "Africa/Lagos",
  "colorPrimary": "#1A73E8",
  "colorSecondary": "#FBBC04",
  "font": "Inter",
  "services": ["Pipe repair", "Drain cleaning"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | must match the verified account |
| `businessName` | string | yes | |
| `businessCategory` | string | yes | MongoDB ObjectId |
| `businessDescription` | string | yes | plain text, no HTML/scripts |
| `timezone` | string | yes | IANA timezone, e.g. `Africa/Lagos` |
| `colorPrimary` | string | no | hex colour |
| `colorSecondary` | string | no | hex colour |
| `font` | string | no | |
| `services` | string[] | no | list of offered services |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Business created",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "business": {
      "_id": "...",
      "name": "Jane's Plumbing",
      "slug": "janes-plumbing"
    }
  }
}
```

---

## JWT Payload (business portal)

Decoded `accessToken` contains:

```json
{
  "sub": "<userId>",
  "businessId": "<businessId>",
  "roleId": "<roleId>",
  "aud": "business",
  "iat": 1700000000,
  "exp": 1700086400
}
```

The `accessToken` must be sent as `Authorization: Bearer <token>` on all protected endpoints. The `X-Business-Id` header is also required on all business-portal requests.
