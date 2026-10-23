# AI Suggestions API

AI Suggestions are actionable cards on the business dashboard. Each card proposes one concrete action. The user opens **Review & Execute**, checks the details, optionally edits a draft, and executes it. Executed suggestions move to the **Tracked** section, where the backend reports the observed outcome.

| Portal | Base path | Auth |
|---|---|---|
| **Business** | `/api/ai/suggestions` | JWT (`aud: business`) + `X-Business-Id` |

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ai/suggestions` | Current suggestion cards |
| `POST` | `/api/ai/suggestions/:id/apply` | Execute a suggestion (optionally with an edited draft) |
| `POST` | `/api/ai/suggestions/:id/dismiss` | Hide a suggestion without executing it |
| `GET` | `/api/ai/suggestions/tracked` | Executed suggestions and their outcomes |

---

## What changed (migration from the old shape)

| Before | Now |
|---|---|
| `{ id, text, tag }` | `{ id, category, title, description, recommendation, review }` |
| `id` was a fixed slug (`send-payment-reminders`, `client-follow-ups`, …) | `id` is a unique 24-char ObjectId string **per suggestion instance**. Two overdue invoices are two cards with two ids. |
| `tag`: `quick_win` \| `suggested` \| `high_impact` | `category`: `cash_flow` \| `pricing` \| `customer_retention` |
| `apply` took no body and returned `{ id, summary, remaining }` | `apply` takes `{ draftValue? }` and returns `{ id, remaining, executedAt }` |
| Tracked list lived only in browser state | `GET /tracked` returns it from the server, so it survives a refresh |
| "Mark stale jobs as completed" suggestion | **Removed** (it fits none of the three categories) |

Legacy slug ids (e.g. `send-payment-reminders`) are now rejected with `400`.

---

## Authentication

Required headers on every request:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

The feature key is `ai.suggestions`, which every plan includes. The plan limits how many cards are returned:

| Plan | Max suggestions shown |
|---|---|
| `starter` | 5 |
| `growth` | 50 |
| `pro` | Unlimited |

---

## Business rules

- **Every displayed value is pre-formatted.** `details[].value`, titles and amounts are strings ready to render (currency, dates, counts). Do not parse or reformat them.
- **Copy is AI-written.** `description`, `recommendation` and the message drafts are written by Claude from the business's real data. If the AI is unavailable, the backend uses its own template text, so the fields are always present and non-empty. Exact wording varies, and numbers in titles and details never come from the AI.
- **Figures refresh daily, ids don't.** A card keeps its `id` while it is active, even though values like "Days overdue" change each day.
- **Cards expire on their own.** If the underlying condition goes away (the invoice is paid or deleted, the client books a job), the card disappears from the next `GET`. Executing it after that returns `404`.
- **Cooldown after acting.** Once a subject is executed or dismissed, it is not suggested again for a while. After the cooldown it can come back as a **new** card with a **new** id.

  | Suggestion | Cooldown |
  |---|---|
  | Payment reminder (per invoice) | 7 days |
  | Client follow-up (per client) | 30 days |
  | Price increase | 30 days |
  | Revenue target | Once per target month |

- **Execute is idempotent against double-clicks.** The first request claims the suggestion. A concurrent second request gets `404` and the action never runs twice.
- **Failed executions roll back.** If the action fails (`500`), the suggestion stays active and the user can retry.
- **Mixed categories.** Cards are interleaved across types (reminder, follow-up, pricing, target, reminder, …), so a 5-slot plan doesn't show five payment reminders.

---

## Suggestion types

The frontend only needs `category`. This table shows what each card does so the UI copy makes sense.

| `category` | Card | Draft | What Execute does |
|---|---|---|---|
| `cash_flow` | **Payment reminder**: one per overdue unpaid invoice | Multiline reminder message | Emails the customer the (edited) message with the invoice PDF attached |
| `cash_flow` | **Revenue target**: one for next month | Single-line amount, e.g. `"13310"` | Saves the (edited) amount as next month's revenue target |
| `pricing` | **Price increase** | Single-line percentage, e.g. `"10"` | Raises the price of every upcoming, unstarted, priced job by the (edited) percentage |
| `customer_retention` | **Client follow-up**: one per client with no booking for 30+ days | Multiline message | Emails the client the (edited) check-in message |

An invoice counts as overdue from one full day after its due date. If it has no due date, the invoice date is used.

> If new categories are added later, the backend team will tell you before shipping, so you can add labels.

---

## Data models

### `Suggestion`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique ObjectId for this suggestion instance. Use it for `apply` / `dismiss` and as the React key. |
| `category` | `"cash_flow" \| "pricing" \| "customer_retention"` | Card group / label |
| `title` | `string` | Card headline, e.g. `"Invoice INV-2026-0042 is 12 days overdue"` |
| `description` | `string` | Why it matters (1–2 sentences) |
| `recommendation` | `string` | The proposed action (one sentence) |
| `review` | `SuggestionReview` | Content for the Review & Execute dialog |

### `SuggestionReview`

| Field | Type | Description |
|---|---|---|
| `heading` | `string` | Dialog heading, e.g. `"Payment reminder"` |
| `details` | `SuggestionDetail[]` | Ordered label/value rows |
| `draft` | `SuggestionDraft \| undefined` | Editable value. **The key is absent** when there is nothing to edit (all four current types have one, but don't rely on that). |
| `executeLabel` | `string` | Text for the action button, e.g. `"Send reminder"` |
| `successMessage` | `string` | Text for the success toast |

### `SuggestionDetail`

| Field | Type | Description |
|---|---|---|
| `label` | `string` | e.g. `"Days overdue"` |
| `value` | `string` | Display-ready value, e.g. `"12"`, `"$1,250"`, `"Oct 11, 2026"` |

Some rows are conditional. For example, `"Usually pays"` only appears when the customer has payment history.

### `SuggestionDraft`

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Field label, e.g. `"Reminder message"` |
| `value` | `string` | Initial value to prefill the input |
| `multiline` | `boolean` | `true` → textarea, `false` → single-line input |

### `TrackedSuggestion`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Same id the suggestion had when executed |
| `category` | `"cash_flow" \| "pricing" \| "customer_retention"` | |
| `title` | `string` | Title as it was at execution time |
| `executeLabel` | `string` | The action that was taken, e.g. `"Send reminder"` |
| `executedAt` | `string` | ISO 8601 UTC, e.g. `"2026-10-23T10:15:00.000Z"` |
| `outcome` | `string \| null` | Observed result, lowercase and ending in a period, written to follow *"The outcome is tracked automatically: …"*. `null` = still pending. |

---

## Endpoints

### GET /api/ai/suggestions

Returns the current suggestion cards, capped by plan.

**Request**

```http
GET /api/ai/suggestions
Authorization: Bearer <accessToken>
X-Business-Id: 664abc123456789012345678
x-timestamp: 1761214500000
x-signature: <hmac>
```

No query parameters, no body.

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "AI suggestions generated successfully",
  "data": {
    "count": 4,
    "suggestions": [
      {
        "id": "665f1c2b9d3e4a0012345678",
        "category": "cash_flow",
        "title": "Invoice INV-2026-0042 is 12 days overdue",
        "description": "Adaeze usually pays within 5 days, so this invoice is well past their normal pattern.",
        "recommendation": "Send a friendly payment reminder with a 3-day grace period.",
        "review": {
          "heading": "Payment reminder",
          "details": [
            { "label": "Customer", "value": "Adaeze Okafor" },
            { "label": "Invoice", "value": "INV-2026-0042" },
            { "label": "Amount due", "value": "$1,250" },
            { "label": "Due date", "value": "Oct 11, 2026" },
            { "label": "Days overdue", "value": "12" },
            { "label": "Usually pays", "value": "within 5 days" }
          ],
          "draft": {
            "label": "Reminder message",
            "value": "Hi Adaeze,\n\nThis is a friendly reminder that invoice INV-2026-0042 for $1,250 was due on Oct 11, 2026. If you've already sent payment, thank you, and please disregard this note. Otherwise, we'd appreciate payment within the next 3 days.\n\nThank you,\nAcme Services",
            "multiline": true
          },
          "executeLabel": "Send reminder",
          "successMessage": "Payment reminder sent for Invoice INV-2026-0042."
        }
      },
      {
        "id": "665f1c2b9d3e4a0012345679",
        "category": "customer_retention",
        "title": "Tunde Bello hasn't booked in 60 days",
        "description": "Tunde has completed 3 jobs with you but hasn't booked since their Gutter cleaning.",
        "recommendation": "Send a personal check-in email to invite them back.",
        "review": {
          "heading": "Client follow-up",
          "details": [
            { "label": "Customer", "value": "Tunde Bello" },
            { "label": "Email", "value": "tunde@example.com" },
            { "label": "Last job", "value": "Gutter cleaning" },
            { "label": "Completed on", "value": "Aug 24, 2026" },
            { "label": "Jobs completed", "value": "3" }
          ],
          "draft": {
            "label": "Follow-up message",
            "value": "Hi Tunde,\n\nIt's been a little while since we completed your Gutter cleaning. We'd love to help with anything new you have coming up. Just reply to this email and we'll get you scheduled.\n\nBest regards,\nAcme Services",
            "multiline": true
          },
          "executeLabel": "Send follow-up",
          "successMessage": "Follow-up sent to Tunde Bello."
        }
      },
      {
        "id": "665f1c2b9d3e4a001234567a",
        "category": "pricing",
        "title": "A 10% price increase could add $500/month",
        "description": "You have 4 upcoming priced jobs. Adjusting them before they start lifts revenue without touching completed work.",
        "recommendation": "Raise prices on upcoming jobs by 10%.",
        "review": {
          "heading": "Price adjustment",
          "details": [
            { "label": "Upcoming priced jobs", "value": "4" },
            { "label": "Revenue this month", "value": "$5,000" },
            { "label": "Suggested increase", "value": "10%" },
            { "label": "Estimated added revenue", "value": "$500/month" }
          ],
          "draft": { "label": "Price increase (%)", "value": "10", "multiline": false },
          "executeLabel": "Update prices",
          "successMessage": "Prices updated on upcoming jobs."
        }
      },
      {
        "id": "665f1c2b9d3e4a001234567b",
        "category": "cash_flow",
        "title": "Set a $13,310 revenue target for November 2026",
        "description": "Revenue changed +10% from August 2026 to September 2026. A target based on that trend keeps next month's goal visible.",
        "recommendation": "Set a $13,310 revenue target for November 2026.",
        "review": {
          "heading": "Revenue target",
          "details": [
            { "label": "September 2026 revenue", "value": "$12,100" },
            { "label": "August 2026 revenue", "value": "$11,000" },
            { "label": "Month-over-month change", "value": "+10%" },
            { "label": "Target month", "value": "November 2026" }
          ],
          "draft": { "label": "Target amount (USD)", "value": "13310", "multiline": false },
          "executeLabel": "Set target",
          "successMessage": "Revenue target for November 2026 saved."
        }
      }
    ]
  }
}
```

