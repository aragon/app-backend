import logger from '@logger'
import { type HexAddress, type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  newURI: async (parsedEvent: LogDescription, info: ILogInfo) => {
    if (!parsedEvent.args.daoURI) {
      logger.verbose('newURI: no daoURI', llo(info))
      return
    }

    const existingLog = await Models.LogDaoRegistry.findExistingLog(info.transactionHash, info.address)

    if (!existingLog) {
      const existingDao = await Models.LogDaoRegistry.findByAddress(info.address as HexAddress, info.network)

      if (!existingDao) {
        logger.verbose('Dao not found', llo(info))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const uriUpdates = {
          blockNumber: info.blockNumber,
          transactionHash: info.transactionHash,
          uri: parsedEvent.args.daoURI,
        }

        await existingDao.addURIUpdates(uriUpdates, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Log Dao New URI',
          llo({
            ...info,
            uri: parsedEvent.args.uri,
            daoId: existingDao.id,
          }),
        )
      })
    }
  },
}
