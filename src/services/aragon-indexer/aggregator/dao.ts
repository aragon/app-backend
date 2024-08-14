import logger from '@logger'
import LogDaoRegistry from '@models/schema/logDaoRegistry'
import { Models } from '@dbModels'
import Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import LogDaoMetadata from '@models/schema/logDaoMetadata'
import DbTx from "@modules/dbTx";
import DaoMetric from "@models/schema/daoMetric";

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorDao' })

export const AggregatorDao = {

  createDao: async (daoLog: Partial<LogDaoRegistry>) => {
    const existingLog = await Models.Dao.findExistingLog({
      network: daoLog.network!,
      address: daoLog.address!,
    })

    if (existingLog) {
      return existingLog
    }

    const isValid = await Web3Helper.subdomainExists(daoLog.subdomain!, daoLog.network!)

    const document: Partial<Dao> = {
      network: daoLog.network,
      transactionHash: daoLog.transactionHash,
      blockNumber: daoLog.blockNumber,
      blockTimestamp: await Web3Helper.getBlockTimestamp(daoLog.blockNumber!, daoLog.network!) || undefined,
      address: daoLog.address,
      implementationAddress: daoLog.implementationAddress,
      ens: isValid ? Web3Helper.parseSubdomainToEns(daoLog.subdomain!) : null,
      subdomain: daoLog.subdomain,
      version: await Web3Helper.getDaoOsVersion(daoLog.implementationAddress!, daoLog.network!),
      creatorAddress: daoLog.creatorAddress,
    }

    await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.Dao.create(document as any, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Create Dao', llo({ logId: logDb?.id }))
      return logDb
    })

    await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.DaoMetric.create({
        daoAddress: document.address,
        network: document.network,
      }, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Create Dao Metric', llo({ logId: logDb?.id }))
    })
  },

  updateDaoMetadata: async (metadataLog: LogDaoMetadata) => {
    const dao = await Models.Dao.findExistingLog({
      network: metadataLog.network,
      address: metadataLog.daoAddress,
    })

    if (dao && metadataLog.fetchedMetadata) {
      await DbTx.executeTxFn(async ({ session }) => {

        const logDb = await dao.update({
          metadataIpfs: metadataLog.metadataUri,
          name: metadataLog?.name!,
          description: metadataLog?.description!,
          avatar: metadataLog?.avatar!,
          links: metadataLog?.links!,
        }, { session } as any)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Dao Metadata', llo({ logId: logDb?.id }))
      })
    }
  },
}
