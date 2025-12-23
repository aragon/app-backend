import { Models } from '@dbModels'
import TokenUtils from '@helpers/tokenUtils'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { IWeb3TokenBalance, NetworksEnum } from '@types'
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

  describe('_handleNativeToken', () => {
    it('should process native token correctly', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubSaveToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        priceUsd: '1000',
        decimals: 18,
      } as any)
      const stubConvert = sandbox.stub(Web3Utils, 'convertBalanceToUsd').returns('1000')
      const stubUpdate = sandbox.stub(Models.Asset.prototype, 'update').resolves()
      const stubCreate = sandbox.stub(Models.Asset, 'create').resolves()

      await DaoAssets._handleNativeToken({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any, '1')

      expect(stubSaveToken.calledOnce).to.be.true
      expect(stubConvert.calledOnce).to.be.true
      expect(stubUpdate.calledOnce).to.be.false
      expect(stubCreate.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('New Native Asset' as any)).to.be.true
    })

    it('should update existing native asset', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubSaveToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        priceUsd: '1000',
        decimals: 18,
      } as any)
      const stubConvert = sandbox.stub(Web3Utils, 'convertBalanceToUsd').returns('1000')
      const stubUpdate = sandbox.stub(Models.Asset.prototype, 'update').resolves()
      sandbox.stub(Models.Asset, 'findExistingLog').resolves({ update: stubUpdate } as any)

      await DaoAssets._handleNativeToken({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any, '1')

      expect(stubSaveToken.calledOnce).to.be.true
      expect(stubConvert.calledOnce).to.be.true
      expect(stubUpdate.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('Update Native Asset' as any)).to.be.true
    })

    it('should log error if token is not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      await DaoAssets._handleNativeToken(
        {
          address: '0xDao',
          network: NetworksEnum.ethereumMainnet,
          id: 'dao1',
        } as any,
        '1',
      )

      expect(stubLogger.calledWithMatch('assets token not found' as any)).to.be.true
    })

    it('should log error on failure', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').throws(new Error('Test Error'))

      await DaoAssets._handleNativeToken(
        {
          address: '0xDao',
          network: NetworksEnum.ethereumMainnet,
          id: 'dao1',
        } as any,
        '1',
      )

      expect(stubLogger.calledWithMatch('error asset handle native token' as any)).to.be.true
    })
  })

  describe('_handleErc20Token', () => {
    it('should process ERC20 token correctly', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubSyncable = sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const stubSaveToken = sandbox
        .stub(ProxyToken, 'saveAndGetToken')
        .resolves({ priceUsd: '10', decimals: 18 } as any)
      const stubConvert = sandbox.stub(Web3Utils, 'convertBalanceToUsd').returns('5000')
      const stubUpdate = sandbox.stub(Models.Asset.prototype, 'update').resolves()
      const stubCreate = sandbox.stub(Models.Asset, 'create').resolves()

      await DaoAssets._handleErc20Token(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet } as any,
        { contractAddress: '0xToken', tokenBalance: '500' } as any,
      )

      expect(stubSyncable.calledOnce).to.be.true
      expect(stubSaveToken.calledOnce).to.be.true
      expect(stubConvert.calledOnce).to.be.true
      expect(stubUpdate.calledOnce).to.be.false
      expect(stubCreate.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('New Token Asset' as any)).to.be.true
    })

    it('should update existing token asset', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubSyncable = sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const stubSaveToken = sandbox
        .stub(ProxyToken, 'saveAndGetToken')
        .resolves({ priceUsd: '10', decimals: 18 } as any)
      const stubConvert = sandbox.stub(Web3Utils, 'convertBalanceToUsd').returns('5000')
      const stubUpdate = sandbox.stub(Models.Asset.prototype, 'update').resolves()
      sandbox.stub(Models.Asset, 'findExistingLog').resolves({ update: stubUpdate } as any)

      await DaoAssets._handleErc20Token(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet } as any,
        { contractAddress: '0xToken', tokenBalance: '500' } as any,
      )

      expect(stubSyncable.calledOnce).to.be.true
      expect(stubSaveToken.calledOnce).to.be.true
      expect(stubConvert.calledOnce).to.be.true
      expect(stubUpdate.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('Update Token Asset' as any)).to.be.true
    })

    it('should log warning if token is marked as spam', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

      await DaoAssets._handleErc20Token(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet } as any,
        { contractAddress: '0xToken', tokenBalance: '500' } as any,
      )

      expect(stubLogger.calledWithMatch('Skip Token Asset: Marked as spam' as any)).to.be.true
    })

    it('should log error if token not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      await DaoAssets._handleErc20Token(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet, id: '123' } as any,
        { contractAddress: '0xToken', tokenBalance: '500' } as any,
      )

      expect(stubLogger.calledOnceWith('tokenBalances token not found' as any)).to.be.true
    })

    it('should log error on failure', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(TokenUtils, 'isTokenSyncable').throws(new Error('Test Error'))

      await DaoAssets._handleErc20Token(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet } as any,
        { contractAddress: '0xToken', tokenBalance: '500' } as any,
      )

      expect(stubLogger.calledWithMatch('error asset handle erc20 token' as any)).to.be.true
    })
  })

  describe('_removeStaleAssets', () => {
    it('should remove stale assets correctly', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const deleteStub = sandbox.stub().resolves()

      const mockAssets = [
        { id: 'asset1', tokenAddress: '0xToken1', deleteOne: deleteStub },
        { id: 'asset2', tokenAddress: '0xToken2', deleteOne: deleteStub },
        { id: 'asset3', tokenAddress: '0x0000000000000000000000000000000000000000', deleteOne: deleteStub }, // Native token
      ]

      const stubFind = sandbox.stub(Models.Asset, 'find').resolves(mockAssets)

      const tokenBalances = [
        { contractAddress: '0xToken1', tokenBalance: '500' } as IWeb3TokenBalance,
        { contractAddress: '0x0000000000000000000000000000000000000000', tokenBalance: '1' } as IWeb3TokenBalance,
      ]

      await DaoAssets._removeStaleAssets(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet, id: 'dao1' } as any,
        tokenBalances,
      )

      expect(stubFind.calledOnce).to.be.true
      expect(deleteStub.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('Deleted stale token asset' as any)).to.be.true
    })

    it('should handle errors gracefully', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Models.Asset, 'find').rejects(new Error('Test error'))

      await DaoAssets._removeStaleAssets(
        { address: '0xDao', network: NetworksEnum.ethereumMainnet, id: 'dao1' } as any,
        [],
      )

      expect(stubLogger.calledWithMatch('Error removing stale assets' as any)).to.be.true
    })
  })

  describe('assets', () => {
    it('should process DAO assets correctly with native token balance > 0', async () => {
      const stubGetBalance = sandbox.stub(ProxyWeb3Provider, 'getNativeBalance').resolves('1')
      const stubGetTokens = sandbox
        .stub(ProxyWeb3Provider, 'getTokenBalances')
        .resolves([
          { contractAddress: '0xToken', tokenBalance: '500' } as IWeb3TokenBalance,
          { contractAddress: '0xToken1', tokenBalance: '0' } as IWeb3TokenBalance,
        ])
      const stubRemoveStale = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      // Verify that _removeStaleAssets is called with both ERC20 and native tokens when ethBalance > 0
      expect(stubRemoveStale.calledOnce).to.be.true
      expect(stubRemoveStale.firstCall.args[1]).to.deep.include({
        contractAddress: '0x0000000000000000000000000000000000000000',
        tokenBalance: '1',
      })
      expect(stubHandleNative.calledOnce).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })

    it('should process DAO assets correctly with native token balance = 0', async () => {
      const stubGetBalance = sandbox.stub(ProxyWeb3Provider, 'getNativeBalance').resolves('0')
      const stubGetTokens = sandbox
        .stub(ProxyWeb3Provider, 'getTokenBalances')
        .resolves([{ contractAddress: '0xToken', tokenBalance: '500' } as IWeb3TokenBalance])
      const stubRemoveStale = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken')
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      // Verify that _removeStaleAssets is called with only ERC20 tokens when ethBalance = 0
      expect(stubRemoveStale.calledOnce).to.be.true
      expect(stubRemoveStale.firstCall.args[1]).to.have.lengthOf(1)
      expect(stubRemoveStale.firstCall.args[1][0].contractAddress).to.equal('0xToken')
      expect(stubHandleNative.notCalled).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })

    it('should process _handleErc20Token when token balance not exist', async () => {
      const stubGetBalance = sandbox.stub(ProxyWeb3Provider, 'getNativeBalance').resolves('0')
      const stubGetTokens = sandbox
        .stub(ProxyWeb3Provider, 'getTokenBalances')
        .resolves([{ contractAddress: '0xToken', tokenBalance: '500' } as IWeb3TokenBalance])
      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken')
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()
      const stubRemoveStale = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      expect(stubRemoveStale.calledOnce).to.be.true
      expect(stubHandleNative.notCalled).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })

    it('should log error when processing assets fails', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(ProxyWeb3Provider, 'getNativeBalance').rejects(new Error('Test Error'))
      sandbox.stub(ProxyWeb3Provider, 'getTokenBalances').rejects(new Error('Test Error'))

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubLogger.calledWithMatch('Error DaoAssets' as any)).to.be.true
    })

    it('should handle stale assets correctly', async () => {
      const stubGetBalance = sandbox.stub(ProxyWeb3Provider, 'getNativeBalance').resolves('0')
      const stubGetTokens = sandbox
        .stub(ProxyWeb3Provider, 'getTokenBalances')
        .resolves([{ contractAddress: '0xToken', tokenBalance: '500' } as IWeb3TokenBalance])

      // Create a spy for _removeStaleAssets to verify what arguments it receives
      const removeStaleStub = sandbox.stub(DaoAssets, '_removeStaleAssets').callsFake(async (doc, tokenBal) => {
        // Should only include ERC20 tokens, not native token when ethBalance = 0
        expect(tokenBal).to.have.lengthOf(1)
        expect(tokenBal[0].contractAddress).to.equal('0xToken')
      })

      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken')
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      expect(removeStaleStub.calledOnce).to.be.true
      expect(stubHandleNative.notCalled).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })
  })
})
