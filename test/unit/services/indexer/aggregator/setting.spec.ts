import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorSetting } from '@services/indexer/aggregator/setting'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { NetworksEnum } from '@types'
import Logger from '@logger'

describe('Indexer:Aggregator:Setting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should start the AggregatorSetting', async () => {
    const findByTypeStub = sandbox.stub(Models.Aggregator, 'findByType')
    const stubLogger = sandbox.stub(logger, 'verbose')
    const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')
    const saveAggregationSyncStub = sandbox.stub(UtilsIndexer, 'saveAggregationSync')

    await AggregatorSetting.start()

    expect(stubLogger.calledWith('End AggregatorSetting' as any)).to.be.true
    expect(findByTypeStub.calledOnce).to.be.true
    expect(crawlerStub.calledOnce).to.be.true
    expect(saveAggregationSyncStub.calledOnce).to.be.true
  })

  it('should call onDocument', async () => {
    const document = {
      network: NetworksEnum.mainnet,
      pluginAddress: '0x12345',
      history: [
        {
          fromBlockNumber: 41326113,
          toBlockNumber: 41847296,
          fromTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a6535eb',
          toTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a653500',
          settings: {
            votingMode: 1,
            supportThreshold: 670000,
            minParticipation: 50000,
            minDuration: 86400,
            minProposerVotingPower: '1e+23',

            minApprovals: 1,
            onlyListed: true,
          },
        },
      ],
    }

    const stubLogger = sandbox.spy(Logger, 'verbose')

    await AggregatorSetting.onDocument(document)

    expect(stubLogger.calledOnce).to.be.true

    const setting = await Models.Setting.findExistingLog(document.pluginAddress, document.network)
    expect(setting.id).to.exist
    expect(setting.entityId).to.exist
    expect(setting.pluginAddress).to.eq(document.pluginAddress)
    expect(setting.network).to.eq(document.network)

    expect(setting.history[0].fromTxHash).to.eq(document?.history?.[0]?.fromTxHash)
    expect(setting.history[0].toTxHash).to.eq(document?.history?.[0]?.toTxHash)
    expect(setting.history[0].fromBlockNumber).to.eq(document?.history?.[0]?.fromBlockNumber)
    expect(setting.history[0].toBlockNumber).to.eq(document?.history?.[0]?.toBlockNumber)
    expect(setting.history[0].settings.votingMode).to.eq(document?.history?.[0]?.settings?.votingMode)
    expect(setting.history[0].settings.supportThreshold).to.eq(document?.history?.[0]?.settings?.supportThreshold)
    expect(setting.history[0].settings.minParticipation).to.eq(document?.history?.[0]?.settings?.minParticipation)
    expect(setting.history[0].settings.minDuration).to.eq(document?.history?.[0]?.settings?.minDuration)
    expect(setting.history[0].settings.minProposerVotingPower).to.eq(
      document?.history?.[0]?.settings?.minProposerVotingPower,
    )
    expect(setting.history[0].settings.minApprovals).to.eq(document?.history?.[0]?.settings?.minApprovals)
    expect(setting.history[0].settings.onlyListed).to.eq(document?.history?.[0]?.settings?.onlyListed)
  })

  it('should update an existing aggregate setting log', async () => {
    const rawDoc = {
      network: NetworksEnum.mainnet,
      pluginAddress: '0x12345',
      history: [
        {
          fromBlockNumber: 41326113,
          toBlockNumber: 41847296,
          fromTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a6535eb',
          toTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a653500',
          settings: {
            votingMode: 1,
            supportThreshold: 670000,
            minParticipation: 50000,
            minDuration: 86400,
            minProposerVotingPower: '1e+23',

            minApprovals: 1,
            onlyListed: true,
          },
        },
      ],
    }
    const dbDoc = await Models.Setting.create(rawDoc)
    const loggerSpy = sandbox.spy(logger, 'verbose')

    rawDoc.history = [
      {
        fromBlockNumber: 41326113,
        toBlockNumber: 41847296,
        fromTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a6535eb',
        toTxHash: '0x2f0dd7d3799da5079efbf5623c062c846d3289ccc6011194f4c83c6b9a653500',
        settings: {
          votingMode: 1,
          supportThreshold: 670000,
          minParticipation: 50000,
          minDuration: 86400,
          minProposerVotingPower: '1e+23',
          minApprovals: 10,
          onlyListed: true,
        },
      },
    ]
    await AggregatorSetting.onDocument(rawDoc)

    const updatedDoc = await dbDoc.reload()

    expect(updatedDoc.history[0].settings.minApprovals).to.equal(10)
    expect(loggerSpy.calledOnceWith('Update Aggregate Setting' as any)).to.be.true
  })

  it('should query', () => {
    const pipeline = AggregatorSetting.query()
    expect(pipeline.length).to.eq(5)
  })
})
