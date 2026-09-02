import { GrammyError } from 'grammy'

export interface ITelegramErrorMeta {
  name: string
  description: string
  errorCode?: number
  method?: string
}

/**
 * A `GrammyError` carries the request payload it failed on, and for a DM that
 * payload holds the raw `chat_id`. Logging the error object whole would ship a
 * Telegram user identifier to the external log pipeline, so every telegram log
 * line goes through here and keeps only what describes the failure.
 */
export const telegramErrorMeta = (err: unknown): ITelegramErrorMeta => {
  if (err instanceof GrammyError) {
    return { name: err.name, description: err.description, errorCode: err.error_code, method: err.method }
  }
  if (err instanceof Error) {
    return { name: err.name, description: err.message }
  }
  return { name: 'UnknownError', description: String(err) }
}
