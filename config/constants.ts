// Content-addressed (CID-based) responses are immutable, so any CDN can cache them indefinitely.
export const CACHE_CONTROL_HEADERS = 'public, max-age=31536000, immutable'
