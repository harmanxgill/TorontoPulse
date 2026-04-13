/**
 * API base URLs.
 *
 * In development, requests to /toronto-api/* are proxied through Vite to
 * ckan0.cf.opendata.inter.prod-toronto.ca, which has no CORS headers.
 * In production, a server-side proxy (e.g. Vercel rewrites) must handle this.
 */
export const TORONTO_BASE =
  import.meta.env.DEV
    ? '/toronto-api'
    : 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
