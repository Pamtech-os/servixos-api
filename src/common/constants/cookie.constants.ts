/** Cookie names for all three portals. */
export const COOKIE_NAMES = {
  // Business portal
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  // Client portal
  CLIENT_ACCESS_TOKEN: 'c_access_token',
  CLIENT_REFRESH_TOKEN: 'c_refresh_token',
  // Admin portal
  ADMIN_ACCESS_TOKEN: 'a_access_token',
  ADMIN_REFRESH_TOKEN: 'a_refresh_token',
} as const;

/** 15 minutes — should match JWT_EXPIRES_IN. */
export const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;

/** 7 days — matches REFRESH_TOKEN_TTL_DAYS in business/client auth services. */
export const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** 30 days — matches REFRESH_TOKEN_TTL_DAYS in admin auth service. */
export const ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
