import { type IWeb3Provider } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import ProxyUtils from '@modules/proxyProvider/utils'

const KatanaProvider: Pick<IWeb3Provider, 'getTokenBalances'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)
    return ProxyUtils.enrichTokenBalances(tokensBalance, network)
  },
}

export default KatanaProvider
