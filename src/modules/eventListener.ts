import { Interface, type Log, type LogDescription } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { EnumQueueName, type IIndexerConfig, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })

class EventListener {
  public network: NetworksEnum
  public configLogs: IIndexerConfig[]
  public maxTopicsPerBatch = 4
  public isProcessingBlock = 0
  public lastBlock = 0

  constructor(network: NetworksEnum, configLogs: IIndexerConfig[]) {
    this.network = network
    this.configLogs = configLogs
  }

  async subscribeToEvents() {
    const topics = this.configLogs.map(config => config.topic).filter(topic => topic)

    if (topics.length === 0) {
      logger.error('No topics available for subscription', llo({ network: this.network }))
      return
    }

    const topicChunks: string[][] = []
    for (let i = 0; i < topics.length; i += this.maxTopicsPerBatch) {
      topicChunks.push(topics.slice(i, i + this.maxTopicsPerBatch))
    }

    await Promise.all(
      topicChunks.map(async (topicSubset: string[]) => {
        const filter: { topics: string[][] } = { topics: [topicSubset] }
        return new Promise(resolve => {
          try {
            ProviderModule.subscribeToEvent(this.network, filter, this.handleEvent.bind(this))
            logger.verbose('Start real-time listening', llo({ network: this.network, filter }))
          } catch (error) {
            logger.error('Event listener error', llo({ error, network: this.network, filter }))
          }
          resolve(null)
        })
      }),
    )
  }

  async handleEvent(txLog: Log) {
    try {
      const eventConfig = this.configLogs.find(item => item.topic === txLog.topics[0])
      if (!eventConfig) return

      let parsedEvent: LogDescription | null = null
      let matchingHandler: any = null

      for (const configItem of eventConfig.config) {
        const iFace = new Interface(configItem.abi)
        try {
          parsedEvent = Web3Helper.parseLog(txLog, iFace)
          if (parsedEvent) {
            matchingHandler = configItem.handler
            break
          }
        } catch (_) {
          // skip
        }
      }

      if (!parsedEvent) return

      const info = Web3Helper.parseInfoLog(txLog, parsedEvent.name, this.network)
      await matchingHandler?.(parsedEvent, info)
    } catch (error) {
      logger.error('Error handling eventListener', llo({ error, network: this.network, txLog }))
    }
  }

  subscribeEventsByNewBlock() {
    logger.verbose('Start real-time listening', llo({ network: this.network }))
    ProviderModule.subscribeToNewBlock(this.network, this.handleOnNewBlock.bind(this))
  }

  async handleOnNewBlock(blockNumber: number) {
    if (this.isProcessingBlock === blockNumber) {
      logger.verbose('Skipping block as another process is ongoing', llo({ blockNumber, network: this.network }))
      return
    }

    if (this.lastBlock + 1 !== blockNumber) {
      logger.warn(
        'Block Missed from on-chain',
        llo({
          currentBlock: blockNumber,
          prevBlock: this.lastBlock,
          network: this.network,
        }),
      )
    }

    this.isProcessingBlock = blockNumber
    this.lastBlock = blockNumber

    try {
      if (this.network === NetworksEnum.peaqMainnet) {
        await Utils.wait(1000 * 2)
      }

      const blockReceipts = await Web3Helper.getBlockReceipts(this.network, blockNumber)
      if (!blockReceipts || blockReceipts.length === 0) return

      const priorityTopics = this.configLogs.map(config => config.topic)

      const logs = blockReceipts.reduce((acc: any, receipt: any) => {
        const logsToHandle = receipt.logs.filter((log: any) => {
          return priorityTopics.includes(log.topics[0])
        })
        return acc.concat(logsToHandle)
      }, [])

      if (!logs || logs.length === 0) {
        return
      }

      const addresses = this.parseAddressForDeposits(logs)
      if (addresses?.length) {
        await RabbitMQHelper.sendMessage(EnumQueueName.realtimeTransactions, {
          id: `realtimeTransactions-${this.network}-${blockNumber}`,
          params: { addresses, network: this.network, transactionHash: logs[logs.length - 1].transactionHash },
        })
      }

      const sortedLogs = logs.sort(
        (a: Log, b: Log) => priorityTopics.indexOf(a.topics[0]) - priorityTopics.indexOf(b.topics[0]),
      )

      for (const log of sortedLogs) {
        await this.handleEvent(log)
        await this.saveProgress(blockNumber, this.network)
      }
    } finally {
      this.isProcessingBlock = 0
    }
  }

  async saveProgress(blockNumber: number, network: NetworksEnum) {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog(
          {
            network,
            service: `indexer-${network}`,
          },
          { session },
        )

        if (!existingConfig || existingConfig.lastSync >= blockNumber) {
          return false
        }

        await existingConfig.update({ lastSync: blockNumber }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('update last block', llo({ blockNumber, network }))
      })
    } catch (error) {
      logger.error('Error saving progress - last block', llo({ error, blockNumber, network }))
    }
  }

  parseAddressForDeposits(logs: Log[]): string[] | undefined {
    const topicHash = [
      new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
      new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
    ]

    const logsToHandle = logs.filter((log: Log) => {
      return topicHash.includes(log.topics[0])
    })

    if (!logsToHandle || logsToHandle.length === 0) {
      return
    }

    const receiverAddresses = new Set<string>()
    for (const log of logsToHandle) {
      if (log.topics[0] === topicHash[0]) {
        receiverAddresses.add(log.address)
      } else if (log.topics[0] === topicHash[1]) {
        const decodedAddress = this.decodeTransferLogs(log)
        if (decodedAddress) {
          receiverAddresses.add(decodedAddress)
        }
      }
    }

    return Array.from(receiverAddresses)
  }

  private decodeTransferLogs(log: Log) {
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
  }
}

export default EventListener
