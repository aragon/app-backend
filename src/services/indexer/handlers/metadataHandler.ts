import logger from '@logger'
import { IAragonContract, type IDecodeTransaction, type NetworksEnum } from '@types'
import { Interface, type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { DAO } from '@artifacts/dao'
import { DAOFactory } from '@artifacts/daoFactory'
import { TokenVoting } from '@artifacts/TokenVoting'
import IPFSModule from '@modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MetadataHandler' })

export const MetadataHandler = {
  contractInterfaces: {
    DAOFactory: new Interface(DAOFactory.abi),
    DAO: new Interface(DAO.abi),
    TokenVoting: new Interface(TokenVoting.abi),
  },

  metadataSet: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 1 })
    if (!ipfsMetadata) {
      logger.warn('Metadata ipfs null', llo({ logInfo }))
      return
    }

    const daoAddress = txLog.address

    const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address, network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({logInfo}),
      )
      return
    }

    const existingDaoMetadata = await Models.LogDaoMetadata.findExistingLog(txLog.transactionHash, daoAddress)

    if (!existingDaoMetadata) {
      const daoMetadata = Web3Helper.parseDaoMetadata(ipfsMetadata!)

      await DbTx.executeTxFn(async ({ session }) => {
        const logDaoMetadata = {
          ...daoMetadata,
          network,
          metadataUri,
          daoAddress,
          fetchedMetadata: !!ipfsMetadata,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        const logDb = await Models.LogDaoMetadata.create(logDaoMetadata, {session})

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New DaoMetadata', llo({logId: logDb.id, logInfo}))
      })
    }
  },
}
