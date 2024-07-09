import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import { AggregatorAssets } from '@services/aragon-indexer/aggregator/asset'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { HexAddress, IAlchemyTokenBalance, NetworksEnum } from '@types'
import Logger from '@logger'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import { UtilsIndexer } from '@indexer/utils/indexer'

describe('Indexer:Aggregator:Assets', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorAssets', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorAssets.start()

      expect(stubLogger.calledWith('End AggregatorAssets' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorAssets', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorAssets.start()

      expect(stubLogger.calledWith('End AggregatorAssets' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', async () => {
    it('should call onDocument and create asset', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }
      const fakeEthBalance = '1000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [
        { contractAddress: '0xTokenAddress1', tokenBalance: '150000' },
        { contractAddress: '0xTokenAddress2', tokenBalance: '200000' },
      ]
      const fakeToken = {
        address: fakeTokenBalances[0].contractAddress,
        name: 'Token1',
        symbol: 'T1',
        decimals: 18,
        network: document.network,
      }

      const fakeToken2 = {
        address: fakeTokenBalances[1].contractAddress,
        name: 'Token2',
        symbol: 'T2',
        decimals: 18,
        network: document.network,
      }
      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      const stubGetToken = sandbox
        .stub(UtilsIndexer, 'saveAndGetToken')
        .onFirstCall()
        .resolves(fakeToken as any)
        .onSecondCall()
        .resolves(fakeToken2 as any)
        .onThirdCall()
        .resolves(fakeToken2 as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubGetTokenBalances.callCount).to.eq(1)
      expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
      expect(stubGetToken.calledTwice).to.be.true
      expect(stubLogger.calledThrice).to.be.true

      const asset = await Models.Asset.findExistingLog({
        daoAddress: document.address as HexAddress,
        tokenAddress: fakeTokenBalances[0].contractAddress,
        network: document.network as NetworksEnum,
      })
      expect(asset.daoAddress).to.equal(document.address)
      expect(asset.network).to.equal(document.network)
      expect(asset.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
      expect(asset.amount).to.equal(fakeTokenBalances[0].tokenBalance)

      const asset2 = await Models.Asset.findExistingLog({
        daoAddress: document.address as HexAddress,
        tokenAddress: fakeTokenBalances[1].contractAddress as HexAddress,
        network: document.network as NetworksEnum,
      })
      expect(asset2.daoAddress).to.equal(document.address)
      expect(asset2.tokenAddress).to.equal(fakeTokenBalances[1].contractAddress)
      expect(asset2.amount).to.equal(fakeTokenBalances[1].tokenBalance)

      const asset3 = await Models.Asset.findExistingLog({
        daoAddress: document.address as HexAddress,
        tokenAddress: ZeroAddress as HexAddress,
        network: document.network as NetworksEnum,
      })
      expect(asset3.daoAddress).to.equal(document.address)
      expect(asset3.tokenAddress).to.equal(ZeroAddress)
      expect(asset3.amount).to.equal(fakeEthBalance)
    })

    it('should call onDocument and update asset', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }
      const fakeEthBalance = '5000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [{ contractAddress: '0xTokenAddress1', tokenBalance: '550000' }]

      await Models.Asset.create({
        network: NetworksEnum.ethereumMainnet,
        daoAddress: document.address,
        tokenAddress: ZeroAddress,
        amount: '1000000000000000000',
      })

      await Models.Asset.create({
        network: NetworksEnum.ethereumMainnet,
        daoAddress: document.address,
        tokenAddress: fakeTokenBalances[0].contractAddress,
        amount: '150000',
      })

      const saveAndGetTokenStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: fakeTokenBalances[0].contractAddress,
      } as any)
      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubGetTokenBalances.callCount).to.eq(1)
      expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
      expect(stubLogger.calledTwice).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true

      const asset = await Models.Asset.findExistingLog({
        daoAddress: document.address as HexAddress,
        tokenAddress: fakeTokenBalances[0].contractAddress as HexAddress,
        network: document.network as NetworksEnum,
      })
      expect(asset.daoAddress).to.equal(document.address)
      expect(asset.network).to.equal(document.network)
      expect(asset.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
      expect(asset.amount).to.equal(fakeTokenBalances[0].tokenBalance)

      const asset2 = await Models.Asset.findExistingLog({
        daoAddress: document.address as HexAddress,
        tokenAddress: ZeroAddress as HexAddress,
        network: document.network as NetworksEnum,
      })
      expect(asset2.daoAddress).to.equal(document.address)
      expect(asset2.tokenAddress).to.equal(ZeroAddress)
      expect(asset2.amount).to.equal(fakeEthBalance)
    })

    it('should call onDocument and fail', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').rejects(new Error('Error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
