import config from '@config'
import logger from '@logger'
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'telegram-module' })

const TelegramModule = {
  isConfigured(): boolean {
    return !!(config.TELEGRAM.BOT_TOKEN && config.TELEGRAM.FRAUD_CHAT_ID)
  },

  /**
   * Throws on failure so callers can retry rather than lose the message. The thrown error
   * is always rebuilt from scratch: the bot token sits in the request URL, and an axios
   * error carries that URL in its config, so letting one escape would log the token.
   */
  async sendMessage(text: string, chatId: string = config.TELEGRAM.FRAUD_CHAT_ID): Promise<void> {
    let response: { data?: { ok?: boolean; description?: string } }
    try {
      response = await axios.post(
        `https://api.telegram.org/bot${config.TELEGRAM.BOT_TOKEN}/sendMessage`,
        { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
        { timeout: 15000 },
      )
    } catch (error: any) {
      const status = error?.response?.status
      const description = error?.response?.data?.description
      throw new Error(
        `Telegram request failed${status ? ` with status ${status}` : ''}: ${description ?? 'no response'}`,
      )
    }

    if (!response.data?.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.data?.description ?? 'unknown error'}`)
    }

    logger.verbose('Telegram message sent', llo({ chatId }))
  },
}

export default TelegramModule
