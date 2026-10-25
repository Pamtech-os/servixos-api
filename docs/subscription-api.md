# Subscription API — Frontend Integration Guide

## Overview

ServixOS uses a **Stripe-powered subscription system** with 3 plans (Starter, Growth, Pro), 30-day free trials, and a 5-day grace period on payment failure. The server owns all subscription state — the frontend never sends plan prices or amounts.

---

## Base URL

```
https://api.servixos.com/api
```

All subscription endpoints are under `/api/subscription/`. Business authentication requires:

```
Authorization: Bearer <jwt_token>
X-Business-Id: <business_id>
```

---

## Subscription State Machine

```
TRIALING  ──[30-day trial ends, payment collected]──────→  ACTIVE
TRIALING  ──[trial ends, payment fails / no card]───────→  GRACE_PERIOD
ACTIVE    ──[renewal payment fails]─────────────────────→  GRACE_PERIOD
GRACE_PERIOD ──[payment recovered within 5 days]─────────→  ACTIVE
GRACE_PERIOD ──[5 days elapsed unpaid]───────────────────→  LOCKED
LOCKED    ──[outstanding invoice paid]───────────────────→  ACTIVE
ACTIVE    ──[business cancels]───────────────────────────→  CANCELED (at period end)
```

| Status | Business can log in | Business can use features |
|---|---|---|
| `trialing` | ✓ | ✓ |
| `active` | ✓ | ✓ |
| `grace_period` | ✓ | ✓ (show payment banner) |
| `locked` | ✓ | ✗ (only `/pay-now` allowed) |
| `canceled` | ✓ | ✗ |

---

## Endpoints

### 1. List Plans

```http
GET /api/subscription/plans
```

Public — no auth required. Use this on your pricing/signup page.

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Plans retrieved successfully",
  "data": [
    {
      "slug": "starter",
      "name": "Starter",
      "description": "...",
      "monthlyPriceUsd": 2900,
      "yearlyPriceUsd": 27840,
      "features": ["jobs.manage", "invoices.manage", "clients.manage", "ai.business-setup", "ai.insights", "ai.suggestions", "support.center"],
      "limits": {
        "maxClients": 10,
        "maxJobsPerMonth": 10,
        "maxInvoicesPerMonth": 10,
        "maxEmployees": 0,
        "maxAiSuggestions": 5,
        "activityLogDays": 0
      },
      "isPopular": false,
      "displayOrder": 0
    },
    {
      "slug": "growth",
      "name": "Growth",
      "monthlyPriceUsd": 7900,
      "yearlyPriceUsd": 75840,
      "limits": {
        "maxClients": 50,
        "maxJobsPerMonth": -1,
        "maxInvoicesPerMonth": 50,
        "maxEmployees": 10,
        "maxAiSuggestions": 50,
        "activityLogDays": 30
      },
      "isPopular": true
    },
    {
      "slug": "pro",
      "name": "Pro",
      "monthlyPriceUsd": 10000,
      "yearlyPriceUsd": 96000,
      "limits": {
        "maxClients": -1,
        "maxJobsPerMonth": -1,
        "maxInvoicesPerMonth": -1,
        "maxEmployees": -1,
        "maxAiSuggestions": -1,
        "activityLogDays": 365
      },
      "isPopular": false
    }
  ]
}
```

> **Note:** `-1` in limits means unlimited.

---

### 2. Create Setup Intent (collect payment method)

```http
POST /api/subscription/setup-intent
```

Creates a Stripe SetupIntent. The `clientSecret` is passed to `stripe.confirmCardSetup()` in Stripe.js so the business owner can save a card without being immediately charged.

**Request body:** none

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Setup intent created successfully",
  "data": {
    "clientSecret": "seti_1ABC...._secret_xyz"
  }
}
```

**Frontend flow**

```js
const stripe = Stripe(PUBLISHABLE_KEY);

// 1. Get clientSecret from your server
const { data } = await api.post('/subscription/setup-intent');
const { clientSecret } = data.data;

// 2. Show Stripe's card form and confirm
const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
  payment_method: { card: cardElement }
});

if (error) {
  // Show error.message to user
} else {
  // Card saved — setupIntent.status === 'succeeded'
  // Server is notified via setup_intent.succeeded webhook automatically
}
```

