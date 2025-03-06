import { EnumConnection, type IService, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import logger from '@logger'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import DbOperations from '@models/utils/dbOperations'
const llo = logger.logMeta.bind(null, { service: 'tools:fix-arb-proposal' })
export const FixPastSupplyInArb: IService | any = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  async start() {
    const network = NetworksEnum.arbitrumMainnet
    const dbCrawler = new DBCrawler({
      model: Models.Proposal,
      onDocument: FixPastSupplyInArb.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error FetchRates', llo({ error, document }))
      },
      where: {
        network,
        pluginSubdomain: 'token-voting',
        'snapshot.totalSupply': '0',
      },

      batchSize: 500,
      concurrency: 50,
    })

    await dbCrawler.crawl()

    logger.info('FixPastSupplyInArb Done', llo())
  },
  async onDocument(document: any) {
    const pastSupply = await GovernanceErc20Helper.getPastTotalSupply(
      document?.blockNumber,
      document.settings.tokenAddress,
      document.network,
    )

    await DbOperations.updateDocument(
      document,
      { snapshot: { totalSupply: pastSupply } },
      { network: document.network, pluginSubdomain: document.pluginSubdomain, proposalIndex: document.proposalIndex },
      'Fix Past Supply',
      llo,
    )
  },
  async stop() {},
}
