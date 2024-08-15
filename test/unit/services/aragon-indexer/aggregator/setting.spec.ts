import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorSetting } from '@services/aragon-indexer/aggregator/setting'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { ITokenType, NetworksEnum } from '@types'
import utils from '@helpers/utils'

describe('Indexer:Aggregator:Setting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorSetting', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorSetting.start()

      expect(stubLogger.calledWith('End AggregatorSetting' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorSetting', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorSetting.start()

      expect(stubLogger.calledWith('End AggregatorSetting' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should call onDocument', async () => {
    const document = {
      daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
      pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
      network: NetworksEnum.polygonMainnet,
      fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef8',
      toTxHash: '0x11ed65ce6ba3dbed7194ead9d3ffdfafdb921f39b1e55bd5139f0277ea219083',
      fromBlockNumber: 47758873,
      toBlockNumber: 48097896,
      settings: {
        votingMode: 1,
        supportThreshold: 500000,
        minParticipation: 150000,
        minDuration: 86400,
        minProposerVotingPower: '5e+18',

        minApprovals: 1,
        onlyListed: true,
      },
      token: {
        address: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
        symbol: 'DAI',
        type: ITokenType.GovernanceERC20,
        name: 'Dai Stablecoin',
        decimals: 18,
        totalSupply: '1000000000000000000000000000',
        network: NetworksEnum.polygonMainnet,
      },
    }

    const stubLogger = sandbox.stub(Logger, 'verbose')

    await AggregatorSetting.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true

    const setting = await Models.Setting.findExistingLog({
      fromTxHash: document.fromTxHash,
      network: document.network,
    } as any)
    expect(setting.id).to.exist
    expect(setting.pluginAddress).to.eq(document.pluginAddress)
    expect(setting.network).to.eq(document.network)

    expect(setting.fromTxHash).to.eq(document.fromTxHash)
    expect(setting.toTxHash).to.eq(document.toTxHash)
    expect(setting.fromBlockNumber).to.eq(document.fromBlockNumber)
    expect(setting.toBlockNumber).to.eq(document.toBlockNumber)
    expect(setting.settings.votingMode).to.eq(document.settings?.votingMode)
    expect(setting.settings.supportThreshold).to.eq(document.settings?.supportThreshold)
    expect(setting.settings.minParticipation).to.eq(document.settings?.minParticipation)
    expect(setting.settings.minDuration).to.eq(document.settings?.minDuration)
    expect(setting.settings.minProposerVotingPower).to.eq(document.settings?.minProposerVotingPower)
    expect(setting.settings.minApprovals).to.eq(document.settings?.minApprovals)
    expect(setting.settings.onlyListed).to.eq(document.settings?.onlyListed)
    expect(setting.token?.address).to.eq(document.token?.address)
    expect(setting.token?.symbol).to.eq(document.token?.symbol)
    expect(setting.token?.name).to.eq(document.token?.name)
    expect(setting.token?.decimals).to.eq(document.token?.decimals)
    expect(setting.token?.totalSupply).to.eq(document.token?.totalSupply)
    expect(setting.token?.network).to.eq(document.token?.network)
  })

  it('should update an existing aggregate setting log', async () => {
    const rawDoc: any = {
      daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
      pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
      network: NetworksEnum.polygonMainnet,
      fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef8',
      toTxHash: '0x11ed65ce6ba3dbed7194ead9d3ffdfafdb921f39b1e55bd5139f0277ea219083',
      fromBlockNumber: 47758873,
      toBlockNumber: 48097896,
      settings: {
        votingMode: 1,
        supportThreshold: 500000,
        minParticipation: 150000,
        minDuration: 86400,
        minProposerVotingPower: '5e+18',

        minApprovals: 1,
        onlyListed: true,
      },
    }
    const dbDoc = await Models.Setting.create(rawDoc)
    const loggerSpy = sandbox.stub(Logger, 'verbose')

    rawDoc.settings.minApprovals = 10
    await AggregatorSetting.onDocument(rawDoc)
    await utils.wait(100)
    const updatedDoc = await dbDoc.reload()

    expect(updatedDoc.settings.minApprovals).to.equal(10)
    expect(loggerSpy.calledOnceWith('Update Aggregate Setting' as any)).to.be.true
  })

  it('should query', () => {
    const pipeline = AggregatorSetting.query([NetworksEnum.polygonMainnet], { skip: 0, limit: 10 })
    expect(pipeline.length).to.eq(14)
  })
})
