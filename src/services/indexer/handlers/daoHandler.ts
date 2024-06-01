import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  newURI: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo = {
      transactionHash: txLog.transactionHash,
      network,
    }

    if (!parsedEvent.args.daoURI) {
      logger.verbose('newURI: no daoURI', llo({ logInfo }))
      return
    }

    const existingLog = await Models.LogDaoRegistry.findExistingLog(txLog.transactionHash, txLog.address)

    if (!existingLog) {
      const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address, network)

      if (!existingDao) {
        logger.verbose(
          'Dao not found',
          llo({
            logInfo,
          }),
        )
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const uriUpdates = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          uri: parsedEvent.args.daoURI,
        }

        await existingDao.addURIUpdates(uriUpdates, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Log Dao New URI',
          llo({
            uri: parsedEvent.args.uri,
            transactionHash: txLog.transactionHash,
            network,
            daoId: existingDao.id,
          }),
        )
      })
    }
  },
}
