import logger from '@logger'
import { type HexAddress, type ILogInfo } from '@types'
import { Interface, type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { DAOFactory } from '@artifacts/daoFactory'
import { TokenVoting } from '@artifacts/TokenVoting'
import IPFSModule from '@modules/ipfs'
import { DAO } from '@artifacts/dao'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MetadataHandler' })

export const MetadataHandler = {
  contractInterfaces: {
    DAOFactory: new Interface(DAOFactory.abi),
    TokenVoting: new Interface(TokenVoting.abi),
    DAO: new Interface(DAO.abi),
  },

  metadataSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    /**
     * As the tx log can a transaction Object or transaction receipt,
     * We need to properly extract the transaction hash and block number
     *
     * This situation occurs when its is called from the daoRegistryHandler,
     * dao creation lifecycle
     */

    try {
      const daoAddress = info.address

      const existingDaoMetadata = await Models.LogDaoMetadata.findExistingLog(info.transactionHash, daoAddress)

      if (!existingDaoMetadata) {
        const isDaoExists = await Models.LogDaoRegistry.findByAddress(daoAddress as HexAddress, info.network)

        if (isDaoExists) {
          const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)

          const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 1 })

          await DbTx.executeTxFn(async ({ session }) => {
            const logDaoMetadata = {
              network: info.network,
              metadataUri,
              daoAddress,
              fetchedMetadata: !!ipfsMetadata,
              blockNumber: info.blockNumber,
              transactionHash: info.transactionHash,
              name: ipfsMetadata?.name,
              description: ipfsMetadata?.description,
              avatar: ipfsMetadata?.avatar,
              links: ipfsMetadata?.links,
            }

            const logDb = await Models.LogDaoMetadata.create(logDaoMetadata, { session })

            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New DaoMetadata', llo({ ...info, logId: logDb.id }))
          })
        }
      }
    } catch (error) {
      logger.error('Error DaoMetadata', llo({ ...info, error }))
    }
  },
}
