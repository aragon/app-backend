import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'

const llo = logger.logMeta.bind(null, { service: 'models:utils:indexer' })

export const UtilsIndexer = {
  saveAndGetToken: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<null | Token> => {
    const parsedTokenAddress = Web3Helper.parseAddress(tokenAddress) || tokenAddress
    const existingToken = await Models.Token.findExistingLog({ address: parsedTokenAddress, network })

    if (existingToken) {
      return existingToken
    }

    const tokenTypeInfo = await TokenDetector.detectTokenType(parsedTokenAddress, network)
    const tokenInfo = await Web3Helper.getTokenInfo(parsedTokenAddress, network)

    // Note: we could fetch the rates while sync but this will slow down the sync process due to the rate limit
    const rate = await RateModule.fetchRate(parsedTokenAddress, network)

    return await DbTx.executeTxFn(
      async ({ session }) => {
        const rawToken = {
          address: tokenInfo.address,
          type: tokenTypeInfo?.type,
          implementationAddress: tokenTypeInfo?.implementationAddress!,
          network,
          name: tokenInfo.name,
          decimals: tokenInfo.decimals,
          symbol: tokenInfo.symbol,
          totalSupply: tokenInfo.totalSupply,
          ...rate,
        }
        const logDb = await Models.Token.create(rawToken, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Token', llo({ logId: logDb.id }))
        return logDb
      },
      { stopRetry: true },
    )
  },
}
