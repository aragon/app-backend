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

/** Tag names Telegram's HTML parser accepts (inline only — no <p>, <br>, <ul>, etc.). */
const SUPPORTED_INLINE = 'b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote'

/** HTML-escape a user-supplied string for safe interpolation into a parse_mode='HTML' message. */
export const htmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Convert rich-editor HTML to a Telegram-safe HTML subset.
 *
 * Transformation rules:
 * - `<p>...</p>` → blank line
 * - `<br>` → newline
 * - `<li>...</li>` → `• ...` on its own line
 * - `<ul>`, `<ol>` → newline boundary (wrapper dropped)
 * - `<h1>`–`<h6>` → `<b>...</b>` + newline
 * - Inline tags Telegram accepts (`<b> <strong> <i> <em> <u> <ins> <s>
 *   <strike> <del> <code> <pre> <blockquote>`): kept, attributes stripped
 * - `<a href="...">`: kept with `href` only (escaped)
 * - Everything else (`<div>`, `<span>` without `tg-spoiler` class, `<table>`,
 *   `<img>`, …): stripped
 * - `&nbsp;` decoded; other entities left alone
 */
export const sanitizeDescriptionHtml = (html: string): string => {
  return (
    html
      // Paragraph and break tags become newlines. `\b` is critical so that
      // `<pre>` doesn't get swallowed by the `<p[^>]*>` matcher.
      .replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n')
      .replace(/<p\b[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\b[^>]*\/?>/gi, '\n')
      // Lists become bullets on their own lines.
      .replace(/<\/li>\s*<li\b[^>]*>/gi, '\n• ')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '')
      .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
      // Headings → bold + newline.
      .replace(/<h[1-6]\b[^>]*>/gi, '<b>')
      .replace(/<\/h[1-6]>/gi, '</b>\n')
      // Normalize supported inline tags: drop class/style/data-* attributes.
      .replace(new RegExp(`<(${SUPPORTED_INLINE})\\b[^>]*>`, 'gi'), (_m, tag) => `<${tag.toLowerCase()}>`)
      .replace(new RegExp(`</(${SUPPORTED_INLINE})\\b[^>]*>`, 'gi'), (_m, tag) => `</${tag.toLowerCase()}>`)
      // <a href=""> — keep the href only (escaped).
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (_m, href) => `<a href="${htmlEscape(href)}">`)
      .replace(/<\/a>/gi, '</a>')
      // Strip every tag that isn't in the supported allowlist.
      .replace(new RegExp(`</?(?!(?:${SUPPORTED_INLINE}|a)\\b)[a-zA-Z][^>]*>`, 'gi'), '')
      // Decode the HTML entity Aragon descriptions often include.
      .replace(/&nbsp;/g, ' ')
      // Collapse excessive blank lines from the paragraph conversion.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