With nothing to suggest: `"data": { "count": 0, "suggestions": [] }`.

**Latency note:** when suggestions are new or their data changed, this request waits for the AI to write the copy, typically a few seconds. In the worst case (AI timing out) it can take up to about a minute before falling back. Repeat loads over unchanged data are fast. Show a loading skeleton and avoid aggressive client timeouts.

**Error responses**

| Status | `message` | When |
|---|---|---|
| `401` | — | Missing or invalid JWT / HMAC |
| `403` | Subscription / tenant error | Business inactive or the plan check failed |
| `404` | `Resource not found` | Business not found |
| `500` | `Unable to generate AI suggestions at this time` | Unexpected server error |

---

### POST /api/ai/suggestions/:id/apply

Executes the suggestion's action and moves it to Tracked.

**Path params**

| Param | Type | Rules |
|---|---|---|
| `id` | `string` | Must be a valid ObjectId (a `Suggestion.id`) |

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `draftValue` | `string` | No | Max 5000 characters. Send it **only when the suggestion has a `review.draft`**. If sent, it replaces the original draft. If omitted, the original `draft.value` is used. |

No other body fields are allowed. Unknown properties return `400`.

**What to send for each draft type**

| Draft | Send | Accepted examples | Rejected |
|---|---|---|---|
| Message (`multiline: true`) | Current textarea text | Any non-blank text | Blank or whitespace-only |
| Revenue target amount | Current input text | `"12500"`, `"12,500"`, `"$12,500.50"`, `"USD 12500"` | `"abc"`, `"0"`, `"-5"` |
| Price increase % | Current input text | `"10"`, `"10%"`, `"12.5"` | `"0"`, `"150"`, `"ten"` |

