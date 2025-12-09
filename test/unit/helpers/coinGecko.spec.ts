import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CoinGeckoHelper from '@helpers/coinGecko'
import { ITokenType, NetworksEnum } from '@types'
import logger from '@logger'
import * as retryRequestModule from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import utils from '@helpers/utils'

describe('Helpers: CoinGecko', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    sandbox.stub(BottleneckModule, 'getCoinGeckoLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('networkToCoinGecko', () => {
    it('should return correct CoinGecko network ID for supported networks', () => {
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.ethereumMainnet)).to.eq('eth')
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.polygonMainnet)).to.eq('polygon_pos')
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.baseMainnet)).to.eq('base')
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.arbitrumMainnet)).to.eq('arbitrum')
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.chilizMainnet)).to.eq('chiliz-chain')
    })

    it('should return undefined for unsupported networks', () => {
      expect(CoinGeckoHelper.networkToCoinGecko(NetworksEnum.ethereumSepolia)).to.be.undefined
    })
  })

  describe('networkToNativeTokenId', () => {
    it('should return correct native token ID for supported networks', () => {
      expect(CoinGeckoHelper.networkToNativeTokenId(NetworksEnum.ethereumMainnet)).to.eq('ethereum')
      expect(CoinGeckoHelper.networkToNativeTokenId(NetworksEnum.polygonMainnet)).to.eq('polygon-ecosystem-token')
      expect(CoinGeckoHelper.networkToNativeTokenId(NetworksEnum.chilizMainnet)).to.eq('chiliz')
      expect(CoinGeckoHelper.networkToNativeTokenId(NetworksEnum.peaqMainnet)).to.eq('peaq-2')
    })

    it('should return undefined for unsupported networks', () => {
      expect(CoinGeckoHelper.networkToNativeTokenId(NetworksEnum.ethereumSepolia)).to.be.undefined
    })
  })

  describe('isTestNetwork', () => {
    it('should return true for test networks', () => {
      expect(CoinGeckoHelper.isTestNetwork(NetworksEnum.ethereumSepolia)).to.be.true
      expect(CoinGeckoHelper.isTestNetwork(NetworksEnum.zksyncSepolia)).to.be.true
    })

    it('should return false for mainnet networks', () => {
      expect(CoinGeckoHelper.isTestNetwork(NetworksEnum.ethereumMainnet)).to.be.false
      expect(CoinGeckoHelper.isTestNetwork(NetworksEnum.polygonMainnet)).to.be.false
    })
  })

  describe('_rpCall', () => {
    it('should make a successful RPC call', async () => {
      const expectedData = { id: 'ethereum', symbol: 'eth' }
      const axiosGetStub = sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').resolves({ data: expectedData })

      const result = await CoinGeckoHelper._rpCall('/coins/ethereum', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.eq(expectedData)
      expect(axiosGetStub.calledOnce).to.be.true
    })

    it('should handle errors and log warning', async () => {
      const error = { response: { data: { error: 'rate limit' } }, status: 500 }
      sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').rejects(error)
      const loggerStub = sandbox.stub(logger, 'warn')

      try {
        await CoinGeckoHelper._rpCall('/coins/ethereum', NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).to.eq(error)
        expect(loggerStub.calledOnce).to.be.true
      }
    })

    it('should not log warning for not found errors', async () => {
      const error = { response: { data: { error: 'coin not found' } }, status: 404 }
      sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').rejects(error)
      const loggerStub = sandbox.stub(logger, 'warn')

      try {
        await CoinGeckoHelper._rpCall('/coins/unknown', NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).to.eq(error)
        expect(loggerStub.called).to.be.false
      }
    })

    it('should not log warning for 401 errors', async () => {
      const error = { response: { data: { error: 'unauthorized' } }, status: 401 }
      sandbox.stub(CoinGeckoHelper.axiosInstance, 'get').rejects(error)
      const loggerStub = sandbox.stub(logger, 'warn')

      try {
        await CoinGeckoHelper._rpCall('/coins/ethereum', NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).to.eq(error)
        expect(loggerStub.called).to.be.false
      }
    })
  })

  describe('getNativeToken', () => {
    it('should return testnet token for test networks', async () => {
      const result = await CoinGeckoHelper.getNativeToken(NetworksEnum.ethereumSepolia)

      expect(result).to.not.be.false
      if (result) {
        expect(result.name).to.eq('Ether')
        expect(result.symbol).to.eq('ETH')
        expect(result.decimals).to.eq(18)
        expect(result.type).to.eq(ITokenType.native)
        expect(result.address).to.eq(utils.zeroAddress)
        expect(result.priceUsd).to.eq('0')
      }
    })

    it('should return false for networks without native token mapping', async () => {
      const result = await CoinGeckoHelper.getNativeToken('unknown-network' as NetworksEnum)
      expect(result).to.be.false
    })

    it('should fetch native token from CoinGecko API for mainnet', async () => {
      const mockResponse = {
        name: 'Ethereum',
        symbol: 'eth',
        detail_platforms: { ethereum: { decimal_place: 18 } },
        image: { large: 'https://example.com/eth.png' },
        market_data: { current_price: { usd: 2000 } },
      }
      sandbox.stub(CoinGeckoHelper, '_rpCall').resolves(mockResponse)

      const result = await CoinGeckoHelper.getNativeToken(NetworksEnum.ethereumMainnet)

      expect(result).to.not.be.false
      if (result) {
        expect(result.name).to.eq('Ethereum')
        expect(result.symbol).to.eq('eth')
        expect(result.decimals).to.eq(18)
        expect(result.priceUsd).to.eq('2000')
        expect(result.logo).to.eq('https://example.com/eth.png')
        expect(result.type).to.eq(ITokenType.native)
      }
    })

    it('should return false when API call fails', async () => {
      const error = { response: { data: { error: 'rate limit' } }, status: 500 }
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(error)
      sandbox.stub(logger, 'warn')

      const result = await CoinGeckoHelper.getNativeToken(NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should not log warning for not found errors in getNativeToken', async () => {
      const error = { response: { data: { error: 'coin not found' } }, status: 404 }
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(error)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await CoinGeckoHelper.getNativeToken(NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
      expect(loggerStub.called).to.be.false
    })
  })

  describe('getToken', () => {
    it('should call getNativeToken for zero address', async () => {
      const getNativeTokenStub = sandbox.stub(CoinGeckoHelper, 'getNativeToken').resolves({
        address: utils.zeroAddress,
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.native,
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        logo: '',
        priceUsd: '2000',
        lastUpdatedAt: '',
        createdAt: '',
        totalSupply: '0',
        holders: 0,
      })

      const result = await CoinGeckoHelper.getToken(utils.zeroAddress, NetworksEnum.ethereumMainnet)

      expect(getNativeTokenStub.calledOnce).to.be.true
      expect(result).to.not.be.false
    })

    it('should return false for unsupported networks', async () => {
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await CoinGeckoHelper.getToken('0x1234567890abcdef', NetworksEnum.ethereumSepolia)

      expect(result).to.be.false
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should fetch ERC20 token from CoinGecko API', async () => {
      const tokenAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const mockResponse = {
        data: {
          id: 'token-id',
          type: 'token',
          attributes: {
            address: tokenAddress,
            name: 'Test Token',
            symbol: 'TT',
            image_url: 'https://example.com/token.png',
            decimals: 18,
            total_supply: '1000000000000000000000',
            price_usd: '1.5',
            fdv_usd: '1500000',
            total_reserve_in_usd: '500000',
            volume_usd: { h24: '100000' },
            market_cap_usd: '1000000',
          },
        },
      }
      sandbox.stub(CoinGeckoHelper, '_rpCall').resolves(mockResponse)

      const result = await CoinGeckoHelper.getToken(tokenAddress, NetworksEnum.ethereumMainnet)

      expect(result).to.not.be.false
      if (result) {
        expect(result.name).to.eq('Test Token')
        expect(result.symbol).to.eq('TT')
        expect(result.decimals).to.eq(18)
        expect(result.priceUsd).to.eq('1.5')
        expect(result.totalSupply).to.eq('1000000000000000000000')
        expect(result.type).to.eq(ITokenType.ERC20)
      }
    })

    it('should return false when API call fails', async () => {
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(new Error('API Error'))

      const result = await CoinGeckoHelper.getToken('0x1234567890abcdef', NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should log error for payment required errors', async () => {
      const error = { response: { statusText: 'Payment Required' } }
      sandbox.stub(CoinGeckoHelper, '_rpCall').rejects(error)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await CoinGeckoHelper.getToken('0x1234567890abcdef', NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('_parseNativeToken', () => {
    it('should parse native token response correctly', () => {
      const response = {
        name: 'Ethereum',
        symbol: 'eth',
        detail_platforms: { ethereum: { decimal_place: 18 } },
        image: { large: 'https://example.com/eth.png' },
        market_data: { current_price: { usd: 2500 } },
      }

      const result = CoinGeckoHelper._parseNativeToken(response, NetworksEnum.ethereumMainnet)

      expect(result.name).to.eq('Ethereum')
      expect(result.symbol).to.eq('eth')
      expect(result.decimals).to.eq(18)
      expect(result.priceUsd).to.eq('2500')
      expect(result.logo).to.eq('https://example.com/eth.png')
      expect(result.type).to.eq(ITokenType.native)
      expect(result.address).to.eq(utils.zeroAddress)
    })

    it('should handle missing fields with defaults', () => {
      const response = {}

      const result = CoinGeckoHelper._parseNativeToken(response, NetworksEnum.ethereumMainnet)

      expect(result.name).to.eq('')
      expect(result.symbol).to.eq('')
      expect(result.decimals).to.eq(18)
      expect(result.priceUsd).to.eq('0')
      expect(result.logo).to.eq('')
    })
  })

  describe('_parseToken', () => {
    it('should parse ERC20 token response correctly', () => {
      const response = {
        data: {
          id: 'token-id',
          type: 'token',
          attributes: {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            name: 'Test Token',
            symbol: 'TT',
            image_url: 'https://example.com/token.png',
            decimals: 8,
            total_supply: '500000000000000',
            price_usd: '0.5',
            fdv_usd: '250000',
            total_reserve_in_usd: '100000',
            volume_usd: { h24: '50000' },
            market_cap_usd: '200000',
          },
        },
      }

      const result = CoinGeckoHelper._parseToken(response, NetworksEnum.ethereumMainnet)

      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TT')
      expect(result.decimals).to.eq(8)
      expect(result.priceUsd).to.eq('0.5')
      expect(result.totalSupply).to.eq('500000000000000')
      expect(result.type).to.eq(ITokenType.ERC20)
      expect(result.logo).to.eq('https://example.com/token.png')
    })

    it('should handle missing optional fields with defaults', () => {
      const response = {
        data: {
          id: 'token-id',
          type: 'token',
          attributes: {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            name: '',
            symbol: '',
            image_url: '',
            decimals: 0,
            total_supply: '',
            price_usd: '',
            fdv_usd: '',
            total_reserve_in_usd: '',
            volume_usd: { h24: '' },
            market_cap_usd: null,
          },
        },
      }

      const result = CoinGeckoHelper._parseToken(response, NetworksEnum.ethereumMainnet)

      expect(result.name).to.eq('')
      expect(result.symbol).to.eq('')
      expect(result.decimals).to.eq(18)
      expect(result.priceUsd).to.eq('0')
      expect(result.totalSupply).to.eq('0')
    })
  })
})
