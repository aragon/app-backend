// Content-addressed (CID-based) responses are immutable, so any CDN can cache them indefinitely.
export const CACHE_CONTROL_HEADERS = 'public, max-age=31536000, immutable'

/**
 * Safe body reads. Short and revalidatable: a shared CDN may collapse concurrent viewers of one Safe
 * onto one origin hit, but the queue drives the primary signing CTA so it must not be held.
 * `must-revalidate` stops a caller serving past `s-maxage` on its own initiative - freshness beyond
 * that is the origin's call, and it is marked in `meta.stale`.
 */
export const SAFE_CACHE_CONTROL_HEADERS = 'public, max-age=0, s-maxage=10, must-revalidate'

/**
 * Executed transactions are immutable, so the only thing that can change a history page is a newer
 * execution landing above it. `s-maxage` tracks `SAFE_API_HISTORY_CACHE_TTL` rather than reusing the
 * queue's 10 s, which would make every edge revalidate 60x more often than the data can change.
 */
export const SAFE_HISTORY_CACHE_CONTROL_HEADERS = 'public, max-age=0, s-maxage=600, must-revalidate'

/** Never cached anywhere: the nonce is bound into a signature that cannot be changed afterwards. */
export const SAFE_NO_CACHE_CONTROL_HEADERS = 'no-store'