Simplest correct client logic: if `review.draft` exists, always send the current input value as `draftValue`. Otherwise send `{}`.

**Request**

```http
POST /api/ai/suggestions/665f1c2b9d3e4a0012345678/apply
Content-Type: application/json
```

```json
{
  "draftValue": "Hi Adaeze,\n\nJust a quick nudge on invoice INV-2026-0042 — could you settle it by Friday?\n\nThanks,\nAcme Services"
}
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Suggestion executed successfully",
  "data": {
    "id": "665f1c2b9d3e4a0012345678",
    "remaining": 3,
    "executedAt": "2026-10-23T10:15:00.000Z"
  }
}
```

| Field | Description |
|---|---|
| `id` | The executed suggestion |
| `remaining` | Active suggestions left, capped by the plan limit (use it for the badge/count) |
| `executedAt` | ISO 8601 UTC execution time (use it to add the card to Tracked optimistically) |

Show `review.successMessage` from the card in the success toast.

Emails (reminders, follow-ups) are queued for delivery. A `200` means the send was accepted, not that it was delivered.

**Error responses**

| Status | `message` | When | Suggested UI |
|---|---|---|---|
| `400` | `Suggestion id must be a valid id` | `:id` is not an ObjectId | Bug; refetch the list |
| `400` | `Draft value must be a string` | `draftValue` isn't a string | Bug |
| `400` | `Draft value must be 5000 characters or fewer` | Too long | Inline field error |
| `400` | `property <name> should not exist` | Unknown body field | Bug |
| `400` | `The draft cannot be empty` | `draftValue` is blank | Inline field error |
| `400` | `Target amount must be a positive number` | Revenue target input is invalid | Inline field error |
| `400` | `Price increase must be a percentage greater than 0 and at most 100` | Percentage input is invalid | Inline field error |
| `404` | `This suggestion is no longer available — it may have already been applied, dismissed, or resolved` | Already executed or dismissed, expired (e.g. invoice paid meanwhile), or a duplicate concurrent request | Close the dialog, remove the card, refetch the list |
| `404` | `Resource not found` | Business not found | — |
| `500` | `Unable to complete this action right now. Please try again` | The action itself failed. The suggestion is still active. | Keep the dialog open with the user's edits and offer retry |
| `500` | `Unable to generate AI suggestions at this time` | Unexpected server error | Generic error |

