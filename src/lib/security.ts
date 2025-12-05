import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

function getAllowedHosts(req: NextRequest) {
  const envHosts = process.env.ALLOWED_HOSTS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const requestHost = req.nextUrl?.host;

  return new Set([requestHost, ...envHosts].filter(Boolean));
}

function originMatches(origin: string, allowedHosts: Set<string>) {
  try {
    const { host } = new URL(origin);
    return allowedHosts.has(host);
  } catch (error) {
    return false;
  }
}

export function validateSameOrigin(req: NextRequest) {
  const allowedHosts = getAllowedHosts(req);
  const hostHeader = req.headers.get('host');
  const originHeader = req.headers.get('origin');

  const hostIsAllowed = hostHeader ? allowedHosts.has(hostHeader) : false;
  const originIsAllowed = originHeader ? originMatches(originHeader, allowedHosts) : true;

  if (!hostIsAllowed || !originIsAllowed) {
    return { valid: false, reason: 'invalid_origin_or_host' as const };
  }

  return { valid: true as const };
}

export function generateCsrfToken() {
  return randomBytes(32).toString('hex');
}

export function setCsrfCookie(response: NextResponse, token: string) {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function validateCsrf(req: NextRequest) {
  const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value;
  const csrfHeader = req.headers.get(CSRF_HEADER);

  if (!csrfCookie || !csrfHeader) {
    return { valid: false as const, reason: 'missing_csrf_token' as const };
  }

  if (csrfCookie !== csrfHeader) {
    return { valid: false as const, reason: 'csrf_token_mismatch' as const };
  }

  return { valid: true as const, token: csrfCookie };
}

export const CSRF_HEADER_NAME = CSRF_HEADER;
export const CSRF_COOKIE_NAME = CSRF_COOKIE;
