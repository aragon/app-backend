import {
  EnumConnection,
  IExitQueueLogs,
  type IIndexerConfig,
  type IService,
  IVotingEscrowIncreasingLogs,
  NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import configIndexer from '@indexer/configIndexer'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'Tools: ToolsEnsFetch' })

export interface IExtendedService extends IService {
  processError: (error: any, plugin: Plugin, log: any) => Promise<any>
}

export const ToolsVeGovernance: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const plugin = await Models.Plugin.findByAddress(
      '0x9A464D12ce59a572ef68573Fa8e6236187fD784B',
      NetworksEnum.ethereumSepolia,
    )

    const infoLogs = {
      network: plugin.network,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      tokenAddress: plugin.tokenAddress,
    }

    const configExitQueueLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IExitQueueLogs).includes(item.event as any),
    )
    const configEscrowILogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IVotingEscrowIncreasingLogs).includes(item.event as any),
    )

    const escrowCrawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configEscrowILogs],
      address: [plugin.votingEscrow?.escrowAddress],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => ToolsVeGovernance.processError(error, plugin, log),
      logService:
        `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${plugin.votingEscrow?.escrowAddress}` as any,
      stopOnError: true,
    })

    const exitQueueCrawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configExitQueueLogs],
      address: [plugin.votingEscrow?.exitQueueAddress],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => ToolsVeGovernance.processError(error, plugin, log),
      logService:
        `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${plugin.votingEscrow?.exitQueueAddress}` as any,
      stopOnError: true,
    })

    await Promise.all([escrowCrawler.crawl(), exitQueueCrawler.crawl()])

    logger.info('End ToolsVeGovernance', llo(infoLogs))
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error ToolsVeGovernance',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },

  stop: async () => {},
}

export default ToolsVeGovernance
