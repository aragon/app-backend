import logger from '@logger'
import { IAragonContract, type IDecodeTransaction, type NetworksEnum } from '@types'
import { Interface, type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { DAOFactory } from '@artifacts/daoFactory'
import { TokenVoting } from '@artifacts/TokenVoting'
import IPFSModule from '@modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MetadataHandler' })

export const MetadataHandler = {
  contractInterfaces: {
    DAOFactory: new Interface(DAOFactory.abi),
    TokenVoting: new Interface(TokenVoting.abi),
  },

  metadataSet: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    const transaction = await Web3Helper.getTransaction(txLog.transactionHash, network)

    if (!transaction?.data) {
      return
    }

    const decodedTransaction = MetadataHandler.decodeTransaction(transaction)

    if (!decodedTransaction) {
      logger.error('Unable to decode transaction', llo({ logInfo }))
      return
    }

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 1 })

    switch (decodedTransaction.contract) {
      case IAragonContract.DAOFactory: {
        const daoMetadata = Web3Helper.parseDaoMetadata(ipfsMetadata!)

        const daoAddress = txLog.address
        const existingDaoMetadata = await Models.LogDaoMetadata.findExistingLog(txLog.transactionHash, daoAddress)

        if (!existingDaoMetadata) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logDaoMetadata = {
              ...daoMetadata,
              network,
              metadataUri,
              daoAddress,
              fetchedMetadata: !!ipfsMetadata,
              ens: decodedTransaction.args[0].subdomain,
              daoURI: decodedTransaction.args[0].daoURI,
              trustedForwarder: decodedTransaction.args[0].trustedForwarder,
              blockNumber: txLog.blockNumber,
              transactionHash: txLog.transactionHash,
            }

            const logDb = await Models.LogDaoMetadata.create(logDaoMetadata, { session })

            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New DaoMetadata', llo({ logId: logDb.id, logInfo }))
          })
        }
        break
      }
      case IAragonContract.TokenVoting: {
        const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)

        const pluginAddress = txLog.address
        const proposalId = Number(decodedTransaction.args[0])
        const existingProposalMetadata = await Models.LogProposalMetadata.findExistingLog(
          txLog.transactionHash,
          pluginAddress,
          proposalId,
        )

        if (!existingProposalMetadata) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logProposalMetadata = {
              ...proposalMetadata,
              network,
              metadataUri,
              proposalId,
              pluginAddress: txLog.address,
              fetchedMetadata: !!ipfsMetadata,
              transactionHash: txLog.transactionHash,
              blockNumber: txLog.blockNumber,
            }
            const logDb = await Models.LogProposalMetadata.create(logProposalMetadata, { session })

            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New ProposalMetadata', llo({ logId: logDb.id, logInfo }))
          })
        }
        break
      }
      default:
        logger.error('Decoded metadata does not match any expected contract', llo({ logInfo }))
    }
  },

  decodeTransaction: (transaction: any): IDecodeTransaction | null => {
    const logInfo: any = {
      txHash: transaction.transactionHash,
      blockNumber: transaction.blockNumber,
    }

    const functionSelector = transaction.data.slice(0, 10)

    for (const [contractName, iface] of Object.entries(MetadataHandler.contractInterfaces)) {
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
        logger.error(
          'Metadata decoding error',
          llo({
            logInfo,
            contractName,
            error,
          }),
        )
      }
    }

    logger.error('Metadata not supported', llo({ logInfo }))
    return null
  },
}
