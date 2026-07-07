import { Models } from '@dbModels'
import TokenUtils from '@helpers/tokenUtils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ITokenType, NetworksEnum } from '@types'
import { FakeAsset } from '@test/mock/fakeAsset'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonDao:Assets', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the AggregatorAssets and process a DAO', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const daoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      } as any)
      const onDocumentStub = sandbox.stub(DaoAssets, 'onDocument').resolves()

      await DaoAssets.start({ daoAddress: '0x123', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledWith('Start DaoAssets' as any)).to.be.true
      expect(daoStub.calledOnceWith('0x123', NetworksEnum.ethereumMainnet)).to.be.true
      expect(onDocumentStub.calledOnce).to.be.true
      expect(stubLogger.calledWith('End DaoAssets' as any)).to.be.true
    })

    it('should return if dao not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await DaoAssets.start({ daoAddress: '0xInvalidDao', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledOnceWith('Start DaoAssets' as any)).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should process a document and call required services', async () => {
      const dao = { address: '0x123', network: NetworksEnum.ethereumMainnet } as any
      const stubAssets = sandbox.stub(DaoAssets, 'assets').resolves()
      const stubMetrics = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.onDocument(dao)

      expect(stubAssets.calledOnceWith(dao)).to.be.true
      expect(stubMetrics.calledOnceWith({ daoAddress: dao.address, network: dao.network })).to.be.true
    })
  })

  describe('syncToken', () => {
    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)
    })

    it('recomputes dao metrics after applying the balance', async () => {
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getERC20BalanceOrNull').resolves(500n)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.calledOnce).to.be.true
      expect(metricsStub.calledOnceWith({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })).to.be.true
    })

    it('removes an existing asset and recomputes metrics when the token is now spam', async () => {
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.calledOnce).to.be.true
      expect(applyStub.firstCall.args[0]).to.include({ amount: '0', token: null })
      expect(metricsStub.calledOnce).to.be.true
    })

    it('skips apply and metrics when the balance read fails', async () => {
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getERC20BalanceOrNull').resolves(null)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.called).to.be.false
      expect(metricsStub.called).to.be.false
    })

    it('does not recompute metrics when skipMetrics is set', async () => {
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getERC20BalanceOrNull').resolves(500n)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({
        daoAddress: '0xDao',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        skipMetrics: true,
      })

      expect(applyStub.calledOnce).to.be.true
      expect(metricsStub.called).to.be.false
    })

    it('skips non-fungible tokens so an NFT count is never written as an asset balance', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ type: ITokenType.ERC721, decimals: 0 } as any)
      const balanceStub = sandbox.stub(Web3Helper, 'getERC20BalanceOrNull').resolves(3n)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xNft', network: NetworksEnum.ethereumMainnet })

      expect(balanceStub.called).to.be.false
      expect(applyStub.called).to.be.false
      expect(metricsStub.called).to.be.false
      expect(stubLogger.calledWithMatch('syncToken skipped: non-fungible token' as any)).to.be.true
    })

    it('logs an error and returns when the token is not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.called).to.be.false
      expect(stubLogger.calledWithMatch('syncToken token not found' as any)).to.be.true
    })

    it('logs an error on failure', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(TokenUtils, 'isTokenSyncable').throws(new Error('Test Error'))

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledWithMatch('error syncToken' as any)).to.be.true
    })

    it('falls back to the raw addresses and zero decimals when parse and decimals are missing', async () => {
      ;(Web3Utils.parseAddress as sinon.SinonStub).resetBehavior()
      ;(Web3Utils.parseAddress as sinon.SinonStub).returns(null)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10' } as any)
      sandbox.stub(Web3Helper, 'getERC20BalanceOrNull').resolves(500n)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncToken({ daoAddress: '0xDao', tokenAddress: '0xToken', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.calledOnce).to.be.true
      expect(applyStub.firstCall.args[0]).to.include({ daoAddress: '0xDao', tokenAddress: '0xToken', amount: '500' })
    })
  })

  describe('syncNative', () => {
    beforeEach(() => {
      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)
    })

    it('reads the native balance and recomputes dao metrics after applying it', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getNativeBalance').resolves('0x3e8')
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.calledOnce).to.be.true
      expect(applyStub.firstCall.args[0]).to.include({
        daoAddress: '0xDao',
        tokenAddress: '0x0000000000000000000000000000000000000000',
      })
      expect(metricsStub.calledOnceWith({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })).to.be.true
    })

    it('logs an error and returns when the native token is not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.called).to.be.false
      expect(stubLogger.calledWithMatch('syncNative token not found' as any)).to.be.true
    })

    it('skips apply and metrics when the balance read fails', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getNativeBalance').resolves(null)
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.called).to.be.false
      expect(metricsStub.called).to.be.false
      expect(stubLogger.calledWithMatch('syncNative skipped: balance read failed' as any)).to.be.true
    })

    it('logs an error on failure', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').throws(new Error('Test Error'))

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledWithMatch('error syncNative' as any)).to.be.true
    })

    it('does not recompute metrics when skipMetrics is set', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10', decimals: 18 } as any)
      sandbox.stub(Web3Helper, 'getNativeBalance').resolves('0x3e8')
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      const metricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet, skipMetrics: true })

      expect(applyStub.calledOnce).to.be.true
      expect(metricsStub.called).to.be.false
    })

    it('falls back to the raw address and zero decimals when parse and decimals are missing', async () => {
      ;(Web3Utils.parseAddress as sinon.SinonStub).resetBehavior()
      ;(Web3Utils.parseAddress as sinon.SinonStub).returns(null)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ priceUsd: '10' } as any)
      sandbox.stub(Web3Helper, 'getNativeBalance').resolves('0x3e8')
      const applyStub = sandbox.stub(DaoAssets, '_applyTokenBalance').resolves()
      sandbox.stub(DaoMetrics, 'start').resolves()

      await DaoAssets.syncNative({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })

      expect(applyStub.calledOnce).to.be.true
      expect(applyStub.firstCall.args[0]).to.include({ daoAddress: '0xDao', amount: '1000' })
    })
  })

  describe('_applyTokenBalance', () => {
    it('upserts the asset row when the amount is positive', async () => {
      const upsertStub = sandbox.stub(DaoAssets, '_upsertAsset').resolves()

      await DaoAssets._applyTokenBalance({
        daoAddress: '0xDao',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        amount: '500',
        token: { priceUsd: '10', decimals: 18 },
      })

      expect(upsertStub.calledOnce).to.be.true
      expect(upsertStub.firstCall.args[0]).to.include({ amount: '500', label: 'Asset (targeted)' })
    })

    it('removes an existing asset row on a confirmed zero balance', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const upsertStub = sandbox.stub(DaoAssets, '_upsertAsset').resolves()
      sandbox.stub(Models.Asset, 'findExistingLog').resolves({ id: 'asset1' } as any)
      const deleteManyStub = sandbox.stub(Models.Asset, 'deleteMany').resolves({ deletedCount: 1, acknowledged: true })

      await DaoAssets._applyTokenBalance({
        daoAddress: '0xDao',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        amount: '0',
        token: null,
      })

      expect(upsertStub.called).to.be.false
      expect(deleteManyStub.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('Deleted zero-balance asset' as any)).to.be.true
    })

    it('does not delete when no asset row exists on a zero balance', async () => {
      const upsertStub = sandbox.stub(DaoAssets, '_upsertAsset').resolves()
      sandbox.stub(Models.Asset, 'findExistingLog').resolves(null)
      const deleteManyStub = sandbox.stub(Models.Asset, 'deleteMany').resolves({ deletedCount: 0, acknowledged: true })

      await DaoAssets._applyTokenBalance({
        daoAddress: '0xDao',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        amount: '0',
        token: null,
      })

      expect(upsertStub.called).to.be.false
      expect(deleteManyStub.called).to.be.false
    })
  })

  describe('_upsertAsset', () => {
    it('creates a new asset row when none exists', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await DaoAssets._upsertAsset({
        daoAddress: FakeAsset.daoAddress,
        tokenAddress: FakeAsset.tokenAddress,
        network: FakeAsset.network,
        amount: '500',
        token: { priceUsd: '10', decimals: 18 },
        label: 'Asset (targeted)',
      })

      const assetDb = await Models.Asset.findExistingLog({
        daoAddress: FakeAsset.daoAddress,
        tokenAddress: FakeAsset.tokenAddress,
        network: FakeAsset.network,
      })
      expect(assetDb).to.not.be.null
      expect(assetDb?.amount).to.eq('500')
      expect(Number(assetDb?.amountUsd)).to.eq(5000)
      expect(stubLogger.calledWithMatch('New Asset (targeted)' as any)).to.be.true
    })

    it('updates the existing asset row when one already exists', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      await Models.Asset.create(FakeAsset as any)

      await DaoAssets._upsertAsset({
        daoAddress: FakeAsset.daoAddress,
        tokenAddress: FakeAsset.tokenAddress,
        network: FakeAsset.network,
        amount: '750',
        token: null,
        label: 'Asset (targeted)',
      })

      const assetDb = await Models.Asset.findExistingLog({
        daoAddress: FakeAsset.daoAddress,
        tokenAddress: FakeAsset.tokenAddress,
        network: FakeAsset.network,
      })
      expect(assetDb?.amount).to.eq('750')
      // token is null → priceUsd/decimals fall back to '0'/0, so amountUsd is zeroed
      expect(Number(assetDb?.amountUsd)).to.eq(0)
      expect(await Models.Asset.countDocuments()).to.eq(1)
      expect(stubLogger.calledWithMatch('Update Asset (targeted)' as any)).to.be.true
    })
  })

  describe('assets', () => {
    it('re-verifies the union of transfer history and existing asset rows, then native', async () => {
      const stubTransferTokens = sandbox.stub(Models.Transaction, 'distinct').resolves(['0xTokenA', '0xTokenB'])
      const stubAssetTokens = sandbox.stub(Models.Asset, 'distinct').resolves(['0xTokenB', '0xTokenC'])
      const syncTokenStub = sandbox.stub(DaoAssets, 'syncToken').resolves()
      const syncNativeStub = sandbox.stub(DaoAssets, 'syncNative').resolves()

      const result = await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubTransferTokens.calledOnce).to.be.true
      expect(stubAssetTokens.calledOnce).to.be.true
      // deduped union: A, B, C — each synced exactly once, metrics deferred to onDocument
      expect(syncTokenStub.callCount).to.eq(3)
      const syncedTokens = syncTokenStub.getCalls().map(call => call.args[0].tokenAddress)
      expect(syncedTokens).to.have.members(['0xTokenA', '0xTokenB', '0xTokenC'])
      expect(syncTokenStub.getCalls().every(call => call.args[0].skipMetrics)).to.be.true
      expect(
        syncNativeStub.calledOnceWith({
          daoAddress: '0xDao',
          network: NetworksEnum.ethereumMainnet,
          skipMetrics: true,
        }),
      ).to.be.true
      expect(result?.tokenAddresses).to.have.members(['0xTokenA', '0xTokenB', '0xTokenC'])
    })

    it('excludes the zero address from the token loop (native is handled by syncNative)', async () => {
      sandbox.stub(Models.Transaction, 'distinct').resolves(['0x0000000000000000000000000000000000000000', '0xToken'])
      sandbox.stub(Models.Asset, 'distinct').resolves(['0x0000000000000000000000000000000000000000'])
      const syncTokenStub = sandbox.stub(DaoAssets, 'syncToken').resolves()
      const syncNativeStub = sandbox.stub(DaoAssets, 'syncNative').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(syncTokenStub.calledOnce).to.be.true
      expect(syncTokenStub.firstCall.args[0].tokenAddress).to.eq('0xToken')
      expect(syncNativeStub.calledOnce).to.be.true
    })

    it('syncs only native when the dao has no known tokens', async () => {
      sandbox.stub(Models.Transaction, 'distinct').resolves([])
      sandbox.stub(Models.Asset, 'distinct').resolves([])
      const syncTokenStub = sandbox.stub(DaoAssets, 'syncToken').resolves()
      const syncNativeStub = sandbox.stub(DaoAssets, 'syncNative').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(syncTokenStub.called).to.be.false
      expect(syncNativeStub.calledOnce).to.be.true
    })

    it('should log error when processing assets fails', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Models.Transaction, 'distinct').rejects(new Error('Test Error'))
      sandbox.stub(Models.Asset, 'distinct').rejects(new Error('Test Error'))

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubLogger.calledWithMatch('Error DaoAssets' as any)).to.be.true
    })
  })
})
