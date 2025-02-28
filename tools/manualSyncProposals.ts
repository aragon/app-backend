import { EnumConnection, IPluginInterfaceType, type IService, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { ProposalHandler } from '@handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'Tools: ManualSyncProposals' })

export const ManualSyncProposals: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const data: any = []
    let countWrongData = 0
    const dbCrawler = new DBCrawler({
      model: Models.Plugin,
      onDocument: async (doc: Plugin) => {
        // doc.build == 4 - 5 -> findIncrementalId
        // doc.build < 4 getProposalCount

        let onChainCount: number = 0
        if (Number(doc.build) < 4) {
          const count = await Web3Helper.getProposalCount(doc.address, doc.network)
          onChainCount = Number(count)
        } else {
          onChainCount = await ProposalHandler.findIncrementalId({
            pluginAddress: doc.address,
            network: doc.network,
            proposalIndex: '8912371293810298312908309182309123128038120312093',
          })
        }

        const onDbCount = await Models.Proposal.countDocuments({ pluginAddress: doc.address, network: doc.network })

        const isSame = onChainCount === onDbCount

        if (!isSame) {
          countWrongData++

          data.push({
            pluginAddress: doc.address,
            network: doc.network,
            onChainCount: onChainCount.toString(),
            onDbCount: onDbCount.toString(),
          })

          logger.verbose(
            'Fucked sync',
            llo({
              pluginAddress: doc.address,
              network: doc.network,
              onChainCount,
              onDbCount,
            }),
          )
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error ManualSyncProposals', { document, error })
      },
      where: {
        network: { $in: [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet] },
        interfaceType: { $in: [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.multisig] },
      },
      batchSize: 1000,
      concurrency: 500,
    })

    await dbCrawler.crawl()

    logger.info('Total wrong data', llo({ countWrongData, data }))

    logger.info('END', llo())
  },

  stop: async () => {},
}

export default ManualSyncProposals
