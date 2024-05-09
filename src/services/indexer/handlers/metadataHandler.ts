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
    logger.verbose('metadataSet', llo({ parsedEvent }))
    const transaction = await Web3Helper.getTransaction(txLog.transactionHash, network)

    if (!transaction?.data) {
      return
    }

    const decodedTransaction = MetadataHandler.decodeTransaction(transaction)

    if (!decodedTransaction) {
      logger.error(
        'Unable to decode transaction',
        llo({
          txLog,
          network,
        }),
      )
      return
    }

    const metadataUri = MetadataHandler.extractMetadataUri(parsedEvent?.args.metadata)
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
            contractName,
            error,
          }),
        )
      }
    }

    logger.error('Metadata not supported', llo({ transaction }))
    return null
  },

  extractMetadataUri(metadataHex: string) {
    const metadataBytes = Buffer.from(metadataHex.substring(2), 'hex')
    return metadataBytes.toString('utf8')
  },
}
