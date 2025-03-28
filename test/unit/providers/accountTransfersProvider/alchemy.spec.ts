import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import { AlchemyProvider } from '@providers/assetTransafersProvider/alchemyProvider'
import type Dao from '@models/schema/dao'
import { ITransactionType, NetworksEnum, ITransactionCategory, ITokenType } from '@types'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import Logger from '@logger'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
import logger from '@logger'

describe('Providers: AlchemyProvider', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getAssetTransfers', async () => {
    it('should call getAssetTransfers and create deposit and withdraw transactions', async () => {
      const daoRegistry: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const txLog: any = {
        hash: '0x123',
        category: ITransactionCategory.ERC20,
        uniqueId: 'unique-id',
        from: '0xfrom',
        to: '0xto',
        value: 1000,
        blockNum: 1,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [txLog] })
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      const formatLogStub = sandbox.stub(AlchemyProvider, 'formatTxLog').resolves(txLog)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })
      const stubCallback = sandbox.stub()
      await AlchemyProvider.getAssetTransfers(daoRegistry as Dao, stubCallback)

      expect(crawlStub.calledTwice).to.be.true
      expect(stubCallback.calledTwice).to.be.true
      expect(stubCallback.calledWith(txLog, ITransactionType.deposit, daoRegistry)).to.be.true
      expect(stubCallback.calledWith(txLog, ITransactionType.withdraw, daoRegistry)).to.be.true
      expect(formatLogStub.calledTwice).to.be.true
    })

    it('should call onDocument and handle errors', async () => {
      const daoRegistry: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [] }) // No transfers
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onError(new Error('fake-error'))
      })

      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubCallback = sandbox.stub()
      await AlchemyProvider.getAssetTransfers(daoRegistry as Dao, stubCallback)

      expect(crawlStub.calledTwice, 'crawl should be called twice for deposit and withdraw').to.be.true
      expect(stubLoggerError.calledTwice, 'Logger.error should be called twice for deposit and withdraw errors').to.be
        .true
      expect(
        stubLoggerError.firstCall.calledWithMatch('Error deposit transfer' as any),
        'Logger.error should be called for deposit transfer error',
      ).to.be.true
      expect(
        stubLoggerError.secondCall.calledWithMatch('Error withdraw transfer' as any),
        'Logger.error should be called for withdraw transfer error',
      ).to.be.true
    })

    it('should not call the callback when the transaction is not formatted', async () => {
      const daoRegistry: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const txLog: any = {
        hash: '0x123',
        category: ITransactionCategory.ERC20,
        uniqueId: 'unique-id',
        from: '0xfrom',
        to: '0xto',
        value: 1000,
        blockNum: 1,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [txLog] })
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      const formatLogStub = sandbox.stub(AlchemyProvider, 'formatTxLog').resolves(undefined)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })
      const stubCallback = sandbox.stub()
      await AlchemyProvider.getAssetTransfers(daoRegistry as Dao, stubCallback)

      expect(crawlStub.calledTwice).to.be.true
      expect(stubCallback.callCount).to.be.eq(0)
      expect(formatLogStub.calledTwice).to.be.true
    })
  })

  describe('getCategories', () => {
    it('should return correct number of categories for ethereumMainnet', () => {
      const result = AlchemyProvider.getCategories(NetworksEnum.ethereumMainnet)
      expect(result).to.be.an('array').with.lengthOf(5)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.Internal,
        ITransactionCategory.External,
      ])
    })

    it('should return correct number of categories for arbitrumMainnet', () => {
      const result = AlchemyProvider.getCategories(NetworksEnum.arbitrumMainnet)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return correct number of categories for baseMainnet', () => {
      const result = AlchemyProvider.getCategories(NetworksEnum.baseMainnet)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return correct number of categories for zksyncSepolia', () => {
      const result = AlchemyProvider.getCategories(NetworksEnum.zksyncSepolia)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return default categories for an unsupported network', () => {
      const result = AlchemyProvider.getCategories('unsupportedNetwork' as NetworksEnum)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.Internal,
        ITransactionCategory.External,
      ])
    })
  })

  describe('calculateAmountUsd', () => {
    it('should correctly calculate USD amount for valid inputs', () => {
      const amount = 100
      const priceUsd = 2.5
      const expectedUsd = '250' // 100 * 2.5

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return 0 when amount is zero', () => {
      const amount = 0
      const priceUsd = 5
      const expectedUsd = '0'

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return 0 when priceUsd is zero', () => {
      const amount = 100
      const priceUsd = 0
      const expectedUsd = '0'

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return NaN when amount is not a valid number', () => {
      const amount = 'invalid'
      const priceUsd = 10

      const result = AlchemyProvider.calculateAmountUsd(amount as any, priceUsd)

      expect(result).to.eq('0')
    })

    it('should handle very large numbers without precision loss', () => {
      const amount = '1000000000000000000' // 1e18
      const priceUsd = 1000000 // 1e6
      const expectedUsd = '1000000000000000000000000' // 1e24

      const result = AlchemyProvider.calculateAmountUsd(amount as any, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should correctly calculate USD amount with decimal precision', () => {
      const amount = 123.456
      const priceUsd = 7.89
      const expectedUsd = 123.456 * 7.89 // Approximately 974.06784

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(Number(result)).to.be.closeTo(expectedUsd, 1)
    })

    it('should handle negative amount by returning negative USD value', () => {
      const amount = -50
      const priceUsd = 4
      const expectedUsd = '-200' // -50 * 4

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should handle negative priceUsd by returning negative USD value', () => {
      const amount = 50
      const priceUsd = -4
      const expectedUsd = '-200' // 50 * -4

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should handle both negative amount and priceUsd by returning positive USD value', () => {
      const amount = -50
      const priceUsd = -4
      const expectedUsd = '200' // -50 * -4

      const result = AlchemyProvider.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })
  })

  describe('formatTxLog', () => {
    const dummyTimestamp = 1123213213
    const baseTxLog = {
      hash: '0xhash',
      from: '0xfrom',
      uniqueId: 'unique1',
      to: '0xto',
      value: '1000000000000000000',
      blockNum: '123',
      category: 'erc20',
      tokenId: '1',
      erc721TokenId: '2',
      erc1155Metadata: [{ tokenId: '3', value: '10' }],
    }
    const sampleToken = {
      address: '0xTokenAddress',
      decimals: 18,
      name: 'Test Token',
      symbol: 'TTK',
      type: ITokenType.ERC20,
      logo: 'https://example.com/logo.png',
    }
    const zeroAddressToken = {
      address: utils.zeroAddress,
      decimals: 18,
      name: 'Zero Token',
      symbol: 'ZERO',
      type: ITokenType.ERC20,
      logo: 'https://example.com/zero.png',
    }

    it('returns undefined when token is not syncable', async () => {
      const txLog = { ...baseTxLog, rawContract: { address: '0xTokenAddress' } }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp as any)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)
      const warnStub = sandbox.stub(logger, 'warn')
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.be.undefined
      expect(warnStub.calledOnce).to.be.true
    })

    it('should return when proxytoken returns null', async () => {
      const txLog = { ...baseTxLog, rawContract: { address: '0xTokenAddress' } }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null as any)
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.be.undefined
    })

    it('formats and returns transfer log correctly when all fields are provided', async () => {
      const txLog = { ...baseTxLog, rawContract: { address: '0xTokenAddress' } }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(sampleToken as any)
      sandbox.stub(Web3Helper, 'alchemyCrazyBalanceOnError')
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '5' } as any)
      sandbox.stub(Web3Helper, 'handleAlchemyCrazyBalance').returns('formattedValue')
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        hash: txLog.hash,
        from: txLog.from,
        uniqueId: txLog.uniqueId,
        to: txLog.to,
        value: 'formattedValue',
        blockNum: Number(txLog.blockNum),
        category: txLog.category,
        blockTimestamp: dummyTimestamp,
        tokenId: BigInt(txLog.tokenId).toString(),
        erc721TokenId: BigInt(txLog.erc721TokenId).toString(),
        erc1155Metadata: txLog.erc1155Metadata.map(w => ({
          tokenId: BigInt(w.tokenId).toString(),
          value: w.value.toString(),
        })),
        rawContract: {
          address: sampleToken.address,
          decimals: sampleToken.decimals,
          name: sampleToken.name,
          symbol: sampleToken.symbol,
          logo: sampleToken.logo,
          priceUsd: '5',
          priceUpdatedAt: dummyTimestamp,
          type: sampleToken.type,
        },
      })
    })

    it('formats correctly when optional tokenId fields are missing', async () => {
      const { tokenId, erc721TokenId, erc1155Metadata, ...partialTxLog } = baseTxLog
      const txLog = { ...partialTxLog, rawContract: { address: '0xTokenAddress' } }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(sampleToken as any)
      sandbox.stub(Web3Helper, 'alchemyCrazyBalanceOnError')
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '5' } as any)
      sandbox.stub(Web3Helper, 'handleAlchemyCrazyBalance').returns('formattedValue')
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        hash: txLog.hash,
        from: txLog.from,
        uniqueId: txLog.uniqueId,
        to: txLog.to,
        value: 'formattedValue',
        blockNum: Number(txLog.blockNum),
        category: txLog.category,
        blockTimestamp: dummyTimestamp,
        tokenId: undefined,
        erc721TokenId: undefined,
        erc1155Metadata: undefined,
        rawContract: {
          address: sampleToken.address,
          decimals: sampleToken.decimals,
          name: sampleToken.name,
          symbol: sampleToken.symbol,
          logo: sampleToken.logo,
          priceUsd: '5',
          priceUpdatedAt: dummyTimestamp,
          type: sampleToken.type,
        },
      })
    })

    it('formats correctly when rawContract address is missing', async () => {
      const txLog = { ...baseTxLog, rawContract: {} }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp)
      sandbox.stub(TokenUtils, 'isTokenSyncable')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(zeroAddressToken as any)
      sandbox.stub(Web3Helper, 'alchemyCrazyBalanceOnError')
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '10' } as any)
      sandbox.stub(Web3Helper, 'handleAlchemyCrazyBalance').returns('formattedValue')
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.deep.eq({
        hash: txLog.hash,
        from: txLog.from,
        uniqueId: txLog.uniqueId,
        to: txLog.to,
        value: 'formattedValue',
        blockNum: Number(txLog.blockNum),
        category: txLog.category,
        blockTimestamp: dummyTimestamp,
        tokenId: BigInt(txLog.tokenId).toString(),
        erc721TokenId: BigInt(txLog.erc721TokenId).toString(),
        erc1155Metadata: txLog.erc1155Metadata.map(w => ({
          tokenId: BigInt(w.tokenId).toString(),
          value: w.value.toString(),
        })),
        rawContract: {
          address: zeroAddressToken.address,
          decimals: zeroAddressToken.decimals,
          name: zeroAddressToken.name,
          symbol: zeroAddressToken.symbol,
          logo: zeroAddressToken.logo,
          priceUsd: '10',
          priceUpdatedAt: dummyTimestamp,
          type: zeroAddressToken.type,
        },
      })
    })

    it('should handle errors and log them', async () => {
      const txLog = { ...baseTxLog, rawContract: { address: '0xTokenAddress' } }
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(dummyTimestamp)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').throws(new Error('fake-error'))
      const errorStub = sandbox.stub(logger, 'error')
      const result = await AlchemyProvider.formatTxLog(txLog as any, NetworksEnum.ethereumMainnet)
      expect(result).to.be.undefined
      expect(errorStub.calledOnce).to.be.true
    })
  })
})
