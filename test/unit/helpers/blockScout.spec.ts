import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { NetworksEnum } from '@types'
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

  it('should get axios instance', async () => {
    const stubAxios = sandbox.stub(axios, 'create')
    BlockScoutHelper.axiosInstance(NetworksEnum.ethereumMainnet)
    expect(stubAxios.calledOnce).to.be.true
  })

  describe('_rpCall', () => {
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
      const loggerStub = sandbox.stub(logger, 'error')

      try {
        await BlockScoutHelper._rpCall('tokens/0x1234567890', { apikey: 'valid-api-key' }, NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }
    })
  })

  describe('getTokenFullDetails', () => {
    it('Should get token full details', async () => {
      const expectedResult = {
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        total_supply: '1000000000000000000000',
        holders: 1,
        icon_url: 'https://example.com/logo.png',
        type: 'ERC20',
      }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getTokenFullDetails('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        totalSupply: '1000000000000000000000',
        holders: 1,
        logo: 'https://example.com/logo.png',
        type: 'ERC20',
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
    it('Should get contract source code', async () => {
      const expectedResult = { code: 1 }
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').resolves(expectedResult)
      const result = await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq(expectedResult)
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
      const expectedResult = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(BlockScoutHelper, '_rpCall').rejects(expectedResult)
      const loggerStub = sandbox.stub(logger, 'warn')
      try {
        await BlockScoutHelper.getContractSourceCode('0x1234567890', NetworksEnum.ethereumMainnet)
      } catch (error) {
        expect(error).to.eq(expectedResult)
        expect(loggerStub.calledOnce).to.be.true
      }

      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'smart-contracts/0x1234567890',
          { apikey: config.NODES.ETHEREUM_MAINNET.BLOCKSCOUT_API_KEY },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(loggerStub.calledWith('Error getContractSourceCode' as any)).to.be.true
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
})
