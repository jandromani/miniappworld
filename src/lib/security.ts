import { NextRequest } from 'next/server';

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
