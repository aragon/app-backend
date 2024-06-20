import sinon from 'sinon'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { HexAddress, NetworksEnum } from '@types'
import CoinGeckoHelper from '@helpers/coinGecko'
import { RateModule } from '@modules/rates'
import CovalentHelper from '@helpers/covalent'

describe('Modules:RateModule', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchRate', () => {
    it('should fetchRate with Covalent', async () => {
      const expectedPrice = { priceUsd: '1', priceChangeOnDayUsd: 0.1, logo: 'fake-logo' }
      const getCoinPriceStub = sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves(expectedPrice as any)

      const result = await RateModule.fetchRate(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result).to.equal(expectedPrice)
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress as HexAddress, NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should fetchRate', async () => {
      const expectedPrice = { priceUsd: '1', priceChangeOnDayUsd: 0.1, logo: 'fake-logo' }
      sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves({ priceUsd: '0' } as any)
      const getCoinPriceStub = sandbox.stub(RateModule, 'fetchRateWithCoinGecko').resolves(expectedPrice as any)

      const result = await RateModule.fetchRate(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result).to.equal(expectedPrice)
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress as HexAddress, NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('fetchRateWithCoinGecko', () => {
    it('should fetch the native currency price when token address is ZeroAddress', async () => {
      const expectedPrice = { usd: '1', usd24hChange: '0.1' }
      const getCoinPriceStub = sandbox.stub(CoinGeckoHelper, 'getCoinPrice').resolves(expectedPrice as any)

      const result = await RateModule.fetchRateWithCoinGecko(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result.priceUsd).to.equal('1')
      expect(result.priceChangeOnDayUsd).to.equal('0.1')
      expect(result.logo).to.be.null
      expect(result.lastUpdatedAt).to.exist
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should fetch the specific token price when token address is not ZeroAddress', async () => {
      const tokenAddress = '0x0000000000000000000000000000000000000001'
      const expectedPrice = { usd: '200', usd24hChange: '-0.2' }
      const getTokenPriceStub = sandbox.stub(CoinGeckoHelper, 'getTokenPrice').resolves(expectedPrice as any)

      const result = await RateModule.fetchRateWithCoinGecko(tokenAddress, NetworksEnum.ethereumMainnet)

      expect(result.priceUsd).to.equal('200')
      expect(result.priceChangeOnDayUsd).to.equal('-0.2')
      expect(result.logo).to.be.null
      expect(result.lastUpdatedAt).to.exist
      expect(getTokenPriceStub.calledOnce).to.be.true
      expect(getTokenPriceStub.calledWithExactly(tokenAddress, NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('fetchRateWithCovalent', () => {
    it('should fetchRateWithCovalent', async () => {
      const expectedPrice = { priceUsd: '1', priceChangeOnDayUsd: '0.1', logo: 'fake-logo' }
      const getCoinPriceStub = sandbox.stub(CovalentHelper, 'getToken').resolves(expectedPrice as any)

      const result = await RateModule.fetchRateWithCovalent(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result.priceUsd).to.equal('1')
      expect(result.priceChangeOnDayUsd).to.equal('0.1')
      expect(result.logo).to.equal('fake-logo')
      expect(result.lastUpdatedAt).to.exist
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress, NetworksEnum.ethereumMainnet)).to.be.true
    })
  })
})
