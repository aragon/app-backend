import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  newURI: async (parsedEvent: LogDescription, info: ILogInfo) => {
    if (!parsedEvent.args.daoURI) {
      logger.warn('newURI - no daoURI', llo(info))
      return
    }

    const existingDao = await Models.LogDaoRegistry.findByAddress(info.address as any, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    const existingUriEvent = await existingDao.findUriEvent(info.transactionHash)

    if (!existingUriEvent) {
      await DbTx.executeTxFn(async ({ session }) => {
        const rawUriEvent = {
          blockNumber: info.blockNumber,
          transactionHash: info.transactionHash,
          uri: parsedEvent.args.daoURI,
        }

        const logDb = await existingDao.addUriEvent(rawUriEvent as any, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Log Dao New URI',
          llo({
            ...info,
            logId: logDb.id,
          }),
        )
      })
    }
  },
}
