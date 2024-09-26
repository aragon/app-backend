import logger from '@logger'
import { type TransactionResponse } from 'ethers'
import { EnumQueueName, type HexAddress, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { RabbitMQHelper } from '@helpers/redditMQ'
import type Dao from '@models/schema/dao'
import utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-transactions:BlockHandler' })

export const BlockHandler = {
  processNewBlock: async (block: any, network: NetworksEnum) => {
    if (!block?.transactions.length) return

    const provider = ProviderModule.getProvider(network)
    if (!provider) return logger.error('Provider not available for network', llo({ network }))

    await Promise.all(
      block.transactions.map(async (txHash: HexAddress) => {
        const tx = await BlockHandler.fetchTransactionWithRetry(txHash, network, provider)
        if (!tx?.to) return null

        const dao = await Models.Dao.findByAddress(tx.to, network)
        if (dao) {
          // add some delay because the alchemy nodes may not be up-to date
          await utils.wait(config.SERVICES.ARAGON_TRANSACTIONS.CONFIRMATION_DELAY)
          await BlockHandler.sendDaoMessages(dao)

          logger.verbose(
            'New Block incoming transaction found',
            llo({
              network,
              daoAddress: dao,
              transactionHas: tx.hash,
            }),
          )
        }
      }),
    )
  },

  sendDaoMessages: async (dao: Dao) => {
    try {
      await Promise.all([
        RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
          id: dao.address,
          params: { address: dao.address, network: dao.network },
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
          id: dao.address,
          params: { address: dao.address, network: dao.network },
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: dao.address,
          params: { address: dao.address, network: dao.network },
        }),
      ])
      logger.info(`RabbitMQ messages sent for DAO: ${dao.address}`, llo({ dao }))
    } catch (error) {
      logger.error('Failed to send RabbitMQ messages', llo({ daoAddress: dao.address, error }))
    }
  },

  fetchTransactionWithRetry: async (
    txHash: string,
    network: NetworksEnum,
    provider: any,
  ): Promise<TransactionResponse | null> => {
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(() => provider.getTransaction(txHash)),
      )
    } catch (error) {
      logger.warn('Failed to fetch transaction', llo({ txHash, error, network }))
      return null
    }
  },
}