---

### 3. Subscribe (start 30-day trial)

```http
POST /api/subscription/subscribe
```

Starts a 30-day free trial on the chosen plan. No payment is taken until the trial ends. Optionally accepts a `paymentMethodId` to pre-attach a card for seamless trial-to-paid conversion.

**Request body**

```json
{
  "plan": "starter",
  "billingInterval": "monthly",
  "paymentMethodId": "pm_1ABC..." // optional — from setupIntent above
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `plan` | string | ✓ | `starter`, `growth`, `pro` |
| `billingInterval` | string | ✓ | `monthly`, `yearly` |
| `paymentMethodId` | string | ✗ | Stripe PaymentMethod ID |

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Subscription created successfully. Your 30-day free trial has started",
  "data": {
    "trialEndsAt": "2026-07-15T00:00:00.000Z"
  }
}
```

**Error responses**

| Status | Code | Reason |
|---|---|---|
| 409 | `Conflict` | Business already has a subscription |
| 404 | `Not Found` | Business not found or Stripe customer not initialised yet |
| 404 | `Not Found` | Plan slug does not exist |

---

### 4. Upgrade Plan

```http
POST /api/subscription/upgrade
```

Upgrades the current plan to a higher tier. **Downgrades are not allowed.** Stripe prorates the difference and invoices immediately — a successful charge fires `invoice.payment_succeeded` which updates features server-side.

**Request body**

```json
{
  "plan": "growth",
  "billingInterval": "monthly"
}
```

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Plan upgraded successfully"
}
```

**Error responses**

| Status | Code | Reason |
|---|---|---|
| 400 | `Bad Request` | Already on this plan |
| 400 | `Bad Request` | Target plan is lower than current plan |
| 404 | `Not Found` | No active subscription |
| 500 | `Internal Server Error` | Stripe error — safe to retry |

> **Features are not updated immediately.** The plan upgrade is optimistic — features update only after Stripe processes the proration invoice and fires `invoice.payment_succeeded`. Show a "processing" state until `/api/me` reflects the new plan.

---

### 5. Cancel Subscription

```http
POST /api/subscription/cancel
```

Schedules cancellation at the end of the current billing period. Access continues until then.

**Request body:** none

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Subscription canceled successfully"
}
```

---

### 6. Pay Now (grace period / locked)

```http
POST /api/subscription/pay-now
```

Returns a PaymentIntent `clientSecret` for the outstanding invoice. Used in the grace period or when the account is locked. This endpoint is accessible even for `locked` accounts.

**Request body:** none

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment initiated successfully",
  "data": {
    "clientSecret": "pi_1ABC...._secret_xyz",
    "invoiceId": "in_1ABC...",
    "amountDue": 2900,
    "currency": "usd"
  }
}
```

**Frontend flow**

```js
// 1. Get clientSecret
const { data } = await api.post('/subscription/pay-now');
const { clientSecret, amountDue, currency } = data.data;

// 2. Confirm payment (handles 3DS automatically)
const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);

if (error) {
  if (error.code === 'authentication_required') {
    // 3DS required — Stripe.js shows the auth dialog automatically
  }
} else if (paymentIntent.status === 'succeeded') {
  // Payment confirmed — wait for webhook to restore ACTIVE status
  // Poll GET /api/me every 2 seconds until subscription.status === 'active'
}
```

---

### 7. Transaction History

```http
GET /api/subscription/transactions?page=1&limit=20
```

Paginated billing history for the current business.

**Query params**

| Param | Type | Default |
|---|---|---|
| `page` | number | 1 |
| `limit` | number | 20 |

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Transaction history retrieved successfully",
  "data": [
    {
      "_id": "...",
      "type": "payment_succeeded",
      "status": "success",
      "plan": "growth",
      "billingInterval": "monthly",
      "amountUsd": 7900,
      "currency": "usd",
      "stripeInvoiceId": "in_1ABC...",
      "createdAt": "2026-06-15T10:23:00.000Z"
    }

```

> **`status` values:** `pending` (Stripe event received, processing), `success` (confirmed), `failed` (payment declined or processing error). Most records transition from `pending` → `success`/`failed` within seconds.

