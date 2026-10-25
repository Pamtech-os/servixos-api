export const CHANNEL_MESSAGES = {
  ERROR: {
    // Intentionally generic — do not reveal the header name, accepted values,
    // or token transport mechanism to unauthenticated callers
    MISSING: 'Invalid or malformed request',
    INVALID: 'Invalid or malformed request',
    WEB_REQUIRES_COOKIE: 'Authentication token is missing',
    MOBILE_REQUIRES_BODY: 'Authentication token is missing',
    WEB_REQUIRES_ACCESS_COOKIE: 'Authentication token is missing',
  },
};
