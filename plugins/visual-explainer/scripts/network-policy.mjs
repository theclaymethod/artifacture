const PASS_THROUGH_PROTOCOLS = new Set(['file:', 'data:', 'blob:']);
const FONT_ORIGINS = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]);
const MERMAID_ORIGIN = 'https://cdn.jsdelivr.net';
const MERMAID_PATH_PREFIX = '/npm/mermaid@';

function parsedOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

export function isAllowedBrowserRequest(rawUrl, { additionalOrigins = [] } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (PASS_THROUGH_PROTOCOLS.has(url.protocol)) return true;
  if (FONT_ORIGINS.has(url.origin)) return true;
  if (url.origin === MERMAID_ORIGIN && url.pathname.startsWith(MERMAID_PATH_PREFIX)) return true;

  return additionalOrigins.some((origin) => parsedOrigin(origin) === url.origin);
}