---

### POST /api/ai/suggestions/:id/dismiss

Hides a suggestion without executing it. The subject stays hidden for its cooldown (see Business rules). Dismissed suggestions do **not** appear in Tracked.

**Request**

```http
POST /api/ai/suggestions/665f1c2b9d3e4a0012345678/dismiss
```

No body.

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Suggestion dismissed successfully",
  "data": {
    "id": "665f1c2b9d3e4a0012345678",
    "remaining": 3
  }
}
```

**Error responses**

| Status | `message` | When |
|---|---|---|
| `400` | `Suggestion id must be a valid id` | `:id` is not an ObjectId |
| `404` | `This suggestion is no longer available — it may have already been applied, dismissed, or resolved` | Not active any more |
| `404` | `Resource not found` | Business not found |
| `500` | `Unable to generate AI suggestions at this time` | Unexpected server error |

---

### GET /api/ai/suggestions/tracked

Returns the **50 most recently executed** suggestions, newest first, with their observed outcome.

**Request**

```http
GET /api/ai/suggestions/tracked
```

No query parameters, no body.

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Tracked suggestions retrieved successfully",
  "data": {
    "tracked": [
      {
        "id": "665f1c2b9d3e4a0012345678",
        "category": "cash_flow",
        "title": "Invoice INV-2026-0042 is 12 days overdue",
        "executeLabel": "Send reminder",
        "executedAt": "2026-10-23T10:15:00.000Z",
        "outcome": null
      },
      {
        "id": "665f1c2b9d3e4a0012345600",
        "category": "cash_flow",
        "title": "Invoice INV-2026-0031 is 9 days overdue",
        "executeLabel": "Send reminder",
        "executedAt": "2026-10-18T09:00:00.000Z",
        "outcome": "paid 2 days later."
      },
      {
        "id": "665f1c2b9d3e4a0012345601",
        "category": "customer_retention",
        "title": "Tunde Bello hasn't booked in 60 days",
        "executeLabel": "Send follow-up",
        "executedAt": "2026-10-10T14:30:00.000Z",
        "outcome": "booked a new job 3 days later."
      }
    ]
  }
}
```

With nothing executed yet: `"data": { "tracked": [] }`.

**Rendering:** when `outcome` is a string, show `The outcome is tracked automatically: {outcome}`. When it is `null`, show the pending state.

**Possible outcomes**

| Suggestion | Outcome text | Final? |
|---|---|---|
| Payment reminder | `null` (no payment yet) | No |
| | `partially paid, $500 received so far.` | No (can change) |
| | `paid the same day.` / `paid 1 day later.` / `paid 2 days later.` | Yes |
| | `marked as paid.` (paid without a recorded payment) | Yes |
| | `no payment received within 30 days.` | Yes |
| | `the invoice was deleted.` | Yes |
| Client follow-up | `null` (no new booking yet) | No |
| | `booked a new job 3 days later.` (or `the same day`) | Yes |
| | `no new booking within 30 days.` | Yes |
| Revenue target | `null` until the target month ends | No |
| | `reached $11,200 of the $10,000 target (112%).` | Yes |
| Price increase | `null` until a repriced job completes or is cancelled | No |
| | `1 of 4 repriced jobs completed so far.` | No |
| | `3 of 4 repriced jobs completed at the new price, 1 cancelled.` | Yes |
| | `no upcoming jobs needed repricing.` | Yes |

