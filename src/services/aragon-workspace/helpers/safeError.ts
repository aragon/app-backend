import { redactUrlKeys } from '@src/logger/redact'

/** Longer than this is an ethers dump, not something a client can act on. */
const MAX_LENGTH = 200

/**
 * Anything with a scheme, plus bare provider hosts. Stored errors are served
 * over the API, so no infrastructure URL should survive in one — not just the
 * key-bearing ones redactUrlKeys knows about.
 */
const URL_PATTERN = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi

/**
 * An error message safe to persist and hand back to a client.
 *
 * ethers embeds the full request URL in SERVER_ERROR messages
 * (`info={"requestUrl":"https://…/v2/<key>"}`), and scan errors are stored on
 * the workspace and returned by GET — so the raw message would durably publish
 * live RPC keys. The full error still goes to logger.error at the call site.
 */
export const safeErrorMessage = (error: any): string => {
  const raw = typeof error?.message === 'string' && error.message ? error.message : String(error ?? 'unknown error')

  // Key patterns first: they keep the host visible, which is worth having on
  // the few messages that survive the URL strip below intact.
  const stripped = redactUrlKeys(raw).replace(URL_PATTERN, '[url]')

  return stripped.length > MAX_LENGTH ? `${stripped.slice(0, MAX_LENGTH)}…` : stripped
}
