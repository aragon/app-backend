import config from '@config'
import logger from '@logger'
import { TelegramBotApp } from '@services/aragon-telegram/bot'
import { NotificationDispatcher } from '@services/aragon-telegram/helpers/dispatcher'
import { EndingSoonNotifier } from '@services/aragon-telegram/helpers/endingSoonNotifier'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { TaskSchedulerState } from '@state/taskSchedulerState'
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

    const renderer = new NotificationRenderer()
    const dispatcher = new NotificationDispatcher(app.getApi(), renderer)
    await dispatcher.start()

    app.start()

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('telegramEndingSoon', {
      fn: () => [[{ endingSoon: EndingSoonNotifier }]],
      interval: config.SERVICES.ARAGON_TELEGRAM.ENDING_SOON_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        logger.error('TelegramService endingSoon task error', llo({ error }))
      },
    })

    logger.info('TelegramService started', llo({}))
  },

  async stop() {
    TaskSchedulerState.getInstance().stopTask('telegramEndingSoon')
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