Outcomes are evaluated when this endpoint is called, so refetch it when the Tracked section becomes visible. Polling is not needed.

**Error responses**

| Status | `message` | When |
|---|---|---|
| `401` | — | Missing or invalid JWT / HMAC |
| `500` | `Unable to generate AI suggestions at this time` | Unexpected server error |

---

## Common error shape

```json
{
  "success": false,
  "statusCode": 404,
  "message": "This suggestion is no longer available — it may have already been applied, dismissed, or resolved"
}
```

---

## Client-side integration patterns

### Review & Execute dialog

```typescript
async function executeSuggestion(s: Suggestion, draftInput?: string) {
  const body = s.review.draft ? { draftValue: draftInput ?? s.review.draft.value } : {};

  try {
    const { data } = await api.post<ApiResponse<ExecuteSuggestionResult>>(
      `/api/ai/suggestions/${s.id}/apply`,
      body,
    );
    toast.success(s.review.successMessage);
    removeCard(s.id);
    setBadgeCount(data.remaining);
    addTrackedOptimistically({
      id: s.id,
      category: s.category,
      title: s.title,
      executeLabel: s.review.executeLabel,
      executedAt: data.executedAt,
      outcome: null,
    });
  } catch (err) {
    const { statusCode, message } = err.response.data;
    if (statusCode === 400) return showFieldError(message); // keep dialog open
    if (statusCode === 404) {
      closeDialog();
      removeCard(s.id);
      return refetchSuggestions();
    }
    showRetryError(message); // 500: suggestion is still active, keep the user's edits
  }
}
```

### Rendering the draft input

```tsx
{s.review.draft &&
  (s.review.draft.multiline ? (
    <Textarea label={s.review.draft.label} defaultValue={s.review.draft.value} />
  ) : (
    <Input label={s.review.draft.label} defaultValue={s.review.draft.value} />
  ))}
```

### Category labels

```typescript
const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  cash_flow: 'Cash flow',
  pricing: 'Pricing',
  customer_retention: 'Customer retention',
};
```

---

## TypeScript types

```typescript
export type SuggestionCategory = 'cash_flow' | 'pricing' | 'customer_retention';

export interface SuggestionDetail {
  label: string;
  value: string;
}

export interface SuggestionDraft {
  label: string;
  value: string;
  multiline: boolean;
}

export interface SuggestionReview {
  heading: string;
  details: SuggestionDetail[];
  draft?: SuggestionDraft;
  executeLabel: string;
  successMessage: string;
}

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  recommendation: string;
  review: SuggestionReview;
}

export interface SuggestionsResult {
  count: number;
  suggestions: Suggestion[];
}

export interface ExecuteSuggestionRequest {
  draftValue?: string;
}

export interface ExecuteSuggestionResult {
  id: string;
  remaining: number;
  executedAt: string; // ISO 8601
}

export interface DismissSuggestionResult {
  id: string;
  remaining: number;
}

export interface TrackedSuggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  executeLabel: string;
  executedAt: string; // ISO 8601
  outcome: string | null; // null = pending
}

export interface TrackedSuggestionsResult {
  tracked: TrackedSuggestion[];
}

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}
```

---

## Integration checklist

- [ ] Replace `text` / `tag` usage with `title`, `description`, `recommendation`, `category`
- [ ] Use `Suggestion.id` (ObjectId string) for `apply` / `dismiss` and as the list key; drop any hard-coded slug ids
- [ ] Render `review.details` in order, as-is (values are pre-formatted)
- [ ] Render `review.draft` only when present: textarea if `multiline`, input otherwise
- [ ] Send `{ draftValue }` on apply only when the card has a draft; send `{}` otherwise
- [ ] Use `review.executeLabel` for the button and `review.successMessage` for the toast
- [ ] Handle `400` inline, `404` by removing the card and refetching, `500` by keeping the dialog open for retry
- [ ] Update the count badge from `remaining`
- [ ] Load Tracked from `GET /api/ai/suggestions/tracked` instead of browser state
- [ ] Show the pending state when `outcome === null`
- [ ] Show a loading state on `GET /api/ai/suggestions`, which can take several seconds when copy is regenerated
