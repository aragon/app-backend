import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CoinGeckoHelper from '@helpers/coinGecko'
import { NetworksEnum } from '@types'
import config from '@config'
import Logger from '@logger'
import utils from '@helpers/utils'

describe('Modules:CoinGeckoHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('networkToCoinGecko', () => {
    it('should correctly map the network to its CoinGecko equivalent', () => {
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.mainnet)).to.equal('ethereum')
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.polygon)).to.equal('polygon-pos')
    })
  })

  describe('coinToCoinGecko', () => {
    it('should correctly map the network to its corresponding coin on CoinGecko', () => {
      expect(CoinGeckoHelper.coinToCoinGecko(NetworksEnum.mainnet)).to.equal('ethereum')
      expect(CoinGeckoHelper.coinToCoinGecko(NetworksEnum.polygon)).to.equal('polygon-ecosystem-token')
    })
  })

  describe('_rpCall', () => {
    it('should handle the request successfully', async () => {
      const path = '/test-path'
      const fakeResponse = { data: { result: 'success' } }
      const rpcCallStub = sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').resolves(fakeResponse)

      const response: any = await CoinGeckoHelper._rpCall(path)

      expect(response.result).to.deep.equal(fakeResponse.data.result)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.calledWith(`${config.COINGECKO.URI}/test-path`)).to.be.true
    })

    it('should throw an error when the request fails', async () => {
      const path = '/test-path'
      const error = new Error('Test Error')
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').rejects(error)

      await expect(CoinGeckoHelper._rpCall(path)).to.be.rejectedWith(error, 'Test Error')

      expect(stubLogger.called).to.be.true
    })
  })

  describe('getTokenPrice', () => {
    it('should return undefined if network is unsupported', async () => {
      const price = await CoinGeckoHelper.getTokenPrice('0x...', NetworksEnum.sepolia)
      expect(price).to.be.undefined
    })

    it('should return token price data when the request is successful', async () => {
      const response = {
        '0x...': { usd: 100, usd_24h_change: -0.5 },
      }
      sandbox.stub(CoinGeckoHelper, '_rpCall').resolves(response)

      const price = await CoinGeckoHelper.getTokenPrice('0x...', NetworksEnum.mainnet)
      expect(price).to.deep.equal({ usd: 100, usd24hChange: -0.5 })
    })

    it('should handle errors gracefully', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(new Error('API Error'))

      const price = await CoinGeckoHelper.getTokenPrice('0x...', NetworksEnum.mainnet)

      expect(price).to.be.undefined
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getCoinPrice', () => {
    it('should return undefined if network is unsupported', async () => {
      const price = await CoinGeckoHelper.getCoinPrice(NetworksEnum.sepolia)
      expect(price).to.be.undefined
    })

    it('should return coin price data when the request is successful', async () => {
      const response = {
        ethereum: { usd: 2000, usd_24h_change: 5 },
      }
      sandbox.stub(CoinGeckoHelper, '_rpCall').resolves(response)
      const price = await CoinGeckoHelper.getCoinPrice(NetworksEnum.mainnet)
      expect(price).to.deep.equal({ usd: 2000, usd24hChange: 5 })
    })

    it('should handle errors gracefully', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(new Error('API Error'))

      const price = await CoinGeckoHelper.getCoinPrice(NetworksEnum.mainnet)

      expect(price).to.be.undefined
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getCoinTokenPrice', () => {
    it('should getCoinTokenPrice - native', async () => {
      const address = utils.zeroAddress

      const stubCall = sandbox.stub(CoinGeckoHelper, '_rpCall').resolves({
        [address]: { usd: 100, usd_24h_change: -0.5 },
      })

      const price = await CoinGeckoHelper.getCoinTokenPrice(address, NetworksEnum.mainnet)

      expect(stubCall.calledOnceWith(`/coins/${address}`)).to.be.true

      expect(price?.usd).to.equal(100)
      expect(price?.usd24hChange).to.equal(-0.5)
    })

    it('should getCoinTokenPrice - token', async () => {
      const address = '0x0111'

      const stubCall = sandbox.stub(CoinGeckoHelper, '_rpCall').resolves({
        [address]: { usd: 100, usd_24h_change: -0.5 },
      })

      const price = await CoinGeckoHelper.getCoinTokenPrice(address, NetworksEnum.mainnet)

      expect(
        stubCall.calledOnceWith(
          `/coins/${CoinGeckoHelper.networkToCoinGecko(NetworksEnum.mainnet)}/contract/${address}`,
        ),
      ).to.be.true

      expect(price?.usd).to.equal(100)
      expect(price?.usd24hChange).to.equal(-0.5)
    })

    it('should getCoinTokenPrice - error', async () => {
      const address = '0x0111'

      const stubLogger = sandbox.stub(Logger, 'error')
      const stubCall = sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(new Error('fake-error'))

      const price = await CoinGeckoHelper.getCoinTokenPrice(address, NetworksEnum.mainnet)

      expect(
        stubCall.calledOnceWith(
          `/coins/${CoinGeckoHelper.networkToCoinGecko(NetworksEnum.mainnet)}/contract/${address}`,
        ),
      ).to.be.true

      expect(price).to.be.undefined
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should getCoinTokenPrice - unsupported network', async () => {
      const address = '0x0111'

      const stubCall = sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(new Error('fake-error'))

      const price = await CoinGeckoHelper.getCoinTokenPrice(address, NetworksEnum.sepolia as any)

      expect(stubCall.notCalled).to.be.true
      expect(price).to.be.undefined
    })
  })
})
