import { EIP7708_TRANSFER_LOG_ADDRESS } from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { EnumConnection, type IService, ITransactionType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:removeEip7708TokenRows' })

const removeEip7708TokenRows: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    const network = NetworksEnum.ethereumSepolia
    const transactionFilter = {
      network,
      type: ITransactionType.erc20,
      tokenAddress: EIP7708_TRANSFER_LOG_ADDRESS,
      'token.address': EIP7708_TRANSFER_LOG_ADDRESS,
    }
    const tokenFilter = { network, address: EIP7708_TRANSFER_LOG_ADDRESS }
    const assetFilter = { network, tokenAddress: EIP7708_TRANSFER_LOG_ADDRESS }

    const deleted = await DbTx.executeTxFn(async ({ session }) => {
      const transactions = await Models.Transaction.countDocuments(transactionFilter).session(session)
      const tokens = await Models.Token.countDocuments(tokenFilter).session(session)
      const assets = await Models.Asset.countDocuments(assetFilter).session(session)

      logger.info('Removing EIP-7708 token rows', llo({ network, transactions, tokens, assets }))

      const transactionResult = await Models.Transaction.deleteMany(transactionFilter, { session })
      const tokenResult = await Models.Token.deleteMany(tokenFilter, { session })
      const assetResult = await Models.Asset.deleteMany(assetFilter, { session })

      await session.commitTransaction()
      await session.endSession()

      return {
        transactions: transactionResult.deletedCount,
        tokens: tokenResult.deletedCount,
        assets: assetResult.deletedCount,
      }
    })

    logger.info('Removed EIP-7708 token rows', llo({ network, ...deleted }))
  },

  stop: async () => {},
}

export default removeEip7708TokenRows
