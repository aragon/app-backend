import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import CoinGeckoHelper from '@helpers/coinGecko'

describe('Manual: CoinGecko', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get token price', async () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000'
    const ethereumMainnet = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.ethereumMainnet)
    console.log(ethereumMainnet)

    const polygonMainnet = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.polygonMainnet)
    console.log(polygonMainnet)

    const arbitrumMainnet = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.arbitrumMainnet)
    console.log(arbitrumMainnet)

    const ethereumSepolia = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.ethereumSepolia)
    console.log(ethereumSepolia)

    const zksyncSepolia = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.zksyncSepolia)
    console.log(zksyncSepolia)

    const zksyncMainnet = await CoinGeckoHelper.getToken(zeroAddress, NetworksEnum.zksyncMainnet)
    console.log(zksyncMainnet)
  })
})
