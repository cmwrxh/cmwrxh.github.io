export function readBearerToken(header) {
  return String(header || '').replace(/^Bearer\s+/i, '').trim();
}
