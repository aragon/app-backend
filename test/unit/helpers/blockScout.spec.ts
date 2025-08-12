import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { ITokenType, NetworksEnum } from '@types'
import axios from 'axios'
import logger from '@logger'
import config from '@config'

describe('Helpers: BlockScout', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
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

  describe('_fetchERC20Transfers', () => {
    const address = '0x1234567890abcdef'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch ERC20 transfers successfully', async () => {
      const mockResponse = {
        items: [
          {
            transaction_hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1', is_scam: false },
            to: { hash: '0xto1', is_scam: false },
            total: { value: '1000000000000000000' },
            token: {
              address: '0xtoken1',
              name: 'Test Token',
              symbol: 'TT',
              decimals: 18,
            },
            log_index: 1,
            type: 'token_transfer',
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchERC20Transfers(address, network)

      expect(rpCallStub.calledOnce).to.be.true
      expect(rpCallStub.calledWith(`addresses/${address}/token-transfers`, sinon.match.object, network)).to.be.true
      expect(result).to.have.length(1)
      expect(result[0]).to.deep.include({
        hash: '0xhash1',
        blockNumber: '18000000',
        from: '0xfrom1',
        to: '0xto1',
        value: '1000000000000000000',
        contractAddress: '0xtoken1',
        category: 'erc20',
      })
    })

    it('should filter out scam transfers', async () => {
      const mockResponse = {
        items: [
          {
            transaction_hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1', is_scam: true },
            to: { hash: '0xto1', is_scam: false },
            total: { value: '1000000000000000000' },
            token: { address: '0xtoken1', name: 'Test Token', symbol: 'TT', decimals: 18 },
            log_index: 1,
            type: 'token_transfer',
          },
        ],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchERC20Transfers(address, network)

      expect(result).to.have.length(0)
    })

    it('should handle pagination', async () => {
      const firstResponse = {
        items: [
          {
            transaction_hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1', is_scam: false },
            to: { hash: '0xto1', is_scam: false },
            total: { value: '1000000000000000000' },
            token: { address: '0xtoken1', name: 'Test Token', symbol: 'TT', decimals: 18 },
            log_index: 1,
            type: 'token_transfer',
          },
        ],
        next_page_params: { page: 2 },
      }

      const secondResponse = {
        items: [
          {
            transaction_hash: '0xhash2',
            block_number: 18000001,
            timestamp: '2023-01-01T01:00:00Z',
            from: { hash: '0xfrom2', is_scam: false },
            to: { hash: '0xto2', is_scam: false },
            total: { value: '2000000000000000000' },
            token: { address: '0xtoken2', name: 'Test Token 2', symbol: 'TT2', decimals: 18 },
            log_index: 2,
            type: 'token_transfer',
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall')
      rpCallStub.onFirstCall().resolves(firstResponse)
      rpCallStub.onSecondCall().resolves(secondResponse)

      const result = await BlockScoutHelper._fetchERC20Transfers(address, network)

      expect(rpCallStub.callCount).to.equal(2)
      expect(result).to.have.length(2)
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(BlockScoutHelper, '_rpCall').rejects(new Error('API Error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutHelper._fetchERC20Transfers(address, network)

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('_fetchTxList', () => {
    const address = '0x1234567890abcdef'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch ETH transactions successfully', async () => {
      const mockResponse = {
        items: [
          {
            hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1' },
            to: { hash: '0xto1' },
            value: '1000000000000000000',
            position: 1,
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchTxList(address, network)

      expect(rpCallStub.calledOnce).to.be.true
      expect(rpCallStub.calledWith(`addresses/${address}/transactions`, sinon.match.object, network)).to.be.true
      expect(result).to.have.length(1)
      expect(result[0]).to.deep.include({
        hash: '0xhash1',
        blockNumber: '18000000',
        from: '0xfrom1',
        to: '0xto1',
        value: '1000000000000000000',
        category: 'external',
        tokenDecimals: '18',
      })
    })

    it('should filter out zero value transactions', async () => {
      const mockResponse = {
        items: [
          {
            hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1' },
            to: { hash: '0xto1' },
            value: '0',
            position: 1,
          },
        ],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchTxList(address, network)

      expect(result).to.have.length(0)
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(BlockScoutHelper, '_rpCall').rejects(new Error('API Error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutHelper._fetchTxList(address, network)

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('_fetchInternalTxs', () => {
    const address = '0x1234567890abcdef'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch internal transactions successfully', async () => {
      const mockResponse = {
        items: [
          {
            transaction_hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1' },
            to: { hash: '0xto1' },
            value: '1000000000000000000',
            type: 'call',
            index: 1,
          },
        ],
        next_page_params: null,
      }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchInternalTxs(address, network)

      expect(rpCallStub.calledOnce).to.be.true
      expect(rpCallStub.calledWith(`addresses/${address}/internal-transactions`, sinon.match.object, network)).to.be
        .true
      expect(result).to.have.length(1)
      expect(result[0]).to.deep.include({
        hash: '0xhash1',
        blockNumber: '18000000',
        from: '0xfrom1',
        to: '0xto1',
        value: '1000000000000000000',
        category: 'internal',
        tokenDecimals: '18',
      })
    })

    it('should filter out non-call type transactions', async () => {
      const mockResponse = {
        items: [
          {
            transaction_hash: '0xhash1',
            block_number: 18000000,
            timestamp: '2023-01-01T00:00:00Z',
            from: { hash: '0xfrom1' },
            to: { hash: '0xto1' },
            value: '1000000000000000000',
            type: 'create',
            index: 1,
          },
        ],
        next_page_params: null,
      }

      sandbox.stub(BlockScoutHelper, '_rpCall').resolves(mockResponse)

      const result = await BlockScoutHelper._fetchInternalTxs(address, network)

      expect(result).to.have.length(0)
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(BlockScoutHelper, '_rpCall').rejects(new Error('API Error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutHelper._fetchInternalTxs(address, network)

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
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
      expect(rpCallStub.calledWith(`addresses/${address}/tokens`, sinon.match.object, network)).to.be.true
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
