import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { ITokenType, NetworksEnum } from '@types'
import axios from 'axios'
import logger from '@logger'
import config from '@config'
import * as retryRequestModule from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

describe('Helpers: BlockScout', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Stub retryRequest to execute immediately without retries
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    // Stub BottleneckModule to execute immediately without rate limiting
    sandbox.stub(BottleneckModule, 'getBlockScoutLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('parseTokenType', async () => {
    expect(BlockScoutHelper.parseTokenType(ITokenType.unknown)).to.eq(ITokenType.unknown)
    expect(BlockScoutHelper.parseTokenType('ERC-20')).to.eq(ITokenType.ERC20)
    expect(BlockScoutHelper.parseTokenType('ERC-721')).to.eq(ITokenType.ERC721)
    expect(BlockScoutHelper.parseTokenType('ERC-1155')).to.eq(ITokenType.ERC1155)
    expect(BlockScoutHelper.parseTokenType(ITokenType.native)).to.eq(ITokenType.unknown)
  })

  it('should get axios instance', async () => {
    const stubAxios = sandbox.stub(axios, 'create')
    BlockScoutHelper.axiosInstance(NetworksEnum.ethereumMainnet)
    expect(stubAxios.calledOnce).to.be.true
  })

  describe('_rpCall', () => {
    it('should return null if network is not configured', async () => {
      const loggerStub = sandbox.stub(logger, 'warn')
      const result = await BlockScoutHelper._rpCall('tokens/0x1234567890', { apikey: 'valid-api-key' }, 'test' as any)
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('BlockScout API is not configured' as any)).to.be.true
    })

    it('Should make a successful _rpCall', async () => {
      const expectedResult = { data: { result: 1 } }
      const getCall = sandbox.stub().resolves(expectedResult)
      const axiosInstanceStub = sandbox.stub(BlockScoutHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)

      const result = await BlockScoutHelper._rpCall(
        'tokens/0x1234567890',
        { apikey: 'valid-api-key' },
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.deep.eq(expectedResult.data)
      expect(axiosInstanceStub.calledOnce).to.be.true
      expect(getCall.calledOnce).to.be.true
      expect(
        getCall.calledWith('v2/tokens/0x1234567890', {
          params: { apikey: 'valid-api-key' },
        }),
      ).to.be.true
    })

    it('Should handle errors in _rpCall', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getCall = sandbox.stub().rejects(expectedResult)
      sandbox.stub(BlockScoutHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)
      const loggerStub = sandbox.stub(logger, 'warn')

      try {
        await BlockScoutHelper._rpCall('tokens/0x1234567890', { apikey: 'valid-api-key' }, NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }
    })
  })

  describe('getTokenFullDetails', () => {
    let tokenDetails: any
    beforeEach(() => {
      tokenDetails = {
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        exchange_rate: '1',
        decimals: 18,
        total_supply: '1000000000000000000000',
        holders: 1,
        icon_url: 'https://example.com/logo.png',
        type: 'ERC-20',
      }
    })

    it('Should handle address_hash field from response', async () => {
      const tokenDetailsWithAddressHash = {
        address_hash: '0xabc123',
        name: 'Test Token',
        symbol: 'TT',
        exchange_rate: '2',
        decimals: 8,
        total_supply: '2000000000000000000000',
        holders_count: 100,
        icon_url: 'https://example.com/logo2.png',
        type: 'ERC-20',
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetailsWithAddressHash)
      const result = await BlockScoutHelper.getTokenFullDetails('0xabc123', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0xabc123',
        name: 'Test Token',
        symbol: 'TT',
        priceUsd: '2',
        decimals: 8,
        totalSupply: '2000000000000000000000',
        totalHolders: 100,
        logo: 'https://example.com/logo2.png',
        type: ITokenType.ERC20,
      })
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('Should handle holders_count field from response', async () => {
      const tokenDetailsWithHoldersCount = {
        address: '0xdef456',
        name: 'Test Token 2',
        symbol: 'TT2',
        exchange_rate: '3',
        decimals: 6,
        total_supply: '3000000000000000000000',
        holders_count: 50,
        icon_url: 'https://example.com/logo3.png',
        type: 'ERC-721',
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetailsWithHoldersCount)
      const result = await BlockScoutHelper.getTokenFullDetails('0xdef456', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0xdef456',
        name: 'Test Token 2',
        symbol: 'TT2',
        priceUsd: '3',
        decimals: 6,
        totalSupply: '3000000000000000000000',
        totalHolders: 50,
        logo: 'https://example.com/logo3.png',
        type: ITokenType.ERC721,
      })
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('Should return null when response has no address fields', async () => {
      const invalidResponse = {
        name: 'Test Token',
        symbol: 'TT',
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(invalidResponse)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('Should get token full details', async () => {
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetails)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        priceUsd: '1',
        decimals: 18,
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
        logo: 'https://example.com/logo.png',
        type: ITokenType.ERC20,
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should parse when token type is ERC-721', async () => {
      tokenDetails.type = 'ERC-721'
      tokenDetails.decimals = 0
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetails)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        decimals: 0,
        priceUsd: '1',
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
        logo: 'https://example.com/logo.png',
        type: ITokenType.ERC721,
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should parse when token type is ERC20', async () => {
      tokenDetails.type = 'ERC-20'
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetails)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        priceUsd: '1',
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
        logo: 'https://example.com/logo.png',
        type: ITokenType.ERC20,
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should parse when token type is ERC1155', async () => {
      tokenDetails.type = 'ERC-1155'
      tokenDetails.decimals = 0
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(tokenDetails)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        decimals: 0,
        priceUsd: '1',
        totalSupply: '1000000000000000000000',
        totalHolders: 1,
        logo: 'https://example.com/logo.png',
        type: ITokenType.ERC1155,
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getTokenFullDetails', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error getTokenDetails' as any)).to.be.true
    })
  })

  describe('getTokenCounters', () => {
    it('Should get token counters', async () => {
      const expectedResult = { transfers_count: 1, token_holders_count: 1 }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getTokenCounters('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({ transfers: 1, holders: 1 })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890/counters',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getTokenCounters', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.getTokenCounters('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'tokens/0x1234567890/counters',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error getTokenCounters' as any)).to.be.true
    })
  })

  describe('searchDetails', () => {
    it('Should search details of token or symbol', async () => {
      const expectedResult = { items: [{ address: '0x1234567890' }] }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.searchDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq(expectedResult.items[0])
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'search',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY, q: '0x1234567890' },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in searchDetails', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.searchDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'search',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY, q: '0x1234567890' },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error searchDetails' as any)).to.be.true
    })
  })

  describe('getTransactionOfAnAddress', () => {
    it('Should get transaction of an address', async () => {
      const expectedResult = { items: [{ hash: '0x1234567890', block_number: 123232 }] }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getTransactionOfAnAddress('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq([{ txHash: '0x1234567890', blockNumber: 123232 }])
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          `addresses/0x1234567890/transactions`,
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getTransactionOfAnAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.getTransactionOfAnAddress('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          `addresses/0x1234567890/transactions`,
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error getTransactionOfAnAddress' as any)).to.be.true
    })
  })

  describe('getTokenBalances', () => {
    const address = '0x1234567890abcdef'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch token balances successfully', async () => {
      const mockResponse = {
        items: [
          {
            token: {
              address: '0xtoken1',
              name: 'Test Token 1',
              symbol: 'TT1',
              decimals: '18',
              type: 'ERC-20',
            },
            value: '1000000000000000000',
          },
          {
            token: {
              address: '0xtoken2',
              name: 'Test Token 2',
              symbol: 'TT2',
              decimals: '6',
              type: 'ERC-20',
            },
            value: '500000',
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(rpCallStub.calledOnce).to.be.true
      const [endpoint, params, networkArg] = rpCallStub.firstCall.args
      expect(endpoint).to.equal(`addresses/${address}/tokens`)
      expect(params).to.be.an('object')
      expect(networkArg).to.equal(network)
      expect(result).to.have.length(2)
      expect(result[0]).to.deep.include({
        contractAddress: '0xtoken1',
        tokenBalance: '1000000000000000000',
        tokenName: 'Test Token 1',
        tokenSymbol: 'TT1',
        tokenDecimals: '18',
        tokenType: 'ERC-20',
      })
      expect(result[1]).to.deep.include({
        contractAddress: '0xtoken2',
        tokenBalance: '500000',
        tokenName: 'Test Token 2',
        tokenSymbol: 'TT2',
        tokenDecimals: '6',
        tokenType: 'ERC-20',
      })
    })

    it('should filter out zero balance tokens', async () => {
      const mockResponse = {
        items: [
          {
            token: {
              address: '0xtoken1',
              name: 'Test Token 1',
              symbol: 'TT1',
              decimals: '18',
              type: 'ERC-20',
            },
            value: '0',
          },
          {
            token: {
              address: '0xtoken2',
              name: 'Test Token 2',
              symbol: 'TT2',
              decimals: '6',
              type: 'ERC-20',
            },
            value: '500000',
          },
        ],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(result).to.have.length(1)
      expect(result[0].contractAddress).to.equal('0xtoken2')
    })

    it('should handle pagination', async () => {
      const firstResponse = {
        items: [
          {
            token: {
              address: '0xtoken1',
              name: 'Test Token 1',
              symbol: 'TT1',
              decimals: '18',
              type: 'ERC-20',
            },
            value: '1000000000000000000',
          },
        ],
        next_page_params: { page: 2 },
      }

      const secondResponse = {
        items: [
          {
            token: {
              address: '0xtoken2',
              name: 'Test Token 2',
              symbol: 'TT2',
              decimals: '6',
              type: 'ERC-20',
            },
            value: '500000',
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall')
      rpCallStub.onFirstCall().resolves(firstResponse)
      rpCallStub.onSecondCall().resolves(secondResponse)

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(rpCallStub.callCount).to.equal(2)
      expect(result).to.have.length(2)
      expect(result[0].contractAddress).to.equal('0xtoken1')
      expect(result[1].contractAddress).to.equal('0xtoken2')
    })

    it('should handle empty results', async () => {
      const mockResponse = {
        items: [],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle ERC-721 and ERC-1155 tokens', async () => {
      const mockResponse = {
        items: [
          {
            token: {
              address: '0xnft1',
              name: 'NFT Collection',
              symbol: 'NFT',
              decimals: '0',
              type: 'ERC-721',
            },
            value: '1',
          },
          {
            token: {
              address: '0xnft2',
              name: 'Multi Token',
              symbol: 'MT',
              decimals: '0',
              type: 'ERC-1155',
            },
            value: '5',
          },
        ],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(result).to.have.length(2)
      expect(result[0].tokenType).to.equal('ERC-721')
      expect(result[1].tokenType).to.equal('ERC-1155')
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(BlockScoutHelper, '_rpCall').rejects(new Error('API Error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutHelper.getTokenBalances(address, network)

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error fetching token balances with native API' as any)).to.be.true
    })

    it('should include correct API parameters', async () => {
      const mockResponse = { items: [], next_page_params: null }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      await BlockScoutHelper.getTokenBalances(address, network)

      expect(rpCallStub.calledOnce).to.be.true
      const callArgs = rpCallStub.firstCall.args
      expect(callArgs[0]).to.equal(`addresses/${address}/tokens`)
      expect(callArgs[1]).to.deep.include({
        type: 'ERC-20,ERC-721,ERC-1155',
        apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY,
      })
      expect(callArgs[2]).to.equal(network)
    })
  })
})
