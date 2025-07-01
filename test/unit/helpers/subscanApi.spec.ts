import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import Subscan from '@helpers/subscanApi'
import axios from 'axios'
import logger from '@logger'
import { NetworksEnum, ITokenType } from '@types'
import utils from '@helpers/utils'
import dayjs from '@helpers/dayjs'

describe('Helpers:Subscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
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
      expect(result.totalHolders).to.eq(10)
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
      expect(result.totalHolders).to.eq(0)
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
      expect(result.totalHolders).to.eq(10)
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
      expect(result.totalHolders).to.eq(10)
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
      expect(result.totalHolders).to.eq(10)
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

  describe('getAssetTransfer', () => {
    it('should return asset transfers from native and ERC20', async () => {
      const daoAddress = '0x558c9997f8d382f02dfce79e275af637d8bb19e6'
      const substrateAddress = 'substrateAddress' // Stub getAccountInfoByKey to return a substrate address.
      const getAccountInfoByKeyStub = sandbox.stub(Subscan, 'getAccountInfoByKey').resolves(substrateAddress)

      // Native transfers response.
      const nativeResponse = {
        data: {
          transfers: [
            {
              block_num: 180,
              from_account_display: { evm_address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
              to_account_display: { evm_address: null },
              transfer_id: 'id1',
              block_timestamp: 'timestamp1',
              amount: '50',
              hash: 'txHash1',
              name: 'test',
              symbol: 'test',
            },
            {
              block_num: 180,
              from_account_display: { evm_address: daoAddress },
              to_account_display: { evm_address: null },
              transfer_id: 'id2',
              block_timestamp: 'timestamp2',
              amount: '500',
              hash: 'txHash2',
              name: 'ETH',
              symbol: 'ETH',
            },
          ],
        },
      }
      // ERC20 transfers response.
      const erc20Response = {
        data: {
          list: [
            {
              hash: 'txHash2',
              from: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              to: '0xc12aAA39b223fE8D0a0E5C4f27EaD9083c756Cc2',
              id: 'id2',
              value: '200',
              contract: '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5',
              name: 'test',
              symbol: 'test',
              decimals: 18,
            },
          ],
        },
      }
      const rpCallStub = sandbox.stub(Subscan, '_rpCall')
      rpCallStub.onCall(0).resolves(nativeResponse)
      rpCallStub.onCall(1).resolves(erc20Response)
      const txInfo = { block_num: 150, block_timestamp: 'timestamp2' }
      const getTxStub = sandbox.stub(Subscan, 'getTransactionInfoByHash').resolves(txInfo)

      const result = await Subscan.getAssetTransfer(daoAddress, NetworksEnum.peaqMainnet)
      expect(result[0]).to.deep.include({
        blockNum: 180,
        from: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        to: '0x0000000000000000000000000000000000000000',
        uniqueId: 'id1',
        blockTimestamp: 'timestamp1',
        value: '50',
        hash: 'txHash1',
        category: 'external',
      })
      expect(result[1]).to.deep.eq({
        blockNum: 150,
        from: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        to: '0xc12aAA39b223fE8D0a0E5C4f27EaD9083c756Cc2',
        uniqueId: 'id2',
        blockTimestamp: 'timestamp2',
        value: '200',
        hash: 'txHash2',
        category: 'erc20',
        rawContract: {
          value: '200',
          address: '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5',
          name: 'test',
          symbol: 'test',
          priceUsd: '0',
          decimals: 18,
        },
      })
      expect(getAccountInfoByKeyStub.calledOnce).to.be.true
      expect(rpCallStub.callCount).to.equal(2)
      expect(getTxStub.calledOnce).to.be.true
    })

    it('should return empty array if no substrate address', async () => {
      const getAccountInfoByKeyStub = sandbox.stub(Subscan, 'getAccountInfoByKey').resolves(undefined)
      const result = await Subscan.getAssetTransfer('0x1234567890', NetworksEnum.peaqMainnet)
      expect(result).to.deep.eq([])
      expect(getAccountInfoByKeyStub.calledOnce).to.be.true
    })

    it('should log error when native transfer list fetch failed', async () => {
      const substrateAddress = 'substrateAddress'
      const getAccountInfoByKeyStub = sandbox.stub(Subscan, 'getAccountInfoByKey').resolves(substrateAddress)
      const error = new Error('RPC Call Failed')
      sandbox.stub(Subscan, '_rpCall').rejects(error)

      await expect(Subscan.getAssetTransfer('0x1234567890', NetworksEnum.peaqMainnet)).to.be.rejectedWith(
        'RPC Call Failed',
      )
      expect(getAccountInfoByKeyStub.calledOnce).to.be.true
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
        totalHolders: 100,
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
        totalHolders: 0,
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

  describe('getAllTokenHolders', () => {
    const tokenAddress = '0x5c3126bfb9a68a7021d461230127470b3824886b'
    const network = NetworksEnum.peaqMainnet

    beforeEach(() => {
      sandbox.stub(utils, 'wait').resolves()
    })

    it('should fetch token holders successfully', async () => {
      // Stub the getTokenHoldersPage method
      const getPageStub = sandbox.stub(Subscan, 'getTokenHoldersPage')
      getPageStub.onCall(0).resolves({
        holders: [
          { address: '0xaddress1', value: '1000000000000000000' },
          { address: '0xaddress2', value: '2000000000000000000' },
        ],
        total: 5,
      })
      getPageStub.onCall(1).resolves({
        holders: [
          { address: '0xaddress3', value: '3000000000000000000' },
          { address: '0xaddress4', value: '4000000000000000000' },
        ],
        total: 5,
      })
      getPageStub.onCall(2).resolves({
        holders: [{ address: '0xaddress5', value: '5000000000000000000' }],
        total: 5,
      })

      const result = await Subscan.getAllTokenHolders(tokenAddress, network, {
        pageSize: 2,
        delayMs: 0,
        startPage: 0,
      })

      expect(getPageStub.callCount).to.equal(3)
      expect(result.holders.length).to.equal(5)
      expect(result.total).to.equal(5)
      expect(result.hasMore).to.be.false

      expect(result.holders[0].address).to.equal('0xaddress1')
      expect(result.holders[0].value).to.equal('1000000000000000000')
      expect(result.holders[4].address).to.equal('0xaddress5')
    })

    it('should use callback function with page info when provided', async () => {
      const pageResult = {
        holders: [
          { address: '0xaddress1', value: '1000000000000000000' },
          { address: '0xaddress2', value: '2000000000000000000' },
        ],
        total: 2,
      }

      const getPageStub = sandbox.stub(Subscan, 'getTokenHoldersPage').resolves(pageResult)
      const callbackSpy = sandbox.spy()

      const result = await Subscan.getAllTokenHolders(
        tokenAddress,
        network,
        { pageSize: 10, delayMs: 0, startPage: 0 },
        callbackSpy,
      )

      expect(getPageStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(2)

      expect(callbackSpy.callCount).to.equal(1)
      expect(callbackSpy.firstCall.args[0]).to.deep.equal(pageResult.holders)
      expect(callbackSpy.firstCall.args[1]).to.have.property('currentPage')
      expect(callbackSpy.firstCall.args[1]).to.have.property('isLastPage')
      expect(callbackSpy.firstCall.args[1]).to.have.property('total')
    })

    it('should respect the startPage parameter', async () => {
      const getPageStub = sandbox.stub(Subscan, 'getTokenHoldersPage')
      getPageStub
        .onCall(0)
        .resolves({
          holders: [
            { address: '0xaddress1', value: '1000000000000000000' },
            { address: '0xaddress2', value: '2000000000000000000' },
          ],
          total: 2,
        })
        .onCall(1)
        .resolves({
          holders: [{ address: '0xaddress3', value: '300000000000000000' }],
          total: 1,
        })

      const result = await Subscan.getAllTokenHolders(tokenAddress, network, {
        startPage: 5,
        delayMs: 0,
        pageSize: 2,
      })

      expect(getPageStub.firstCall.args[2]).to.equal(5)
      expect(result.lastPage).to.equal(6)
    })
  })

  describe('getTokenHoldersPage', () => {
    const tokenAddress = '0x6c3126bfb9a68a7021d461230127470b3824886b'
    const network = NetworksEnum.peaqMainnet

    it('should fetch a single page of token holders', async () => {
      const response = {
        code: 0,
        message: 'Success',
        data: {
          count: 2,
          list: [
            { holder: '0x5c3126bfb9a68a7021d461230127470b3824886b', balance: '1000000000000000000' },
            { holder: '0x5c3126bfb9a68a7021d461230127470b3824886e', balance: '2000000000000000000' },
          ],
        },
      }

      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)

      const result = await Subscan.getTokenHoldersPage(tokenAddress, network, 0, 2)

      expect(rpCallStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(2)
      expect(result.total).to.equal(2)
      expect(result.holders[0].address).to.equal('0x5c3126bfB9A68a7021d461230127470b3824886B')
    })

    it('should handle empty results', async () => {
      const response = {
        code: 0,
        message: 'Success',
        data: {
          count: 0,
          list: [],
        },
      }

      const rpCallStub = sandbox.stub(Subscan, '_rpCall').resolves(response)

      const result = await Subscan.getTokenHoldersPage(tokenAddress, network, 0, 10)

      expect(rpCallStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(0)
      expect(result.total).to.equal(0)
    })

    it('should handle API errors', async () => {
      const apiError = new Error('API failure')
      const rpCallStub = sandbox.stub(Subscan, '_rpCall').rejects(apiError)
      const logErrorStub = sandbox.stub(logger, 'error')

      const result = await Subscan.getTokenHoldersPage(tokenAddress, network, 0, 10)

      expect(rpCallStub.callCount).to.equal(1)
      expect(result.holders.length).to.equal(0)
      expect(result.total).to.equal(0)
      expect(logErrorStub.called).to.be.true
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
        totalHolders: 50,
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
        totalHolders: 25,
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
        totalHolders: 30,
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
})
