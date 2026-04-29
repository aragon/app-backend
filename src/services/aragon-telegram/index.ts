import config from '@config'
import logger from '@logger'
import { TelegramBotApp } from '@services/aragon-telegram/bot'
import { NotificationDispatcher } from '@services/aragon-telegram/helpers/dispatcher'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { EnumConnection, EnumServiceName, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:TelegramService' })

let app: TelegramBotApp | null = null

const AragonTelegramService: IService = {
  name: EnumServiceName.ARAGON_TELEGRAM,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    logger.info('TelegramService starting', llo({}))

    const token = config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN
    if (!token) throw new Error('SERVICES_ARAGON_TELEGRAM_BOT_TOKEN is required')
    app = new TelegramBotApp(token)
    await app.registerMenu()

    const renderer = new NotificationRenderer(app.getServices().descriptionCache)
    const dispatcher = new NotificationDispatcher(app.getApi(), renderer)
    await dispatcher.start()

    // The grammy runner drives the getUpdates loop in the background.
    app.start()

    logger.info('TelegramService started', llo({}))
  },

  async stop() {
    if (app) {
      try {
        await app.stop()
      } catch (err) {
        logger.error('TelegramService bot.stop failed', llo({ err }))
      }
      app = null
    }
    logger.info('TelegramService stopped', llo({}))
  },
}

export default AragonTelegramService
