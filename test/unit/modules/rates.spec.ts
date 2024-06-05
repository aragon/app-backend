import sinon from 'sinon'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { NetworksEnum } from '@types'
import CoinGeckoHelper from '@helpers/coinGecko'
import { RateModule } from '@modules/rates'

describe('Modules:RateModule', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchRate', () => {
    it('should fetch the native currency price when token address is ZeroAddress', async () => {
      const expectedPrice = { usd: '1', usd24hChange: '0.1' }
      const getCoinPriceStub = sandbox.stub(CoinGeckoHelper, 'getCoinPrice').resolves(expectedPrice as any)

      const result = await RateModule.fetchRate(ZeroAddress as any, NetworksEnum.mainnet)

      expect(result.priceUsd).to.equal('1')
      expect(result.priceChangeOnDayUsd).to.equal('0.1')
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(NetworksEnum.mainnet)).to.be.true
    })

    it('should fetch the specific token price when token address is not ZeroAddress', async () => {
      const tokenAddress = '0x0000000000000000000000000000000000000001'
      const expectedPrice = { usd: '200', usd24hChange: '-0.2' }
      const getTokenPriceStub = sandbox.stub(CoinGeckoHelper, 'getTokenPrice').resolves(expectedPrice as any)

      const result = await RateModule.fetchRate(tokenAddress, NetworksEnum.mainnet)

      expect(result.priceUsd).to.equal('200')
      expect(result.priceChangeOnDayUsd).to.equal('-0.2')
      expect(getTokenPriceStub.calledOnce).to.be.true
      expect(getTokenPriceStub.calledWithExactly(tokenAddress, NetworksEnum.mainnet)).to.be.true
    })
  })
})
