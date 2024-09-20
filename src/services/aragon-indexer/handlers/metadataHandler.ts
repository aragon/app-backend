import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'
import type LogDaoMetadata from '@models/schema/logDaoMetadata'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:MetadataHandler' })

export const MetadataHandler = {
  metadataSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address: daoAddress, transactionHash, network, blockNumber, transactionIndex, logIndex } = info

    const existingDaoMetadata = await Models.LogDaoMetadata.findExistingLog({
      network,
      transactionHash,
      transactionIndex,
      logIndex,
      daoAddress,
    })
    if (existingDaoMetadata) return

    const daoExists = await Models.Dao.findByAddress(daoAddress, network)
    if (!daoExists) return

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent.args.metadata)
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 1 })

    const logDaoMetadata = {
      network,
      transactionHash,
      transactionIndex,
      logIndex,
      metadataUri: metadataUri!,
      daoAddress,
      fetchedMetadata: !!ipfsMetadata,
      blockNumber,
      name: ipfsMetadata?.name!,
      description: ipfsMetadata?.description!,
      avatar: ipfsMetadata?.avatar!,
      links: ipfsMetadata?.links!,
    }

    const logDb = await DbOperations.createDocument(Models.LogDaoMetadata, logDaoMetadata, info, 'Metadata Set', llo)
    if (logDb) {
      await MetadataHandler._updateDaoMetadata(logDb)
    }
  },

  _updateDaoMetadata: async (metadataLog: LogDaoMetadata) => {
    const dao = await Models.Dao.findExistingLog({
      network: metadataLog.network,
      address: metadataLog.daoAddress,
    })
    if (!dao || !metadataLog.fetchedMetadata) return

    const document = {
      metadataIpfs: metadataLog.metadataUri,
      name: metadataLog.name,
      description: metadataLog.description,
      avatar: metadataLog.avatar,
      links: metadataLog.links,
    }
    await DbOperations.updateDocument(dao, document, { logId: metadataLog.id }, 'Update Dao Metadata', llo)
  },
}
