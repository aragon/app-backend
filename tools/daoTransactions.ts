import { Models } from '@dbModels'
import etherscan from '@helpers/etherscan'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import DBCrawler from '@models/utils/crawler'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { EnumConnection } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: ToolDaoTransactions' })

export const DaoTransaction = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const count = await Models.Dao.countDocuments({})
    logger.verbose('DaoTransaction tool started', llo({ count }))

    const dbCrawler = new DBCrawler({
      model: Models.Dao,
      limit: 1000,
      concurrency: 10,
      where: {},
      select: 'address network',
      onError: (error: any) => logger.error('error', llo({ error })),
      onDocument: async (dao: Dao) => {
        const dbTxs = await Models.Transaction.find({ daoAddress: dao.address })
        const [normalTxs, internalTxs, erc20Txs, erc721Txs] = await Promise.all([
          etherscan.fetchNormalTransactions({
            contractAddress: dao.address,
            startBlock: dao.blockNumber,
            network: dao.network,
          }),
          etherscan.fetchInternalTransactions({
            contractAddress: dao.address,
            startBlock: dao.blockNumber,
            network: dao.network,
          }),
          etherscan.fetchErc20Transactions({
            contractAddress: dao.address,
            startBlock: dao.blockNumber,
            network: dao.network,
          }),
          etherscan.fetchErc721Transactions({
            contractAddress: dao.address,
            startBlock: dao.blockNumber,
            network: dao.network,
          }),
        ])

        const totalCount = normalTxs.length + erc20Txs.length + internalTxs.length + erc721Txs.length
        if (dbTxs.length === totalCount) {
          return true
        }

        logger.verbose('DaoTransaction tool resync', llo({ address: dao.address, network: dao.network }))
        await DaoTransactions.start({
          daoAddress: dao.address,
          network: dao.network,
          reset: true,
        })
      },
    })

    await dbCrawler.crawl()
    logger.info('End DaoTransaction', llo())
  },

  stop: async () => {},
}

export default DaoTransaction
