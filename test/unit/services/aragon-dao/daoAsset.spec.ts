import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { IAlchemyTokenBalance, NetworksEnum } from '@types'
import Logger from '@logger'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import TokenBalancesProvider from '@providers/accountAssetProvider/providerFactory'

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
      const stubConvert = sandbox.stub(Web3Helper, 'convertBalanceToUsd').returns('1000')
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
      const stubConvert = sandbox.stub(Web3Helper, 'convertBalanceToUsd').returns('1000')
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
      const stubConvert = sandbox.stub(Web3Helper, 'convertBalanceToUsd').returns('5000')
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
      const stubConvert = sandbox.stub(Web3Helper, 'convertBalanceToUsd').returns('5000')
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

  describe('assets', () => {
    it('should process DAO assets correctly', async () => {
      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves('1')
      const stubGetTokens = sandbox
        .stub(TokenBalancesProvider, 'getAccountBalances')
        .resolves([
          { contractAddress: '0xToken', tokenBalance: '500' } as IAlchemyTokenBalance,
          { contractAddress: '0xToken1', tokenBalance: '0' } as IAlchemyTokenBalance,
        ])
      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      expect(stubHandleNative.calledOnce).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })

    it('should process _handleErc20Token when token balance not exist', async () => {
      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves('0')
      const stubGetTokens = sandbox
        .stub(TokenBalancesProvider, 'getAccountBalances')
        .resolves([{ contractAddress: '0xToken', tokenBalance: '500' } as IAlchemyTokenBalance])
      const stubHandleNative = sandbox.stub(DaoAssets, '_handleNativeToken')
      const stubHandleErc20 = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubGetBalance.calledOnce).to.be.true
      expect(stubGetTokens.calledOnce).to.be.true
      expect(stubHandleNative.notCalled).to.be.true
      expect(stubHandleErc20.calledOnce).to.be.true
    })

    it('should log error when processing assets fails', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Web3Helper, 'getBalance').rejects(new Error('Test Error'))

      await DaoAssets.assets({ address: '0xDao', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubLogger.calledWithMatch('Error DaoAssets' as any)).to.be.true
    })
  })
})
