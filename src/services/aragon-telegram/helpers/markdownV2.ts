/**
 * Telegram MarkdownV2 helpers. Reserved characters per Bot API spec:
 * `_ * [ ] ( ) ~ ` > # + - = | { } . !`
 */
const MD_V2_ESCAPE_RE = /[_*[\]()~`>#+\-=|{}.!\\]/g

export class MarkdownV2 {
  static escape(input: string | null | undefined): string {
    if (!input) return ''
    return input.replace(MD_V2_ESCAPE_RE, '\\$&')
  }

  static truncate(input: string, max: number): string {
    if (input.length <= max) return input
    return `${input.slice(0, Math.max(0, max - 1))}…`
  }
}
