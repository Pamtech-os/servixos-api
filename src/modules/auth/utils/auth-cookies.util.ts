import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  COOKIE_NAMES,
  REFRESH_TOKEN_COOKIE_MAX_AGE,
} from 'src/common/constants/cookie.constants';

export function setAccessTokenCookie(
  res: Response,
  token: string,
  secure: boolean,
): void {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
    path: '/',
  });
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): void {
  setAccessTokenCookie(res, accessToken, secure);
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    path: '/',
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, base);
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, base);
}
