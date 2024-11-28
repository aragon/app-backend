import logger from '@logger'
import { type TransactionResponse } from 'ethers'
import { EnumQueueName, type HexAddress, type IWebSocketProvider, type NetworksEnum } from '@types'
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
        const tx = await BlockHandler.fetchTransaction(txHash, network, provider)
        if (!tx?.to) return null

        const dao = await Models.Dao.findByAddress(tx.to, network)

        if (dao) {
          logger.verbose(
            'New pending incoming transaction',
            llo({
              network,
              daoAddress: dao,
              transactionHas: tx.hash,
            }),
          )

          // wait 2 block confirmations
          await utils.wait(config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME * 1000 * 2)
          await BlockHandler.sendDaoMessages(dao)

          logger.verbose(
            'New confirmed incoming transaction',
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

  fetchTransaction: async (
    txHash: string,
    network: NetworksEnum,
    provider: IWebSocketProvider,
  ): Promise<TransactionResponse | null> => {
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => provider.getTransaction(txHash)),
      )
    } catch (error) {
      logger.warn('Failed to fetch transaction', llo({ txHash, error, network }))
      return null
    }
  },
}
