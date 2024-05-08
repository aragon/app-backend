import logger from '@logger'
import { Interface, Log } from 'ethers'
import Network from '@models/schema/network'
import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import { IAragonContract, type IDecodeTransaction, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Web3Helper from '@helpers/web3'
import { DAOFactory } from '@artifacts/daoFactory'
import IPFSModule from '@modules/ipfs'
import { TokenVoting } from '@artifacts/TokenVoting'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MetadataLogs' })

export const MetadataLogs = {
  createCrawler: (options: any) => new BlockchainLogCrawler(options),

  contractInterfaces: {
    DAOFactory: new Interface(DAOFactory.abi),
    TokenVoting: new Interface(TokenVoting.abi),
  },

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start MetadataLogs', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const daoInterface = new Interface(DAO.abi)
      const daoMetadataSetEvent = daoInterface.getEvent('MetadataSet')!

      const filter = {
        topics: [daoMetadataSetEvent.topicHash],
        fromBlock: networkDb.lastBlockMetadataLog,
        toBlock: 'latest',
      }

      const crawler = MetadataLogs.createCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => MetadataLogs.processMetadata(txLog, networkName as NetworksEnum),
        onError: async (error: any) => MetadataLogs.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockMetadataLog')
    }
    logger.verbose('Finish MetadataLogs', llo())
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error MetadataLogs',
      llo({
        error,
        network,
      }),
    )
  },

  processMetadata: async (txLog: any, network: NetworksEnum) => {
    const event = new Interface(DAO.abi).parseLog({ data: txLog.data, topics: txLog.topics })
    const transaction = await Web3Helper.getTransaction(txLog.transactionHash, network)

    if (!transaction?.data) {
      return
    }

    const decodedTransaction = MetadataLogs.decodeTransaction(transaction)

    if (!decodedTransaction) {
      logger.error('Unable to decode transaction', llo({ txLog, network }))
      return
    }

    const metadataUri = MetadataLogs.extractMetadataUri(event?.args.metadata)
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 1 })

    switch (decodedTransaction.contract) {
      case IAragonContract.DAOFactory: {
        const daoMetadata = Web3Helper.parseDaoMetadata(ipfsMetadata!)

        const existingDaoMetadata = await Models.LogDaoMetadata.findTxHash(txLog.transactionHash)

        if (!existingDaoMetadata) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logDaoMetadata = {
              ...daoMetadata,
              network,
              metadataUri,
              daoAddress: txLog.address,
              fetchedMetadata: !!ipfsMetadata,
              ens: decodedTransaction.args[0].subdomain,
              daoURI: decodedTransaction.args[0].daoURI,
              trustedForwarder: decodedTransaction.args[0].trustedForwarder,
              blockNumber: txLog.blockNumber,
              transactionHash: txLog.transactionHash,
            }

            await Models.LogDaoMetadata.create(logDaoMetadata, { session })

            await session.commitTransaction()
            await session.endSession()
            logger.verbose(
              'Stored DAO metadata',
              llo({
                network,
                logDaoMetadata,
              }),
            )
          })
        }
        break
      }
      case IAragonContract.TokenVoting: {
        const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)

        const existingProposalMetadata = await Models.LogProposalMetadata.findTxHash(txLog.transactionHash)

        if (!existingProposalMetadata) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logProposalMetadata = {
              ...proposalMetadata,
              network,
              metadataUri,
              daoAddress: txLog.address,
              fetchedMetadata: !!ipfsMetadata,
              proposalId: Number(decodedTransaction.args[0]),
              transactionHash: txLog.transactionHash,
              blockNumber: txLog.blockNumber,
            }
            await Models.LogProposalMetadata.create(logProposalMetadata, { session })

            await session.commitTransaction()
            await session.endSession()
            logger.verbose(
              'Stored proposal metadata',
              llo({
                network,
                logProposalMetadata,
              }),
            )
          })
        }
        break
      }
      default:
        logger.error(
          'Decoded metadata does not match any expected contract',
          llo({
            decodedTransaction,
            network,
          }),
        )
    }
  },

  decodeTransaction: (transaction: any): IDecodeTransaction | null => {
    const functionSelector = transaction.data.slice(0, 10)

    for (const [contractName, iface] of Object.entries(MetadataLogs.contractInterfaces)) {
      try {
        const functionFragment = iface.getFunction(functionSelector)
        if (functionFragment && Object.keys(functionFragment).length > 0) {
          const args = iface.decodeFunctionData(functionFragment, transaction.data)
          return {
            contract: contractName as IAragonContract,
            args,
            functionFragment,
          }
        }
      } catch (error) {
        logger.error(`Decoding error with ${contractName}`, llo({ error }))
      }
    }

    logger.error('metadata not supported', llo({ transaction }))
    return null
  },

  extractMetadataUri(metadataHex: string) {
    const metadataBytes = Buffer.from(metadataHex.substring(2), 'hex')
    return metadataBytes.toString('utf8')
  },
}
