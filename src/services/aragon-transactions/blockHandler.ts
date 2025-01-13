import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { EnumQueueName, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { RabbitMQHelper } from '@helpers/redditMQ'
import type Dao from '@models/schema/dao'
import utils from '@helpers/utils'
import config from '@config'
import { DAO } from '@artifacts/dao'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-transactions:BlockHandler' })

export const BlockHandler = {
  processNewBlock: async (block: any, network: NetworksEnum) => {
    if (!block?.transactions.length) return

    const provider = ProviderModule.getProvider(network)
    if (!provider) return logger.error('Provider not available for network', llo({ network }))

    const blockReceipts = await Web3Helper.getBlockReceipts(network, block.number)
    if (!blockReceipts) return

    const toAddresses = blockReceipts
      .filter((receipt: any) => receipt.to)
      .map((receipt: any) => ethers.getAddress(receipt.to))

    await utils.wait(
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME * 1000 * config.CONFIRMATION_BLOCKS,
    )

    await BlockHandler._checkIfDepositEvents(block, network)

    await BlockHandler.processReceiver(block.hash, toAddresses, network)
  },

  processReceiver: async (transactionHash: string, toAddresses: string[], network: NetworksEnum) => {
    const daos = await Models.Dao.find({ address: { $in: toAddresses }, network })
    if (!daos.length) return

    await Promise.all(
      daos.map(async (dao: any) => {
        logger.verbose(
          'New confirmed incoming transaction',
          llo({
            network,
            daoAddress: dao,
            transactionHash,
          }),
        )
        await BlockHandler.sendDaoMessages(dao)
      }),
    )
  },

  _checkIfDepositEvents: async (block: any, network: NetworksEnum) => {
    const blockHex = '0x' + Number(block.number).toString(16)
    const provider = ProviderModule.getProvider(network)
    const topicHash = new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!
    const filter = {
      fromBlock: blockHex,
      toBlock: blockHex,
      topics: [topicHash],
    }

    const logs = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network)!.schedule(async () => provider.getLogs(filter)),
    )

    if (!logs || logs.length === 0) {
      return
    }

    await Promise.all(
      logs.map(async (log: Log) => {
        await BlockHandler.processReceiver(log.transactionHash, [log.address], network)
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
}
