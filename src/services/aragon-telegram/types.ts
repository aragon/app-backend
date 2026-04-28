import { type Context } from 'grammy'
import { type DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'

export interface ITelegramServices {
  descriptionCache: DescriptionCache
}

export type BotContext = Context & {
  services: ITelegramServices
}
