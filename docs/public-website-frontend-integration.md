# Public Website — Backend API & Frontend Integration Guide

This document covers the backend endpoints added to serve AI-generated business websites, and the complete set of steps the Next.js frontend must implement to make subdomain routing, the landing page, and the booking form work.

---

## What was added on the backend

### 1. `GET /api/website/public/:subdomain`

- No authentication required (`@Public()`)
- Returns `404` if the subdomain does not match any business, or if the website exists but has not been published yet
- Returns `200` with the full website payload when the site is live

#### Response shape

```ts
{
  success: true,
  statusCode: 200,
  message: "Website configuration retrieved successfully",
  data: {
    business: {
      name: string;
      categoryName: string;
      description?: string;
      phone?: string;
      email?: string;
      address?: string;
      services: string[];        // list of service names offered by the business
    };
    website: {
      colorPrimary: string;      // e.g. "#2563eb"
      colorSecondary: string;    // e.g. "#64748b"
      font: string;              // e.g. "Inter"
      aiContent?: {
        hero: {
          headline: string;
          subheadline: string;
          ctaText: string;       // text for the primary CTA button, e.g. "Book now"
        };
        about: {
          title: string;
          body: string;
        };
        services: Array<{
          name: string;
          description: string;
        }>;
        testimonialPlaceholder: {
          quote: string;
          author: string;
        };
        contact: {
          callToAction: string;
        };
      };
      bookingForm?: {
        title: string;           // e.g. "Book a Service"
        description?: string;    // e.g. "We'll get back to you within 24 hours."
        fields: Array<{
          key: BookingFieldKey;  // see field key enum below
          label: string;         // display label shown above the input
          placeholder?: string;  // input placeholder text
          required: boolean;     // whether the field is mandatory on the public form
        }>;
      };
    };
  }
}
```

**`aiContent`** is optional — absent if AI generation failed during onboarding. Fall back to `business.name` / `business.categoryName` copy.

**`bookingForm`** is optional — absent until the business saves their booking form configuration from the dashboard. Fall back to a hardcoded default form (see booking form section below).

#### `BookingFieldKey` values

Each field in `bookingForm.fields` has a `key` that maps directly to the corresponding `CreateRequestDto` field submitted when the form is posted:

| `key`              | Maps to DTO field    | Input type  |
|--------------------|----------------------|-------------|
| `clientName`       | `clientName`         | text        |
| `clientEmail`      | `clientEmail`        | email       |
| `clientPhone`      | `clientPhone`        | tel         |
| `service`          | `service`            | select      |
| `requestedDate`    | `requestedDate`      | date        |
| `requestedEndDate` | `requestedEndDate`   | date        |
| `message`          | `message`            | textarea    |

The `key` tells the frontend which DTO field to post the value under. Use it to drive the form dynamically rather than hardcoding field order or labels.

---

### 2. `PATCH /api/website/booking-form`

- Authentication required (business JWT + `X-Business-Id` header)
- Called when the business clicks **Save Booking Form** in the dashboard
- Replaces the entire `bookingForm` configuration on the website config document

#### Request body

```ts
{
  title: string;          // required — form heading shown on the public booking page
  description?: string;  // optional — subheading shown below the title
  fields: Array<{
    key: BookingFieldKey; // one of the key values from the table above
    label: string;        // required
    placeholder?: string;
    required: boolean;
  }>;
}
```

#### Response

```ts
{
  success: true,
  statusCode: 200,
  message: "Booking form saved successfully",
  data: null
}
```

Returns `404` if no website config record exists for the business (i.e. the business has not gone through onboarding yet).

---

### 3. Booking submission endpoint (existing, updated)

```
POST /api/requests?businessSlug=<subdomain>
```

No authentication required. This is how the public booking form submits a service request.

`requestedEndDate` was previously silently ignored — it is now stored. The full accepted body:

```ts
{
  clientName: string;          // required
  clientEmail: string;         // required, valid email
  clientPhone?: string;        // optional
  service: string;             // required
  requestedDate: string;       // required — ISO date, today or future
  requestedEndDate?: string;   // optional — ISO date (End Date field)
  message?: string;            // optional free-text
}
```

On `201 Created`, show a success confirmation. On `4xx`, display the `message` field from the response body as a user-facing error.

---

## What the frontend must implement

### 1. Namecheap — wildcard DNS record

In Namecheap Advanced DNS, add a CNAME record:

| Type  | Host | Value                   |
|-------|------|-------------------------|
| CNAME | `*`  | `cname.vercel-dns.com.` |

If `www` or `app` already have their own records those will override the wildcard, which is correct.

### 2. Vercel — add wildcard domain

In your Vercel project → Settings → Domains, add:

```
*.servixos.com
```

Vercel will issue a wildcard TLS certificate automatically. This is what routes `du-logistics.servixos.com` to your Next.js app instead of a 404.

### 3. Next.js middleware — subdomain detection

Create `middleware.ts` at the project root. It reads the `host` header on every request and rewrites business subdomain traffic to an internal `/sites/[subdomain]` path, leaving all other traffic untouched.

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT_DOMAIN = 'servixos.com';
const RESERVED = new Set(['www', 'app']);

