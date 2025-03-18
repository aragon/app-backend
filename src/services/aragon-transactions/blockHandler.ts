import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { EnumQueueName, type NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Dao from '@models/schema/dao'
import { DAO } from '@artifacts/dao'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-transactions:BlockHandler' })

export const BlockHandler = {
  processNewBlock: async (block: any, network: NetworksEnum) => {
    if (!block?.transactions.length) return

    const provider = ProviderModule.getAnyRpcProvider(network)
    if (!provider) {
      logger.error('Provider not available for network', llo({ network }))
      return
    }

    const blockReceipts = await Web3Helper.getBlockReceipts(network, block.number)
    if (!blockReceipts || blockReceipts.length === 0) return

    const toAddresses = blockReceipts
      .filter((receipt: any) => receipt.to)
      .map((receipt: any) => ethers.getAddress(receipt.to))

    await BlockHandler._checkIfDepositEvents(blockReceipts, network)

    await BlockHandler.processReceiver(block.hash, toAddresses, network)
  },

  processReceiver: async (transactionHash: string, toAddresses: string[], network: NetworksEnum) => {
    const daos = await Models.Dao.find({ address: { $in: toAddresses }, network })
    if (!daos || daos.length === 0) return

    await Promise.all(
      daos.map(async (dao: any) => {
        logger.verbose(
          'New confirmed incoming transaction',
          llo({
            network,
            daoAddress: dao.address,
            transactionHash,
          }),
        )
        await BlockHandler.sendDaoMessages(dao)
      }),
    )
  },

  _checkIfDepositEvents: async (blockReceipts: any, network: NetworksEnum) => {
    const topicHash = [
      new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
      new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
    ]

    const logs = blockReceipts.reduce((acc: any, receipt: any) => {
      const logsToHandle = receipt.logs.filter((log: any) => {
        return topicHash.includes(log.topics[0])
      })
      return acc.concat(logsToHandle)
    }, [])

    if (!logs || logs.length === 0) {
      return
    }

    const receiverAddresses = new Set<string>()
    for (const log of logs) {
      if (log.topics[0] === topicHash[0]) {
        receiverAddresses.add(log.address)
      } else if (log.topics[0] === topicHash[1]) {
        const decodedAddress = BlockHandler._decodeTransferLogs(log)
        if (decodedAddress) {
          receiverAddresses.add(decodedAddress)
        }
      }
    }

    if (receiverAddresses.size > 0) {
      await BlockHandler.processReceiver(logs[0].transactionHash, Array.from(receiverAddresses), network)
    }
  },

  _decodeTransferLogs: (log: Log) => {
    const govTokenInterface = new Interface(GovernanceERC20.abi)
    const erc721Interface = new Interface(ERC721.abi)
    let decoded: any = null
    try {
      decoded = govTokenInterface.parseLog(log)
    } catch (e) {
      try {
        decoded = erc721Interface.parseLog(log)
      } catch (e) {
        // skip
      }
    }
    return decoded ? decoded.args.to : null
  },

  sendDaoMessages: async (dao: Dao) => {
    try {
      await Promise.allSettled([
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
