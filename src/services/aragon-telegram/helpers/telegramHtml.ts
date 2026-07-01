import sanitizeHtml from 'sanitize-html'

/**
 * Telegram HTML helpers.
 *
 * Telegram's HTML parse mode supports a fixed allowlist of inline tags (per
 * https://core.telegram.org/bots/api#html-style). Any other tag — `<p>`,
 * `<br>`, `<ul>`, `<li>`, `<div>`, `<h1>`, classes, data-attrs — causes a
 * `400 Bad Request: can't parse entities` and the message fails to send.
 *
 * Aragon proposal descriptions arrive as rich-editor HTML that includes
 * those unsupported tags, so we have to convert/strip before sending.
 */

/**
 * HTML-escape a user-supplied plain string for safe interpolation into a
 * `parse_mode: 'HTML'` message — both element content and attribute values.
 *
 * Covers the standard five characters (`&`, `<`, `>`, `"`, `'`) so the same
 * helper is safe for `<b>${escape(x)}</b>` and `<a href="${escape(x)}">`.
 */
export const htmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Convert rich-editor HTML to a Telegram-safe HTML subset.
 *
 * Two-step pipeline:
 *
 * 1. **Pre-process block-level tags into text**, since Telegram has no
 *    `<p>`/`<br>`/`<ul>`/`<li>`/`<h*>` and would 400 if we left them. They
 *    become newlines and bullets — a transformation choice rather than
 *    sanitization, which is why this step lives here and not in the lib.
 *
 * 2. **Hand off to `sanitize-html`** for tag/attribute allowlisting. It
 *    strips unsupported tags (keeping their text), drops disallowed
 *    attributes, properly escapes attribute values, and rejects unsafe
 *    URL schemes (`javascript:`, `data:`).
 */
export const sanitizeDescriptionHtml = (html: string): string => {
  // Step 1 — block-level tags Telegram has no concept of.
  // `\b` is critical so `<pre>` isn't swallowed by the `<p[^>]*>` matcher.
  const flattened = html
    .replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/li>\s*<li\b[^>]*>/gi, '\n• ')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<h[1-6]\b[^>]*>/gi, '<b>')
    .replace(/<\/h[1-6]>/gi, '</b>\n')

  // Step 2 — allowlist Telegram's supported inline tags; everything else stripped.
  const cleaned = sanitizeHtml(flattened, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'blockquote', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Default disallowedTagsMode is 'discard' — strip the tag, keep its text.
  })

  return (
    cleaned
      // sanitize-html decodes `&nbsp;` to a literal non-breaking space (U+00A0).
      // Convert to a normal space so spacing renders consistently.
      .replace(/ /g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
