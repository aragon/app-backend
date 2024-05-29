import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import { AggregatorAssets } from '@services/indexer/aggregator/asset'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { EnumPluginType, NetworksEnum } from '@types'
import Logger from '@logger'
import type Dao from '@models/schema/dao'
import DuneHelper from '@helpers/dune'

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
        avatar: 'fake-avatar',
        name: 'fake-name',
        description: 'fake-description',
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        network: NetworksEnum.mainnet,
        members: 10,
        proposalsCreated: 5,
        proposalsExecuted: 3,
        tvlUSD: 10000,
        uniqueVoters: 100,
        votes: 500,
        plugins: [
          {
            type: EnumPluginType.MultisigPlugin,
            address: '0x0',
          },
        ],
        hideDao: false,
        txHash: '0x0',
      }
      const fakeResp = {
        balances: [
          {
            chain: 'ethereum',
            address: '0x0',
            amount: 100,
          },
          {
            chain: 'polygon',
            address: 'native',
            amount: 100,
          },
        ],
      }
      const stubDune = sandbox.stub(DuneHelper, 'getBalance').resolves(fakeResp as any)
      const stubLogger = sandbox.spy(Logger, 'verbose')

      await AggregatorAssets.onDocument(document as any)

      expect(stubDune.calledOnce).to.be.true
      expect(stubDune.calledWith(document.daoAddress)).to.be.true
      expect(stubLogger.calledTwice).to.be.true

      const asset = await Models.Asset.findExistingLog(
        document.daoAddress,
        fakeResp.balances[0].address,
        DuneHelper.duneNetworkToAragon(fakeResp.balances[0].chain),
      )
      expect(asset.daoAddress).to.equal(document.daoAddress)
      expect(asset.network).to.equal(DuneHelper.duneNetworkToAragon(fakeResp.balances[0].chain))
      expect(asset.tokenAddress).to.equal(fakeResp.balances[0].address)
      expect(asset.amount).to.equal(fakeResp.balances[0].amount.toString())

      const assetNative = await Models.Asset.findExistingLog(
        document.daoAddress,
        ZeroAddress,
        DuneHelper.duneNetworkToAragon(fakeResp.balances[1].chain),
      )
      expect(assetNative.daoAddress).to.equal(document.daoAddress)
      expect(assetNative.network).to.equal(DuneHelper.duneNetworkToAragon(fakeResp.balances[1].chain))
      expect(assetNative.tokenAddress).to.equal(ZeroAddress)
      expect(assetNative.amount).to.equal(fakeResp.balances[1].amount.toString())
    })

    it('should call onDocument and update asset', async () => {
      const assetDb = await Models.Asset.create({
        network: NetworksEnum.mainnet,
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        tokenAddress: ZeroAddress,
        amount: '100',
      })

      const fakeResp = {
        balances: [
          {
            chain: 'ethereum',
            address: 'native',
            amount: '500',
          },
        ],
      }

      const stubDune = sandbox.stub(DuneHelper, 'getBalance').resolves(fakeResp as any)
      const stubLogger = sandbox.spy(Logger, 'verbose')
      await AggregatorAssets.onDocument(assetDb as any)

      expect(stubDune.calledOnce).to.be.true
      expect(stubDune.calledWith(assetDb.daoAddress)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const asset = await Models.Asset.findExistingLog(assetDb.daoAddress, assetDb.tokenAddress, assetDb.network)
      expect(asset.amount).to.equal('500')
    })
  })
})
