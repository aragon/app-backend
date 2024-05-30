import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import { AggregatorAssets } from '@services/indexer/aggregator/asset'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { IAlchemyTokenBalance, NetworksEnum } from '@types'
import Logger from '@logger'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'

describe('Indexer:Aggregator:Assets', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should start the AggregatorAssets', async () => {
    const findByTypeStub = sandbox.stub(Models.Aggregator, 'findByType')
    const stubLogger = sandbox.stub(logger, 'verbose')
    const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')
    const saveAggregationSyncStub = sandbox.stub(UtilsIndexer, 'saveAggregationSync')

    await AggregatorAssets.start()

    expect(stubLogger.calledWith('End AggregatorAssets' as any)).to.be.true
    expect(findByTypeStub.calledOnce).to.be.true
    expect(crawlerStub.calledOnce).to.be.true
    expect(saveAggregationSyncStub.calledOnce).to.be.true
  })

  describe('onDocument', async () => {
    it('should call onDocument and create asset', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.mainnet,
      }
      const fakeEthBalance = '1000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [
        { contractAddress: '0xTokenAddress1', tokenBalance: '150000' },
        { contractAddress: '0xTokenAddress2', tokenBalance: '200000' },
      ]
      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      const stubLogger = sandbox.spy(Logger, 'verbose')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubGetTokenBalances.callCount).to.eq(1)
      expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
      expect(stubLogger.calledThrice).to.be.true

      const asset = await Models.Asset.findExistingLog(
        document.address,
        fakeTokenBalances[0].contractAddress,
        document.network,
      )
      expect(asset.daoAddress).to.equal(document.address)
      expect(asset.network).to.equal(document.network)
      expect(asset.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
      expect(asset.amount).to.equal(fakeTokenBalances[0].tokenBalance)

      const asset2 = await Models.Asset.findExistingLog(
        document.address,
        fakeTokenBalances[1].contractAddress,
        document.network,
      )
      expect(asset2.daoAddress).to.equal(document.address)
      expect(asset2.tokenAddress).to.equal(fakeTokenBalances[1].contractAddress)
      expect(asset2.amount).to.equal(fakeTokenBalances[1].tokenBalance)

      const asset3 = await Models.Asset.findExistingLog(document.address, ZeroAddress, document.network)
      expect(asset3.daoAddress).to.equal(document.address)
      expect(asset3.tokenAddress).to.equal(ZeroAddress)
      expect(asset3.amount).to.equal(fakeEthBalance)
    })

    it('should call onDocument and update asset', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.mainnet,
      }
      const fakeEthBalance = '5000000000000000000'
      const fakeTokenBalances: IAlchemyTokenBalance[] = [{ contractAddress: '0xTokenAddress1', tokenBalance: '550000' }]

      const assetNativeDb = await Models.Asset.create({
        network: NetworksEnum.mainnet,
        daoAddress: document.address,
        tokenAddress: ZeroAddress,
        amount: '1000000000000000000',
      })

      const assetTokenDb = await Models.Asset.create({
        network: NetworksEnum.mainnet,
        daoAddress: document.address,
        tokenAddress: fakeTokenBalances[0].contractAddress,
        amount: '150000',
      })

      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
      const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
      const stubLogger = sandbox.spy(Logger, 'verbose')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubGetTokenBalances.callCount).to.eq(1)
      expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
      expect(stubLogger.calledTwice).to.be.true

      const asset = await Models.Asset.findExistingLog(
        document.address,
        fakeTokenBalances[0].contractAddress,
        document.network,
      )
      expect(asset.daoAddress).to.equal(document.address)
      expect(asset.network).to.equal(document.network)
      expect(asset.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
      expect(asset.amount).to.equal(fakeTokenBalances[0].tokenBalance)

      const asset2 = await Models.Asset.findExistingLog(document.address, ZeroAddress, document.network)
      expect(asset2.daoAddress).to.equal(document.address)
      expect(asset2.tokenAddress).to.equal(ZeroAddress)
      expect(asset2.amount).to.equal(fakeEthBalance)
    })

    it('should call onDocument and fail', async () => {
      const document: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.mainnet,
      }

      const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').rejects(new Error('Error'))
      const stubLogger = sandbox.spy(Logger, 'error')

      await AggregatorAssets.onDocument(document as any)

      expect(stubGetBalance.callCount).to.eq(1)
      expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
