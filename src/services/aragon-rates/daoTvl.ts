import pLimit from 'p-limit'
import { Models } from '@dbModels'
import logger from '@logger'
import { type HexAddress, type IWeb3TokenBalance, type NetworksEnum, TestNetworks } from '@types'
import ProviderModule from '@modules/provider'
import Utils from '@helpers/utils'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'

const llo = logger.logMeta.bind(null, { service: 'rates:FetchRates' })

const daoProcessingLimit = pLimit(20)
const tokenProcessingLimit = pLimit(10)
const BATCH_SIZE = 50

export const FetchDaoTvl = {
  progress: 0,
  start: async (): Promise<void> => {
    const startTime = Date.now()
    const networks = (Object.keys(ProviderModule.alchemyNetworksMap) as NetworksEnum[]).filter(
      (network: NetworksEnum) => !TestNetworks.includes(network),
    )

    logger.verbose('Start FetchDaoTvl', llo({ startTime, networks }))

    await Promise.all(
      networks.map(async (networkName: NetworksEnum) => {
        const daoAddresses = await Models.Dao.find({
          network: networkName,
          isActive: true,
        }).distinct('address')

        await FetchDaoTvl.fetchAndUpdateTvl(daoAddresses, networkName)
        return true
      }),
    )

    logger.verbose('End FetchDaoTvl', llo({ duration: `${Date.now() - startTime}ms` }))
  },

  fetchAndUpdateTvl: async (daoAddresses: string[], network: NetworksEnum): Promise<void> => {
    const nativeBalances = await Web3BatchHelper.getNativeBalancesInBatch(daoAddresses, network)

    const tokenBalancesBatches = Utils.chunkArray(daoAddresses, BATCH_SIZE)
    const allTokenBalances: Record<string, IWeb3TokenBalance[]> = {}

    for (const tokenBatch of tokenBalancesBatches) {
      const batchTokenBalances = await Web3BatchHelper.getTokenBalancesInBatch(tokenBatch, network)
      Object.assign(allTokenBalances, batchTokenBalances)
    }

    await Promise.all(
      daoAddresses.map(async address =>
        daoProcessingLimit(async () =>
          FetchDaoTvl.handleAssetsForEachDao(address, network, {
            nativeBalance: nativeBalances[address] || '0',
            tokenBalances: allTokenBalances[address] || [],
          }),
        ),
      ),
    )
  },

  handleAssetsForEachDao: async (
    daoAddress: HexAddress,
    network: NetworksEnum,
    assetsData: { nativeBalance: string; tokenBalances: IWeb3TokenBalance[] },
  ): Promise<void> => {
    const daoDb = await Models.Dao.findByAddress(daoAddress, network)

    if (Number(assetsData.nativeBalance) > 0) {
      await DaoAssets._handleNativeToken(daoDb, assetsData.nativeBalance)
    }

    await DaoAssets._removeStaleAssets(daoDb, assetsData.tokenBalances)

    const tokenBalances = assetsData.tokenBalances.filter(token => Number(token.tokenBalance) > 0)

    if (tokenBalances.length) {
      await Promise.all(
        tokenBalances.map(async tokenBalance =>
          tokenProcessingLimit(async () => DaoAssets._handleErc20Token(daoDb, tokenBalance)),
        ),
      )
    }

    FetchDaoTvl.progress += 1

    logger.verbose(
      'FetchDaoTvl progress',
      llo({
        daoAddress: daoDb.address,
        network: daoDb.network,
        processed: FetchDaoTvl.progress,
      }),
    )

    if (daoDb.metrics.tvlUSD === 0 && Number(assetsData.nativeBalance) === 0 && tokenBalances.length === 0) {
      return
    }

    await DaoMetrics.start({ daoAddress: daoDb.address, network: daoDb.network })
  },

  stop: async (): Promise<void> => {},
}
