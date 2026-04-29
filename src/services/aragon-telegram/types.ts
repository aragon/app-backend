import { type ParseModeFlavor } from '@grammyjs/parse-mode'
import { type DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { type Context } from 'grammy'

export interface ITelegramServices {
  descriptionCache: DescriptionCache
}

export type BotContext = ParseModeFlavor<Context> & {
  services: ITelegramServices
}
