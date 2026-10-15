/**
 * HTML-escape a user-supplied plain string for safe interpolation into a
 * `parse_mode: 'HTML'` message — both element content and attribute values.
 *
 * Covers the standard five characters (`&`, `<`, `>`, `"`, `'`) so the same
 * helper is safe for `<b>${escape(x)}</b>` and `<a href="${escape(x)}">`.
 */
export const htmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
