import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { ITokenType, NetworksEnum } from '@types'
import axios from 'axios'
import logger from '@logger'
import config from '@config'
import utils from '@helpers/utils'

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

  describe('getContractSourceCode', () => {
    it('Should get contract source code (happy path)', async () => {
      const expectedResult = { abi: [{ constant: 1 }], source_code: '<<>>', name: 'PluginRepo' }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)

      const result = await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq([
        {
          SourceCode: '<<>>',
          ContractName: 'PluginRepo',
          ABI: '[{"constant":1}]',
        },
      ])
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'smart-contracts/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getContractSourceCode', async () => {
      const expectedError = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)
      // We expect the function to catch and log the error, returning null instead of re-throwing
      expect(result).to.be.null
      expect(rpCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getContractSourceCode' as any)).to.be.true
    })

    it('should call searchDetails and re-fetch if the initial source_code is null and the contract is verified', async () => {
      // 1st call to _rpCall returns no source_code
      const initialResponse = { source_code: null, name: '' }
      // searchDetails indicates a verified contract
      const searchDetailsResponse = { is_smart_contract_verified: true, name: 'PluginRepo' }
      // 2nd call to _rpCall (after the search) returns a proper response
      const verifiedResponse = { source_code: '<<>>', name: 'PluginRepo', abi: [{ constant: 1 }] }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall')
      rpCallStub.onFirstCall().resolves(initialResponse)
      rpCallStub.onSecondCall().resolves(verifiedResponse)

      const searchDetailsStub = sandbox.stub(BlockScoutHelper, 'searchDetails').resolves(searchDetailsResponse)

      const result = await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)

      expect(searchDetailsStub.calledOnce).to.be.true
      expect(searchDetailsStub.calledWith('0x1234567890', NetworksEnum.ethereumMainnet)).to.be.true
      expect(rpCallStub.callCount).to.equal(2) // Called twice: initial fetch and re-fetch
      expect(result).to.deep.eq([
        {
          SourceCode: '<<>>',
          ContractName: 'PluginRepo',
          ABI: '[{"constant":1}]',
        },
      ])
    })

    it('should return null if search indicates no verified contract', async () => {
      // 1st call to _rpCall returns no source_code
      const initialResponse = { source_code: null, name: '' }
      // searchDetails says it's NOT verified
      const searchDetailsResponse = { is_smart_contract_verified: false, name: '' }

      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(initialResponse)
      const searchDetailsStub = sandbox.stub(BlockScoutHelper, 'searchDetails').resolves(searchDetailsResponse)

      const result = await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)

      expect(searchDetailsStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
      expect(result).to.be.null
    })
  })

  describe('getContractProxyDetails', () => {
    it('Should get contract proxy details', async () => {
      const expectedResult = {
        items: [
          {
            address: {
              hash: '0x1234567890',
              name: 'proxy',
              implementations: [
                {
                  hash: '0ximplementation',
                  name: 'implementation',
                },
              ],
            },
          },
        ],
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getContractProxyDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        proxy: {
          name: 'proxy',
          address: '0x1234567890',
        },
        implementation: {
          name: 'implementation',
          address: '0ximplementation',
        },
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'smart-contracts',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY, q: '0x1234567890' },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should return proxy null if the contract does not have implementations', async () => {
      const expectedResult = {
        items: [
          {
            address: {
              hash: '0x1234567890',
              name: 'implementation',
              implementations: [],
            },
          },
        ],
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getContractProxyDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        proxy: {
          name: null,
          address: null,
        },
        implementation: {
          name: 'implementation',
          address: '0x1234567890',
        },
      })
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'smart-contracts',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY, q: '0x1234567890' },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getContractProxyDetails', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.getContractProxyDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'smart-contracts',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY, q: '0x1234567890' },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error getContractProxy' as any)).to.be.true
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

  describe.only('getAllTokenHolders', () => {
    const tokenAddress = '0x1111111111166b7FE7bd91427724B487980aFc69'
    const network = NetworksEnum.baseMainnet

    beforeEach(() => {
      sandbox.stub(utils, 'wait').resolves()
    })

    it('should fetch token holders successfully', async () => {
      // Mock successful responses for multiple pages
      const page1Response = {
        data: {
          message: 'OK',
          result: [
            { address: '0xaddress1', value: '1000000000000000000' },
            { address: '0xaddress2', value: '2000000000000000000' },
          ],
        },
      }

      const page2Response = {
        data: {
          message: 'OK',
          result: [
            { address: '0xaddress3', value: '3000000000000000000' },
            { address: '0xaddress4', value: '4000000000000000000' },
          ],
        },
      }

      // Last page with fewer results (to test the end of pagination)
      const page3Response = {
        data: {
          message: 'OK',
          result: [{ address: '0xaddress5', value: '5000000000000000000' }],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get')
      axiosStub.onCall(0).resolves(page1Response)
      axiosStub.onCall(1).resolves(page2Response)
      axiosStub.onCall(2).resolves(page3Response)

      const result = await BlockScoutHelper.getAllTokenHolders(tokenAddress, network, {
        pageSize: 2,
        maxPages: 10,
        delayMs: 0,
      })

      expect(axiosStub.callCount).to.equal(3)
      expect(result.holders.length).to.equal(5)
      expect(result.total).to.equal(5)
      expect(result.hasMore).to.be.false

      // Verify the holders were mapped correctly
      expect(result.holders[0].address).to.equal('0xaddress1')
      expect(result.holders[0].value).to.equal('1000000000000000000')
      expect(result.holders[4].address).to.equal('0xaddress5')
    })

    it('should handle API errors gracefully', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const axiosStub = sandbox.stub(axios, 'get').rejects(new Error('API failure'))

      const result = await BlockScoutHelper.getAllTokenHolders(tokenAddress, network)

      expect(errorStub.calledOnce).to.be.true
      expect(axiosStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(0)
      expect(result.total).to.equal(0)
      expect(result.hasMore).to.be.false
    })

    it('should return empty results when BlockScout API is not configured', async () => {
      // Force the network config to not have a BlockScout URL
      const loggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(BlockScoutHelper, '_parseNetworkToConfig').returns({
        BLOCKSCOUT_API_KEY: 'some-key',
      })

      const result = await BlockScoutHelper.getAllTokenHolders(tokenAddress, network)

      expect(loggerStub.calledOnce).to.be.true
      expect(result.holders.length).to.equal(0)
      expect(result.total).to.equal(0)
      expect(result.hasMore).to.be.false
    })

    it('should handle empty or invalid responses', async () => {
      // Empty result array
      const emptyResponse = {
        data: {
          message: 'OK',
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(emptyResponse)

      const result = await BlockScoutHelper.getAllTokenHolders(tokenAddress, network)

      expect(axiosStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(0)
      expect(result.total).to.equal(0)
      expect(result.hasMore).to.be.false
    })

    it('should stop fetching when max pages limit is reached', async () => {
      // Create mock responses for maxPages+1 pages (all with full results)
      const fullPageResponse = {
        data: {
          message: 'OK',
          result: Array(10)
            .fill(0)
            .map((_, i) => ({
              address: `0xaddress${i}`,
              value: `${i}000000000000000000`,
            })),
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(fullPageResponse)

      // Set maxPages to 3
      const result = await BlockScoutHelper.getAllTokenHolders(tokenAddress, network, {
        pageSize: 10,
        maxPages: 3,
        delayMs: 0,
      })

      // Should stop after 3 pages
      expect(axiosStub.callCount).to.equal(3)
      expect(result.holders.length).to.equal(30) // 3 pages × 10 results
      expect(result.hasMore).to.be.true // Indicates there might be more data
    })
  })
})
