import { IDaoTransferLogs, LockErc721Token, type IQueueDaoTransactions } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import { Interface, zeroPadValue } from 'ethers'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { DAO } from '@artifacts/dao'
import { DaoV2 } from '@artifacts/daoV2'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { DaoTransferHandler } from '@handlers/daoTransferHanlder'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

const daoInterface = new Interface(DAO.abi)
const daoV2Interface = new Interface(DaoV2.abi)
const nativeTokenDepositedTopic = daoInterface.getEvent(IDaoTransferLogs.NativeTokenDeposited)?.topicHash!
const executedTopic = daoInterface.getEvent(IDaoTransferLogs.Executed)?.topicHash!
const executedV2Topic = daoV2Interface.getEvent(IDaoTransferLogs.Executed)?.topicHash!
const erc20Interface = new Interface(ERC20.abi)
const erc20TransferTopic = erc20Interface.getEvent(LockErc721Token.Transfer)?.topicHash!

export const DaoTransactions = {
  start: async ({ daoAddress, network, reset }: IQueueDaoTransactions) => {
    try {
      const startTime = Date.now()
      logger.verbose('Start DaoTransactions', llo({ daoAddress, startTime }))

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)
      if (!daoDb) return

      if (reset) {
        await DaoTransactions.resetTransactions({ daoAddress, network })
      }

      // deposit - ERC20/ERC721 transfers to DAO (any token contract)
      const crawlerIncomingTokenTransfers = new BlockchainLogCrawler({
        isTopicObject: true,
        network: daoDb.network,
        events: [
          {
            event: LockErc721Token.Transfer, // ERC20/ERC721 Transfer event where DAO is receiver
            topic: [
              erc20TransferTopic, // Transfer event signature
              null, // from address (any address can send)
              zeroPadValue(daoDb.address, 32), // to address (DAO as receiver)
            ],
            config: [
              {
                abi: ERC20.abi,
                handler: DaoTransferHandler.incomingErc20Transfer,
              },
              {
                abi: ERC721.abi,
                handler: DaoTransferHandler.incomingErc721Transfer,
              },
            ],
          },
        ],
        fromBlock: daoDb?.blockNumber,
        onError: async (error: any, log: any) => {
          logger.error('Error crawling transfer events', llo({ error, log }))
        },
        logService: ConfigIndexerHelper.builders.tokenDeposit(daoDb.network, daoDb.address),
        stopOnError: true,
      })

      // deposit - Native token deposits to DAO contract
      const crawlerIncomingNativeDeposits = new BlockchainLogCrawler({
        network: daoDb.network,
        events: [
          {
            event: IDaoTransferLogs.NativeTokenDeposited,
            topic: nativeTokenDepositedTopic,
            config: [
              {
                abi: DAO.abi,
                handler: DaoTransferHandler.incomingNativeDeposits,
              },
            ],
          },
        ],
        address: [daoDb.address], // Listen only to DAO contract for native deposits
        fromBlock: daoDb?.blockNumber,
        onError: async (error: any, log: any) => {
          logger.error('Error crawling native deposit events', llo({ error, log }))
        },
        logService: ConfigIndexerHelper.builders.nativeDeposit(daoDb.network, daoDb.address),
        stopOnError: true,
      })

      // withdraw - ERC20/ERC721 transfers from DAO (any token contract)
      const crawlerOutgoingTokenTransfers = new BlockchainLogCrawler({
        isTopicObject: true,
        network: daoDb.network,
        events: [
          {
            event: LockErc721Token.Transfer, // ERC20/ERC721 Transfer event where DAO is sender
            topic: [
              erc20TransferTopic, // Transfer event signature
              zeroPadValue(daoDb.address, 32), // from address (DAO as sender)
              null, // to address (any address can receive)
            ],
            config: [
              {
                abi: ERC20.abi,
                handler: DaoTransferHandler.withdrawErc20Transfer,
              },
              {
                abi: ERC721.abi,
                handler: DaoTransferHandler.withdrawErc721Transfer,
              },
            ],
          },
        ],
        fromBlock: daoDb?.blockNumber,
        onError: async (error: any, log: any) => {
          logger.error('Error crawling transfer events', llo({ error, log }))
        },
        logService: ConfigIndexerHelper.builders.tokenWithdraw(daoDb.network, daoDb.address),
        stopOnError: true,
      })

      // withdraw - Native transfers from DAO via Executed events
      const crawlerOutgoingNativeTransfers = new BlockchainLogCrawler({
        network: daoDb.network,
        events: [
          {
            event: IDaoTransferLogs.Executed,
            topic: executedTopic,
            config: [
              {
                abi: DAO.abi,
                handler: DaoTransferHandler.withdrawNativeDeposits,
              },
            ],
          },
          {
            event: IDaoTransferLogs.Executed,
            topic: executedV2Topic,
            config: [
              {
                abi: DaoV2.abi,
                handler: DaoTransferHandler.withdrawNativeDeposits,
              },
            ],
          },
        ],
        address: [daoDb.address], // Listen only to DAO contract for Executed events
        fromBlock: daoDb?.blockNumber,
        onError: async (error: any, log: any) => {
          logger.error('Error crawling Executed events', llo({ error, log }))
        },
        logService: ConfigIndexerHelper.builders.nativeWithdraw(daoDb.network, daoDb.address),
        stopOnError: true,
      })

      // Crawl events - all crawlers
      const crawlers: BlockchainLogCrawler[] = [
        crawlerIncomingTokenTransfers,
        crawlerIncomingNativeDeposits,
        crawlerOutgoingTokenTransfers,
        crawlerOutgoingNativeTransfers,
      ]

      // Process crawlers in parallel for better performance
      await Promise.all(crawlers.map(async (crawler: BlockchainLogCrawler) => crawler.crawl()))

      const duration = Date.now() - startTime
      logger.verbose('End DaoTransactions', llo({ daoId: daoDb.id, daoAddress, duration: `${duration}ms` }))
    } catch (error) {
      logger.error('Error start DaoTransactions', llo({ daoAddress, error }))
    }
  },

  resetTransactions: async ({ daoAddress, network }: IQueueDaoTransactions) => {
    const tokenDeposit = ConfigIndexerHelper.builders.tokenDeposit(network, daoAddress)
    const nativeDeposit = ConfigIndexerHelper.builders.nativeDeposit(network, daoAddress)
    const tokenWithdraw = ConfigIndexerHelper.builders.tokenWithdraw(network, daoAddress)
    const nativeWithdraw = ConfigIndexerHelper.builders.nativeWithdraw(network, daoAddress)

    await DbTx.executeTxFn(async ({ session }) => {
      await Models.Transaction.deleteMany(
        {
          daoAddress,
          network,
        },
        { session },
      )
      await Models.ConfigIndexer.deleteMany(
        {
          service: { $in: [tokenDeposit, nativeDeposit, tokenWithdraw, nativeWithdraw] },
        },
        { session },
      )

      await session.commitTransaction()
      await session.endSession()
    })
  },
}
