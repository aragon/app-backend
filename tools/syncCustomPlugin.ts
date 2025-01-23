import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import { LogGauge } from '@plugins/logGauge'

const llo = logger.logMeta.bind(null, { service: 'Tools: ToolsCustomPlugin' })

export const ToolsCustomPlugin: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const plugin = await Models.Plugin.findOne({ address: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E' })
    const token = await Models.Token.findOne({ address: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E' })
    await LogGauge.start(plugin, token, true)

    logger.info('END', llo())
  },

  stop: async () => {},
}

export default ToolsCustomPlugin
