import { createHmac } from 'crypto';
import request from 'supertest';

type QueryValue = string | number | boolean | null | undefined;

function serializeQuery(qs: Record<string, unknown> | undefined): string {
  if (!qs) return '';

  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(qs)) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item != null) params.append(key, String(item as QueryValue));
      }
      continue;
    }
    params.append(key, String(raw as QueryValue));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function canonicalPath(
  url: string,
  qs: Record<string, unknown> | undefined,
): string {
  const query = serializeQuery(qs);
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search || query}`;
  }
  return `${url}${query}`;
}

/**
 * Computes HMAC-SHA256 signature headers for a supertest request.
 *
 * The canonical string is: METHOD\nPATH\nTIMESTAMP\nBODY
 * where BODY is JSON.stringify(requestBody) or '' for bodyless requests.
 *
 * Call this AFTER chaining .send() so that _data is already set on the request.
 */
export function signRequest(
  r: request.Test,
  clientToken: string,
): request.Test {
  // supertest exposes method/url/qs/_data as runtime internals not in its TS types
  const internal = r as unknown as {
    method: string;
    url: string;
    qs?: Record<string, unknown>;
    _data: unknown;
  };
  const method = internal.method;
  const path = canonicalPath(internal.url, internal.qs);
  const data = internal._data;

  const timestamp = Date.now().toString();
  const bodyStr =
    data != null &&
    (typeof data !== 'object' ||
      data instanceof Buffer ||
      Object.keys(data).length > 0)
      ? JSON.stringify(data)
      : '';
  const canonical = [method.toUpperCase(), path, timestamp, bodyStr].join('\n');
  const signature = createHmac('sha256', clientToken)
    .update(canonical)
    .digest('hex');

  return r
    .set('x-client-token', clientToken)
    .set('x-timestamp', timestamp)
    .set('x-signature', signature)
    .set('x-channel', 'mobile');
}
