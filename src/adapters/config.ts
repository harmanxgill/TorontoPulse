/**
 * API base URLs.
 *
 * In development, requests to /toronto-api/* are proxied through Vite to
 * ckan0.cf.opendata.inter.prod-toronto.ca, which has no CORS headers.
 * In production, a server-side proxy (e.g. Vercel rewrites) must handle this.
 */
// Always use the local proxy path — Vite handles it in dev, vercel.json in prod.
export const TORONTO_BASE = '/toronto-api';
