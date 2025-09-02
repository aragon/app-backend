import { Models } from '@dbModels'
import logger from '@logger'
import { EnumConnection, NetworksEnum } from '@src/types'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

const llo = logger.logMeta.bind(null, { service: 'Tools: FixBrokenTx' })

export const ToolsFixBrokenTx = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Start fixBrokenTx', llo())
    const networks = [
      NetworksEnum.ethereumMainnet,
      NetworksEnum.ethereumSepolia,
      NetworksEnum.polygonMainnet,
      NetworksEnum.baseMainnet,
      NetworksEnum.arbitrumMainnet,
      NetworksEnum.zksyncMainnet,
      NetworksEnum.zksyncSepolia,
      NetworksEnum.optimismMainnet,
    ]

    for (const network of networks) {
      logger.info('Start fixBrokenTx for network', llo({ network }))

      let counter = 0

      const daos = await Models.Transaction.aggregate([
        {
          $match: {
            network,
            daoAddress: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              network: '$network',
              daoAddress: '$daoAddress',
            },
          },
        },
        {
          $project: {
            network: '$_id.network',
            daoAddress: '$_id.daoAddress',
          },
        },
      ])

      logger.info('Found DAOs with broken transactions', llo({ daosCount: daos.length, network }))

      for (const dao of daos) {
        const daoDb = await Models.Dao.findOne({
          address: dao.daoAddress,
          network: dao.network,
        })

        await ToolsFixBrokenTx.onDocument(daoDb)

        counter = counter + 1
        logger.info(
          'Processed DAO',
          llo({
            daoAddress: dao.daoAddress,
            network: dao.network,
            remaining: daos.length - counter,
          }),
        )
      }
    }
  },
  onDocument: async (dao: any) => {
    const daoAddress = dao.address
    const network = dao.network as NetworksEnum

    logger.info('Fixing transactions for DAO', llo({ daoAddress, network }))

    const transactionsCount = await Models.Transaction.countDocuments({
      daoAddress,
      network,
    })

    if (transactionsCount === 0) {
      logger.info('No transactions found for DAO', llo({ daoAddress, network }))
      return
    }

    await Models.ConfigIndexer.deleteOne({
      service: `withdraw-${daoAddress}-withdrawTxs`,
      network,
    })

    await Models.ConfigIndexer.deleteOne({
      service: `deposit-${daoAddress}-depositTxs`,
      network,
    })

    const daoTxs = await Models.Transaction.find({
      daoAddress,
      network,
    })

    logger.info('Cleaning up existing transactions', llo({ daoAddress, totalTxns: daoTxs.length, network }))

    await Models.Transaction.deleteMany({
      daoAddress,
      network,
    })

    await DaoTransactions.start({
      daoAddress,
      network,
    })

    logger.info('Finished fixing transactions for DAO', llo({ daoAddress, network }))
  },

  stop: async () => {
    logger.info('End fixBrokenTx', llo())
  },
}
