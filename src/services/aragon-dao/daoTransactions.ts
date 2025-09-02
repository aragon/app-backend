import {
  type HexAddress,
  IDaoTransferLogs,
  type ILogInfo,
  ITransactionSide,
  type NetworksEnum,
  LockErc721Token,
} from '@types'
import { ITransactionType } from '@src/types/transfer'
import { Models } from '@dbModels'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { Interface, type LogDescription, zeroPadValue } from 'ethers'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { TransferProcessorFactory } from 'src/modules/transfers'
import { DAO } from '@artifacts/dao'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

const daoInterface = new Interface(DAO.abi)
const nativeTokenDepositedTopic = daoInterface.getEvent(IDaoTransferLogs.NativeTokenDeposited)?.topicHash!
const executedTopic = daoInterface.getEvent(IDaoTransferLogs.Executed)?.topicHash!
const erc20Interface = new Interface(ERC20.abi)
const erc20TransferTopic = erc20Interface.getEvent(LockErc721Token.Transfer)?.topicHash!

export const DaoTransactions = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    try {
      const startTime = Date.now()
      logger.verbose('Start DaoTransactions', llo({ daoAddress, startTime }))

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)
      if (!daoDb) return

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
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Get token information with correct decimals
                  const token = await ProxyToken.saveAndGetToken(info.address, info.network)

                  // Create processor for incoming ERC20 transfers
                  const processor = TransferProcessorFactory.create(
                    ITransactionType.erc20,
                    daoDb.network,
                    daoDb.address,
                    {
                      decimals: token?.decimals,
                      transactionSide: ITransactionSide.deposit,
                    },
                  )

                  // Validate and process the transfer
                  if (processor.validateTransfer(parsedEvent)) {
                    logger.verbose(
                      'ERC20 Transfer to DAO',
                      llo({
                        from: parsedEvent.args.from ?? parsedEvent.args[0],
                        to: parsedEvent.args.to ?? parsedEvent.args[1],
                        value: (parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[2]).toString(),
                        tokenAddress: info.address,
                        txHash: info.transactionHash,
                      }),
                    )

                    const transferData = processor.prepareTransferData(parsedEvent, info)
                    await processor.save(transferData)
                  }
                },
              },
              {
                abi: ERC721.abi,
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Create processor for incoming ERC721 transfers
                  const processor = TransferProcessorFactory.create(
                    ITransactionType.erc721,
                    daoDb.network,
                    daoDb.address,
                    {
                      transactionSide: ITransactionSide.deposit,
                    },
                  )

                  // Validate and process the transfer
                  if (processor.validateTransfer(parsedEvent)) {
                    logger.verbose(
                      'ERC721 Transfer to DAO',
                      llo({
                        from: parsedEvent.args.from ?? parsedEvent.args[0],
                        to: parsedEvent.args.to ?? parsedEvent.args[1],
                        tokenId: (parsedEvent.args.tokenId ?? parsedEvent.args[2]).toString(),
                        tokenAddress: info.address,
                        txHash: info.transactionHash,
                      }),
                    )

                    const transferData = processor.prepareTransferData(parsedEvent, info)
                    await processor.save(transferData)
                  }
                },
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
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Create processor for native deposits
                  const processor = TransferProcessorFactory.create(
                    ITransactionType.native,
                    daoDb.network,
                    daoDb.address,
                    {
                      transactionSide: ITransactionSide.deposit,
                    },
                  )

                  logger.verbose(
                    'Native Token Deposited to DAO',
                    llo({
                      sender: parsedEvent.args.sender ?? parsedEvent.args[0], // sender address
                      amount: (parsedEvent.args.amount ?? parsedEvent.args[1]).toString(), // amount in wei
                      daoAddress: info.address,
                      txHash: info.transactionHash,
                      blockNumber: info.blockNumber,
                    }),
                  )

                  const transferData = processor.prepareTransferData(parsedEvent, info)
                  await processor.save(transferData)
                },
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
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Get token information with correct decimals
                  const token = await ProxyToken.saveAndGetToken(info.address, info.network)

                  // Create processor for outgoing ERC20 transfers
                  const processor = TransferProcessorFactory.create(
                    ITransactionType.erc20,
                    daoDb.network,
                    daoDb.address,
                    {
                      decimals: token?.decimals,
                      transactionSide: ITransactionSide.withdraw,
                    },
                  )

                  // Validate and process the transfer
                  if (processor.validateTransfer(parsedEvent)) {
                    logger.verbose(
                      'ERC20 Transfer from DAO',
                      llo({
                        from: parsedEvent.args.from ?? parsedEvent.args[0],
                        to: parsedEvent.args.to ?? parsedEvent.args[1],
                        value: (parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[2]).toString(),
                        tokenAddress: info.address,
                        txHash: info.transactionHash,
                      }),
                    )

                    const transferData = processor.prepareTransferData(parsedEvent, info)
                    await processor.save(transferData)
                  }
                },
              },
              {
                abi: ERC721.abi,
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Create processor for outgoing ERC721 transfers
                  const processor = TransferProcessorFactory.create(
                    ITransactionType.erc721,
                    daoDb.network,
                    daoDb.address,
                    {
                      transactionSide: ITransactionSide.withdraw,
                    },
                  )

                  // Validate and process the transfer
                  if (processor.validateTransfer(parsedEvent)) {
                    logger.verbose(
                      'NFT Transfer from DAO',
                      llo({
                        from: parsedEvent.args.from ?? parsedEvent.args[0],
                        to: parsedEvent.args.to ?? parsedEvent.args[1],
                        tokenId: (parsedEvent.args.tokenId ?? parsedEvent.args[2]).toString(),
                        tokenAddress: info.address,
                        txHash: info.transactionHash,
                      }),
                    )

                    const transferData = processor.prepareTransferData(parsedEvent, info)
                    await processor.save(transferData)
                  }
                },
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
                handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
                  // Track how many native transfers we've processed for logging
                  let nativeTransfersSaved = 0

                  // The Executed event typically has structure:
                  // event Executed(
                  //   address indexed actor,
                  //   bytes32 indexed callId,
                  //   Action[] actions,
                  //   uint256 allowFailureMap,
                  //   uint256 failureMap,
                  //   bytes[] execResults
                  // )
                  //
                  // Where Action is:
                  // struct Action {
                  //   address to;
                  //   uint256 value;
                  //   bytes data;
                  // }

                  // Check if there are actions in the event (3rd argument contains the actions array)
                  if (parsedEvent.args.length >= 3) {
                    const actions = parsedEvent.args[2]

                    if (Array.isArray(actions)) {
                      // Process each action in the Executed event
                      for (let index = 0; index < actions.length; index++) {
                        const action = actions[index]

                        // Extract action fields (supporting both named and positional access)
                        const value = action.value || action[1]
                        const to = action.to || action[0]

                        // Native transfers have value > 0 and empty or minimal data
                        if (value && value.toString() !== '0') {
                          // Create processor for outgoing native transfer
                          const processor = TransferProcessorFactory.create(
                            ITransactionType.native,
                            daoDb.network,
                            daoDb.address,
                            {
                              transactionSide: ITransactionSide.withdraw,
                            },
                          )

                          // Prepare the transfer data
                          const pseudoParsedEvent = {
                            name: 'NativeTransfer',
                            signature: 'NativeTransfer(address,uint256)',
                            args: [to, value], // For NativeDeposited event format
                          } as any

                          // For batch actions in Executed events, we use actionIndex for unique identification
                          const transferData = processor.prepareTransferData(pseudoParsedEvent, info)

                          // Add the actionIndex to identify this specific action within the batch
                          transferData.actionIndex = index

                          // Save the transfer
                          await processor.save(transferData)

                          nativeTransfersSaved++

                          logger.verbose(
                            'Native transfer saved from Executed event',
                            llo({
                              to,
                              value: value.toString(),
                              txHash: info.transactionHash,
                              actionIndex: index,
                              totalSaved: nativeTransfersSaved,
                            }),
                          )
                        }
                      }
                    }
                  }
                },
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
}