```json
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

**Transaction types**

| `type` | Meaning |
|---|---|
| `trial_start` | 30-day trial began |
| `subscription_created` | Subscription activated after trial with first payment |
| `payment_succeeded` | Renewal invoice paid |
| `payment_failed` | Renewal invoice failed — grace period started |
| `plan_upgraded` | Upgraded to a higher plan |
| `canceled` | Subscription scheduled for cancellation |
| `account_locked` | Account locked after grace period expired |
| `account_restored` | Account restored after payment |

---

### 8. Business Profile + Subscription (`/me`)

```http
GET /api/me
```

Returns the full business profile including the current subscription state.

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Business profile retrieved successfully",
  "data": {
    "id": "664abc123...",
    "name": "Acme Co",
    "subdomain": "acme",
    "email": "owner@acme.com",
    "subscription": {
      "plan": "growth",
      "status": "active",
      "features": ["jobs.manage", "invoices.manage", "clients.manage", "ai.business-setup", "ai.insights", "ai.suggestions", "support.center", "clients.export", "employees.manage", "..."],
      "billingInterval": "monthly",
      "hasPaymentMethod": true,
      "trialEndsAt": null,
      "currentPeriodEnd": "2026-07-15T00:00:00.000Z",
      "gracePeriodEndsAt": null
    }
  }
}
```

> Poll this endpoint after a payment to confirm status has transitioned to `active`. The webhook processing is near-instant (< 2 s) in production.

---

## Full Onboarding Flow

```
1.  POST /api/auth/business/register   →  creates business + fires Stripe customer setup job
2.  GET  /api/subscription/plans       →  show plan picker
3.  POST /api/subscription/setup-intent →  get clientSecret for card collection
4.  stripe.confirmCardSetup(secret)    →  card saved in Stripe (no charge yet)
5.  POST /api/subscription/subscribe   →  start 30-day trial
6.  GET  /api/me                       →  poll until status === 'trialing'
```

---

## Grace Period & Locked Account Flow

```
1.  Stripe invoice fails
2.  Server sets status = grace_period, gracePeriodEndsAt = now + 5 days
3.  Business receives "payment failed" email
4.  Show payment banner in UI (check subscription.status === 'grace_period')
5.  POST /api/subscription/pay-now     →  get clientSecret
6.  stripe.confirmCardPayment(secret)  →  complete payment (handles 3DS)
7.  GET  /api/me every 2s              →  wait for status === 'active'
```

If the business does not pay within 5 days:
```
8.  Server sets status = locked
9.  Business receives "account locked" email
10. All API calls return 403 except POST /api/subscription/pay-now
11. Same pay-now flow as above restores access instantly
```

---

## Webhook Events (server-side only)

The server handles these events from Stripe. **You do not need to handle webhooks on the frontend.** All state changes are reflected in `GET /api/me`.

| Event | Server action |
|---|---|
| `invoice.payment_succeeded` | status → `active`, features updated, activation email sent |
| `invoice.payment_failed` | status → `grace_period`, 5-day lock timer started, email sent |
| `customer.subscription.trial_will_end` | Trial-ending reminder email sent (3 days before) |
| `customer.subscription.deleted` | status → `canceled` |
| `setup_intent.succeeded` | `subscription.hasPaymentMethod` set to `true` |
| `payment_intent.requires_action` | 3DS action-required email sent to business owner |

---

## Error Response Shape

All errors follow the standard `ApiResponse` shape:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "No outstanding invoice found"
}
```

---

## Feature Gating

Features are gated server-side. If a request hits an endpoint guarded by `@RequirePlan('feature.key')` and the business doesn't have that feature, the response is:

```json
{
  "success": false,
  "statusCode": 403,
  "message": "This feature requires the growth plan or higher. Please upgrade your subscription"
}
```

The `subscription.features` array in `/api/me` lists every feature key the business currently has. Use this to show/hide UI elements without requiring a roundtrip per feature check.

---

## Prices Reference

| Plan | Monthly | Yearly | Yearly per month |
|---|---|---|---|
| Starter | $29.00 | $278.40 | $23.20 |
| Growth | $79.00 | $758.40 | $63.20 |
| Pro | $100.00 | $960.00 | $80.00 |

All amounts returned by the API are in **cents** (e.g. `2900` = $29.00, `currency: "usd"`).
