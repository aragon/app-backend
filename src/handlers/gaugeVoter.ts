import logger from '@logger'
import type { ILogInfo } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:handlers:GaugeHandler' })

export const GaugeHandler = {
  voted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    console.log('GaugeHandler.voted', parsedEvent, info)
  },

  reset: async (parsedEvent: LogDescription, info: ILogInfo) => {
    console.log('GaugeHandler.reset', parsedEvent, info)
  },
}
