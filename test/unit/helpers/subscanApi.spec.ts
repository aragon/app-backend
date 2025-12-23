import dayjs from '@helpers/dayjs'
import * as retryRequestModule from '@helpers/retryRequest'
import Subscan from '@helpers/subscanApi'
import utils from '@helpers/utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { ISubScanTokenBalance, ITokenType, NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'

describe('Helpers:Subscan', () => {
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
    // Stub BottleneckModule rate limiter to execute immediately without delays
    sandbox.stub(BottleneckModule, 'getBlockScoutLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should get axios instance', async () => {
    const stubAxios = sandbox.stub(axios, 'create')
    Subscan.axiosInstance(NetworksEnum.peaqMainnet)
    expect(stubAxios.calledOnce).to.be.true
  })

  describe('_rpCall', () => {
    it('should make a successful _rpCall', async () => {
      const expectedResult = { data: { foo: 'bar' } }
      const postStub = sandbox.stub().resolves({ data: expectedResult.data })
      sandbox.stub(Subscan, 'axiosInstance').returns({ post: postStub } as any)

      const result = await Subscan._rpCall('testPath', { key: 'value' }, NetworksEnum.peaqMainnet, 'replacedPath')
      expect(result).to.deep.eq({ foo: 'bar' })
      expect(postStub.calledOnce).to.be.true
      expect(postStub.calledWith('replacedPath', { key: 'value' })).to.be.true
    })

    it('should handle errors in _rpCall', async () => {
      const error = new Error('RPC Call Failed')
      const postStub = sandbox.stub().rejects(error)
      sandbox.stub(Subscan, 'axiosInstance').returns({ post: postStub } as any)
      sandbox.stub(logger, 'warn')
      try {
        await Subscan._rpCall('testPath', { key: 'value' }, NetworksEnum.peaqMainnet)
      } catch (err) {
        expect(err).to.eq(error)
      }
    })
  })

  describe('getContractSourceCode', () => {
    it('should get contract source code (happy path)', async () => {
      const expectedResponse = {
        data: { source_code: '<<>>', abi: [{ constant: 1 }], contract_name: 'PluginRepo' },
      }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(expectedResponse)
      const result = await Subscan.getContractSourceCode('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq([
        {
          SourceCode: '<<>>',
          ABI: JSON.stringify([{ constant: 1 }]),
          ContractName: 'PluginRepo',
        },
      ])
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in getContractSourceCode', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getContractSourceCode('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.be.undefined
      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })
  })

  describe('fetchContractCreation', () => {
    it('should get contract creation infp', async () => {
      const expectedResponse = {
        data: {
          contract: '0x1234567890',
          transaction_hash: 'txHash',
          block_num: 100,
        },
      }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(expectedResponse)
      const result = await Subscan.fetchContractCreation('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq({
        address: '0x1234567890',
        transactionHash: 'txHash',
        blockNumber: 100,
      })
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in fetchContractCreation', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.fetchContractCreation('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.be.eq(null)
      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })
  })

  describe('getTokenFullDetails', () => {
    it('should return token details on successful response', async () => {
      const tokenInfo = {
        totalSupply: '1000',
        holders: 10,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        price: '1',
        category: 'erc20',
      }
      const response = { data: { list: [tokenInfo] } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)
      const result = await Subscan.getTokenFullDetails('0x1234567890', NetworksEnum.peaqMainnet)

      expect(result.address).to.eq('0x1234567890')
      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TT')
      expect(result.decimals).to.eq(18)
      expect(result.type).to.eq(ITokenType.ERC20)
      expect(result.logo).to.eq(null)
      expect(result.priceUsd).to.eq('1')
      expect(result.totalSupply).to.eq('1000')
      expect(result.holders).to.eq(10)
      expect(result.lastUpdatedAt).to.exist
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in getTokenFullDetails and return default details', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getTokenFullDetails('0x1234567890', NetworksEnum.peaqMainnet)

      expect(result.address).to.eq('0x1234567890')
      expect(result.name).to.eq(null)
      expect(result.symbol).to.eq(null)
      expect(result.decimals).to.eq(null)
      expect(result.type).to.eq(ITokenType.unknown)
      expect(result.logo).to.eq(null)
      expect(result.priceUsd).to.eq('0')
      expect(result.totalSupply).to.eq('0')
      expect(result.holders).to.eq(0)
      !expect(result.lastUpdatedAt).to.not.exist

      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })

    it('should get if the token is erc721', async () => {
      const tokenInfo = {
        totalSupply: '1000',
        holders: 10,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        price: '1',
        category: 'erc721',
      }
      const response = { data: { list: [tokenInfo] } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)
      const result = await Subscan.getTokenFullDetails('0x1234567890', NetworksEnum.peaqMainnet)

      expect(result.address).to.eq('0x1234567890')
      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TT')
      expect(result.decimals).to.eq(18)
      expect(result.type).to.eq(ITokenType.ERC721)
      expect(result.logo).to.eq(null)
      expect(result.priceUsd).to.eq('1')
      expect(result.totalSupply).to.eq('1000')
      expect(result.holders).to.eq(10)
      expect(result.lastUpdatedAt).to.exist
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should get if the token is erc1155', async () => {
      const tokenInfo = {
        totalSupply: '1000',
        holders: 10,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        price: '1',
        category: 'erc1155',
      }
      const response = { data: { list: [tokenInfo] } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)
      const result = await Subscan.getTokenFullDetails('0x1234567890', NetworksEnum.peaqMainnet)

      expect(result.address).to.eq('0x1234567890')
      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TT')
      expect(result.decimals).to.eq(18)
      expect(result.type).to.eq(ITokenType.ERC1155)
      expect(result.logo).to.eq(null)
      expect(result.priceUsd).to.eq('1')
      expect(result.totalSupply).to.eq('1000')
      expect(result.holders).to.eq(10)
      expect(result.lastUpdatedAt).to.exist
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should get if the token is unknown', async () => {
      const tokenInfo = {
        totalSupply: '1000',
        holders: 10,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        price: '1',
        category: 'unknown',
      }
      const response = { data: { list: [tokenInfo] } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)
      const result = await Subscan.getTokenFullDetails('0x1234567890', NetworksEnum.peaqMainnet)

      expect(result.address).to.eq('0x1234567890')
      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TT')
      expect(result.decimals).to.eq(18)
      expect(result.type).to.eq(ITokenType.unknown)
      expect(result.logo).to.eq(null)
      expect(result.priceUsd).to.eq('1')
      expect(result.totalSupply).to.eq('1000')
      expect(result.holders).to.eq(10)
      expect(result.lastUpdatedAt).to.exist
      expect(rpCallStub.calledOnce).to.be.true
    })
  })

  describe('getAccountBalance', () => {
    it('should return token balances if response contains native and ERC20', async () => {
      const responseData = {
        data: {
          native: {},
          ERC20: [
            {
              contract: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              balance: '100',
              decimals: 18,
              name: 'TokenA',
              symbol: 'TA',
            },
          ],
        },
      }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(responseData)
      const result = await Subscan.getAccountBalance('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq([
        {
          contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenBalance: '100',
          decimals: 18,
          name: 'TokenA',
          symbol: 'TA',
        },
      ])
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should return empty array if error in getAccountBalance', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getAccountBalance('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq([])
      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })
  })

  describe('getAccountInfoByKey', () => {
    it('should return substrate address if present', async () => {
      const responseData = {
        data: {
          account: { substrate_account: { address: 'substrateAddress' } },
        },
      }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(responseData)
      const result = await Subscan.getAccountInfoByKey(
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        NetworksEnum.peaqMainnet,
      )
      expect(result).to.eq('substrateAddress')
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in getAccountInfoByKey and return undefined', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getAccountInfoByKey('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.be.undefined
      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })
  })

  describe('getTransactionInfoByHash', () => {
    it('should return transaction info on successful response', async () => {
      const txResponse = { data: { block_num: 123, block_timestamp: 'time' } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(txResponse)
      const result = await Subscan.getTransactionInfoByHash('txHash', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq(txResponse.data)
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in getTransactionInfoByHash', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getTransactionInfoByHash('txHash', NetworksEnum.peaqMainnet)
      expect(result).to.be.undefined
      expect(rpCallStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
    })
  })

  describe('getNativeTokenInfo', () => {
    it('should return native token info on successful response', async () => {
      const responseData = {
        data: {
          token: {
            name: 'PEAQ',
            symbol: 'PEAQ',
            decimals: 18,
            total_supply: '1000000',
            holders: 100,
          },
        },
      }
      const getCurrentPriceStub = sandbox.stub(Subscan, 'getCurrentPrice').resolves('1')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(responseData)
      const result = await Subscan.getNativeTokenInfo(NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq({
        address: utils.zeroAddress,
        name: 'PEAQ',
        symbol: 'PEAQ',
        decimals: 18,
        logo: null,
        priceUsd: '1',
        type: ITokenType.native,
        totalSupply: '1000000',
        holders: 100,
      })
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors in getNativeTokenInfo and return default info', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getNativeTokenInfo(NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq({
        address: utils.zeroAddress,
        name: 'PEAQ',
        symbol: 'PEAQ',
        decimals: 18,
        logo: null,
        priceUsd: '0',
        type: ITokenType.native,
        totalSupply: '0',
        holders: 0,
      })
      expect(warnStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
    })
  })

  describe('getCurrentPrice', () => {
    it('should return current price on successful response', async () => {
      const responseData = { data: { list: [{ price: '0.5' }, { price: '1' }] } }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(responseData)
      const result = await Subscan.getCurrentPrice(NetworksEnum.peaqMainnet)
      const backDate = dayjs().subtract(Math.round(1), 'days').format('YYYY-MM-DD')
      expect(result).to.eq('1')
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'price/history',
          {
            start: backDate,
            end: dayjs().format('YYYY-MM-DD'),
            format: 'day',
            row: 1,
          },
          NetworksEnum.peaqMainnet,
        ),
      ).to.be.true
    })

    it('should handle errors in getCurrentPrice and return "0"', async () => {
      const error = new Error('RPC Call Failed')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await Subscan.getCurrentPrice(NetworksEnum.peaqMainnet)
      expect(result).to.eq('0')
      expect(warnStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
    })
  })

  describe('getTokenCounters', () => {
    const tokenAddress = '0x5c3126bfb9a68a7021d461230127470b3824886b'
    const network = NetworksEnum.peaqMainnet

    it('should return token counters on successful response', async () => {
      const tokenFullDetails = {
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        type: ITokenType.ERC20,
        logo: null,
        priceUsd: '1',
        totalSupply: '1000',
        holders: 50,
        lastUpdatedAt: new Date(),
      }

      const transferResponse = {
        code: 0,
        data: {
          count: 100,
          list: [
            {
              hash: 'txHash1',
              from: '0xaddress1',
              to: '0xaddress2',
              value: '1000',
              contract: tokenAddress,
            },
          ],
        },
      }

      const getTokenFullDetailsStub = sandbox.stub(Subscan, 'getTokenFullDetails').resolves(tokenFullDetails)
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(transferResponse)

      const result = await Subscan.getTokenCounters(tokenAddress, network)

      expect(result.transfers).to.eq(100)
      expect(result.holders).to.eq(50)
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.calledWith(tokenAddress, network)).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
      expect(
        rpCallStub.calledWith(
          'evm/token/transfer',
          {
            page: 0,
            row: 10,
            contract: tokenAddress,
          },
          network,
        ),
      ).to.be.true
    })

    it('should return zero counters when transfer response has no data', async () => {
      const tokenFullDetails = {
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        type: ITokenType.ERC20,
        logo: null,
        priceUsd: '1',
        totalSupply: '1000',
        holders: 25,
        lastUpdatedAt: new Date(),
      }

      const transferResponse = {
        code: 0,
        data: {
          count: 0,
          list: [],
        },
      }

      const getTokenFullDetailsStub = sandbox.stub(Subscan, 'getTokenFullDetails').resolves(tokenFullDetails)
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(transferResponse)

      const result = await Subscan.getTokenCounters(tokenAddress, network)

      expect(result.transfers).to.eq(0)
      expect(result.holders).to.eq(0)
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should return zero counters when transfer response code is not 0', async () => {
      const tokenFullDetails = {
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TT',
        decimals: 18,
        type: ITokenType.ERC20,
        logo: null,
        priceUsd: '1',
        totalSupply: '1000',
        holders: 30,
        lastUpdatedAt: new Date(),
      }

      const transferResponse = {
        code: 1,
        message: 'Error',
        data: null,
      }

      const getTokenFullDetailsStub = sandbox.stub(Subscan, 'getTokenFullDetails').resolves(tokenFullDetails)
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(transferResponse)

      const result = await Subscan.getTokenCounters(tokenAddress, network)

      expect(result.transfers).to.eq(0)
      expect(result.holders).to.eq(0)
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(rpCallStub.calledOnce).to.be.true
    })

    it('should handle errors and return zero counters', async () => {
      const error = new Error('API call failed')
      const getTokenFullDetailsStub = sandbox.stub(Subscan, 'getTokenFullDetails').rejects(error)
      const warnStub = sandbox.stub(logger, 'warn')

      const result = await Subscan.getTokenCounters(tokenAddress, network)

      expect(result.transfers).to.eq(0)
      expect(result.holders).to.eq(0)
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('SubscanApi getTokenCounters' as any)).to.be.true
    })
  })

  describe('getAccountBalances', () => {
    it('should get account balances and format them correctly', async () => {
      const mockTokens = [
        {
          tokenBalance: '1000000000000000000',
          decimals: 18,
          contractAddress: '0x1234567890123456789012345678901234567890',
          name: 'Token1',
          symbol: 'TK1',
        },
        {
          tokenBalance: '5000000',
          decimals: 6,
          contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          name: 'Token2',
          symbol: 'TK2',
        },
      ] as ISubScanTokenBalance[]

      const getAccountBalanceStub = sandbox.stub(Subscan, 'getAccountBalance').resolves(mockTokens)

      const result = await Subscan.getAccountBalances('0xUserAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.have.length(2)
      expect(result[0].tokenBalance).to.equal('1.0')
      expect(result[0].contractAddress).to.match(/^0x[A-Fa-f0-9]{40}$/)
      expect(result[1].tokenBalance).to.equal('5.0')
      expect(getAccountBalanceStub.calledOnce).to.be.true
    })
  })
})
