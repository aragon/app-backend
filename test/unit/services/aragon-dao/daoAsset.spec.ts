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

  describe('assets', () => {
    it('should create new assets for a DAO', async () => {
      const dao = { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } as any
      const fakeEthBalance = '1000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [
        { contractAddress: '0xToken1', tokenBalance: '500000' } as any,
        { contractAddress: '0xToken2', tokenBalance: '300000' } as any,
        { contractAddress: '0xToken3', tokenBalance: '2000' } as any,
      ]
      const fakeNativeToken = {
        address: utils.zeroAddress,
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        priceUsd: '1000',
        network: dao.network,
      }
      const fakeToken1 = {
        address: '0xToken1',
        name: 'Token1',
        symbol: 'T1',
        decimals: 18,
        priceUsd: '10',
        network: dao.network,
      }
      const fakeToken2 = {
        address: '0xToken2',
        name: 'Token2',
        symbol: 'T2',
        decimals: 18,
        priceUsd: '1',
        network: dao.network,
      }

      const fakeToken3 = {
        address: '0xToken2',
        name: 'Token2',
        symbol: 'T2',
        decimals: 18,
        priceUsd: '1',
        network: dao.network,
      }

      sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      const saveAndGetProxyToken = sandbox
        .stub(ProxyToken, 'saveAndGetToken')
        .onCall(0)
        .resolves(fakeNativeToken as any)
        .onCall(1)
        .resolves(fakeToken1 as any)
        .onCall(2)
        .resolves(fakeToken2 as any)
        .onCall(3)
        .resolves(fakeToken3 as any)

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const createStub = sandbox.stub(Models.Asset, 'create').resolves()
      const web3TokenDetailStub = sandbox
        .stub(Web3Helper, 'getTokenDetails')
        .onCall(0)
        .resolves({ decimals: 18 } as any)
        .onCall(1)
        .resolves({ decimals: null } as any)
        .onCall(2)
        .resolves({ decimals: 18 } as any)

      const loggerWarn = sandbox.stub(Logger, 'warn')
      const scamDetectorStub = sandbox
        .stub(ProxyToken, 'analyzeIfScamToken')
        .onCall(0)
        .returns(false)
        .onCall(1)
        .returns(true)
      await DaoAssets.assets(dao)

      expect(stubLogger.calledWithMatch('New Native Asset' as any)).to.be.true
      expect(stubLogger.calledWithMatch('New Token Asset' as any)).to.be.true
      expect(createStub.callCount).to.equal(2)
      expect(web3TokenDetailStub.callCount).to.equal(3)
      expect(scamDetectorStub.callCount).to.equal(2)
      expect(loggerWarn.callCount).to.equal(2)
      expect(saveAndGetProxyToken.callCount).to.equal(2)
    })

    it('should update existing assets for a DAO', async () => {
      const dao = { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } as any
      const fakeEthBalance = '2000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [{ contractAddress: '0xToken1', tokenBalance: '700000' } as any]

      sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      sandbox.stub(Web3Helper, 'getTokenDetails').resolves({ decimals: 18 } as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xToken1',
        priceUsd: '5',
        decimals: 18,
      } as any)
      sandbox.stub(Models.Asset, 'findExistingLog').resolves({ update: sandbox.stub().resolves() } as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await DaoAssets.assets(dao)

      expect(stubLogger.calledWithMatch('Update Token Asset' as any)).to.be.true
      expect(stubLogger.calledWithMatch('Update Native Asset' as any)).to.be.true
    })

    it('should handle errors while processing assets', async () => {
      const dao = { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } as any
      sandbox.stub(Web3Helper, 'getBalance').rejects(new Error('Test error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      await DaoAssets.assets(dao)

      expect(stubLogger.calledWithMatch('Error DaoAssets' as any)).to.be.true
    })
  })
})
