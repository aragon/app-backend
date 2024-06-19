import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import CoinGeckoHelper from '@helpers/coinGecko'
import { NetworksEnum } from '@types'

describe('Manual: CoinGeckoHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get token price', async () => {
    const daoFactoryAddress = '0x333a4823466879eef910a04d473505da62142069'
    const response = await CoinGeckoHelper.getTokenPrice(daoFactoryAddress, NetworksEnum.ethereumMainnet)
    console.log(response)

    const response2 = await CoinGeckoHelper.getCoinPrice(NetworksEnum.arbitrumMainnet)
    console.log(response2)
    // eslint-disable-line no-console
  })
})
