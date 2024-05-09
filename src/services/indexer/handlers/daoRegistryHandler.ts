import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoRegistryHandler' })

export const DaoRegistryHandler = {
  daoRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('daoRegistered', llo({ parsedEvent }))

    const existingLog = await Models.LogDaoRegistry.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoLog = {
          network,
          address: parsedEvent.args.dao,
          creatorAddress: parsedEvent.args.creator,
          ens: parsedEvent.args.subdomain,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogDaoRegistry.create(daoLog, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New DaoLog', llo({ daoLog }))
      })
    }
  },
}
