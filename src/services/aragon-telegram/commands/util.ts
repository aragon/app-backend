import { type FormattedString } from '@grammyjs/parse-mode'
import logger from '@logger'
import { type Context } from 'grammy'
import { createHash } from 'node:crypto'

/** Pre-bind a `service:` tag onto every log line in this command module. */
export const lloFor = (service: string) => logger.logMeta.bind(null, { service })

/** Reply with a parse-mode `FormattedString` — sends `text` + `entities`. */
export const replyFmt = (ctx: Context, fs: FormattedString, opts: Record<string, any> = {}): Promise<unknown> =>
  ctx.reply(fs.text, { ...opts, entities: fs.entities })

/**
 * Short, stable hash of a Telegram user id for log correlation without
 * writing the raw identifier to Logz.io / Sentry / disk.
 */
export const userHash = (id: number | string): string =>
  createHash('sha256').update(String(id)).digest('hex').slice(0, 8)