export function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') ?? '';

  // Strip port for local dev (e.g. "acme.localhost:3000" → "acme")
  const host = hostname.replace(/:.*$/, '');

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));

    if (subdomain && !RESERVED.has(subdomain)) {
      const url = req.nextUrl.clone();
      url.pathname = `/sites/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### 4. Page structure

Create the following route tree. The middleware rewrites the URL internally so visitors never see `/sites/` in the browser address bar.

```
app/
  sites/
    [subdomain]/
      layout.tsx      ← fetch website config here, provide via context
      page.tsx        ← landing page (hero → services → about → testimonial → contact)
      booking/
        page.tsx      ← booking form driven by bookingForm config
```

#### `layout.tsx` — fetch and cache website data

```tsx
// app/sites/[subdomain]/layout.tsx
import { notFound } from 'next/navigation';

async function getWebsiteData(subdomain: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/website/public/${subdomain}`,
    { next: { revalidate: 300 } }, // ISR — revalidate every 5 minutes
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { subdomain: string };
}) {
  const data = await getWebsiteData(params.subdomain);
  if (!data) notFound();

  return (
    <div
      style={{
        '--color-primary': data.website.colorPrimary,
        '--color-secondary': data.website.colorSecondary,
        fontFamily: data.website.font,
      } as React.CSSProperties}
    >
      {/* Pass data down via a context provider or as props */}
      {children}
    </div>
  );
}
```

#### `page.tsx` — landing page sections

Render the sections in order using `data.website.aiContent`. Every section is optional — guard with `aiContent?.hero`, etc.

Suggested section order:
1. **Hero** — `hero.headline`, `hero.subheadline`, CTA button with text `hero.ctaText` linking to `./booking`
2. **Services** — `aiContent.services[]` cards; fall back to `business.services[]` label list
3. **About** — `about.title` + `about.body`
4. **Testimonial** — `testimonialPlaceholder.quote` + `testimonialPlaceholder.author`
5. **Contact / footer** — `contact.callToAction`, `business.phone`, `business.email`, `business.address`

#### `booking/page.tsx` — booking form

The booking form is **driven by `website.bookingForm`** from the API response. The business configures field labels, placeholders, and which fields are required from their dashboard; the frontend should render whatever the config says rather than hardcoding the form.

The form submits to:

```ts
POST ${process.env.NEXT_PUBLIC_API_URL}/api/requests?businessSlug=${subdomain}
```

**Rendering the form from config:**

```tsx
// Pseudocode — adapt to your form library
const fields = data.website.bookingForm?.fields ?? DEFAULT_FIELDS;

{fields.map((field) => {
  switch (field.key) {
    case 'service':
      return (
        <Select
          key={field.key}
          name={field.key}
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          options={data.business.services}
        />
      );
    case 'requestedDate':
    case 'requestedEndDate':
      return (
        <DatePicker
          key={field.key}
          name={field.key}
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          minDate={new Date()} // must be today or future
        />
      );
    case 'message':
      return <Textarea key={field.key} name={field.key} label={field.label} ... />;
    default:
      return <Input key={field.key} name={field.key} type={inputTypeFor(field.key)} ... />;
  }
})}
```

**`inputTypeFor` mapping:**

| `key`              | HTML input type |
|--------------------|-----------------|
| `clientName`       | `text`          |
| `clientEmail`      | `email`         |
| `clientPhone`      | `tel`           |
| `service`          | `select`        |
| `requestedDate`    | `date`          |
| `requestedEndDate` | `date`          |
| `message`          | `textarea`      |

**Default fallback form** (used when `bookingForm` is absent):

```ts
const DEFAULT_FIELDS = [
  { key: 'clientName',    label: 'Full Name',       placeholder: 'John Doe',           required: true  },
  { key: 'clientEmail',   label: 'Email Address',   placeholder: 'john@example.com',   required: true  },
  { key: 'clientPhone',   label: 'Phone Number',    placeholder: '+1 (555) 000-0000',  required: false },
  { key: 'service',       label: 'Service Required',placeholder: 'Select a service',   required: true  },
  { key: 'requestedDate', label: 'Start Date',      placeholder: 'Select start date',  required: true  },
  { key: 'message',       label: 'Job Details',     placeholder: 'Describe what you need done...', required: false },
];
```

**Submitting:** Post the form values as a JSON body to `POST /api/requests?businessSlug=${subdomain}`. Use each field's `key` as the body property name — they map directly to the DTO fields.

### 5. Local development with subdomains

Vercel and Namecheap don't apply to `localhost`. For local testing, either:

- Add an entry to `/etc/hosts` and update the middleware to also match `*.localhost`:
  ```
  127.0.0.1  acme.localhost
  ```

- Or bypass subdomain routing entirely by visiting the rewrite target directly:
  ```
  http://localhost:3000/sites/acme
  ```

---

## Summary checklist

| Step | Who | Done? |
|------|-----|-------|
| `GET /api/website/public/:subdomain` — returns landing page + booking form config | Backend ✅ | Done |
| `PATCH /api/website/booking-form` — saves booking form config from dashboard | Backend ✅ | Done |
| `POST /api/requests?businessSlug=` — accepts `requestedEndDate` | Backend ✅ | Done |
| Wildcard CNAME `*.servixos.com` in Namecheap | DNS | ☐ |
| Wildcard domain `*.servixos.com` in Vercel | Vercel | ☐ |
| `middleware.ts` subdomain detection + rewrite | Frontend | ☐ |
| `app/sites/[subdomain]/layout.tsx` — fetch & 404 guard | Frontend | ☐ |
| `app/sites/[subdomain]/page.tsx` — landing page from `aiContent` | Frontend | ☐ |
| `app/sites/[subdomain]/booking/page.tsx` — dynamic form from `bookingForm` config | Frontend | ☐ |
