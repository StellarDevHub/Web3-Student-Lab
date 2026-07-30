import { CookieOptions, Request, Response } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export const getCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
};

export const setRefreshTokenCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, getCookieOptions());
};

export const clearRefreshTokenCookie = (res: Response): void => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  });
};

export const getRefreshTokenFromReq = (req: Request): string | undefined => {
  if (req.cookies && req.cookies[REFRESH_TOKEN_COOKIE_NAME]) {
    return req.cookies[REFRESH_TOKEN_COOKIE_NAME];
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, item) => {
      const parts = item.trim().split('=');
      const key = parts[0];
      const val = parts.slice(1).join('=');
      if (key) acc[key] = decodeURIComponent(val);
      return acc;
    }, {});
    if (cookies[REFRESH_TOKEN_COOKIE_NAME]) {
      return cookies[REFRESH_TOKEN_COOKIE_NAME];
    }
  }
  if (req.body && req.body.refreshToken) {
    return req.body.refreshToken;
  }
  return undefined;
};
