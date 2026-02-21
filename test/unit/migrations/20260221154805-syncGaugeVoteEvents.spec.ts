import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import syncGaugeVoteEventsMigration, {
  createGaugeResetBatch,
  createGaugeVotedBatch,
} from '@src/migrations/20260221154805-syncGaugeVoteEvents'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const MIG_PLUGIN = '0xAA00AA00AA00AA00AA00AA00AA00AA00AA00AA00'

describe.only('migration: syncGaugeVoteEvents', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should skip when no gauge plugins found', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await syncGaugeVoteEventsMigration.start()

      const noPluginsCall = loggerInfoStub.getCalls().find(call => String(call.args[0]) === 'No gauge plugins found')
      expect(noPluginsCall).to.exist
    })

    it('should handle errors gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'find').rejects(new Error('Database error'))

      await expect(syncGaugeVoteEventsMigration.start()).to.be.rejectedWith('Database error')

      const failedCall = loggerErrorStub.getCalls().find(call => String(call.args[0]) === 'Migration failed')
      expect(failedCall).to.exist
    })
  })

  describe('batch handlers', () => {
    it('gaugeVotedBatch should create VoteGauge records via bulkWrite', async () => {
      sandbox
        .stub(Web3BatchHelper, 'callRpcMethod')
        .resolves([{ identifier: 5000, success: true, data: { timestamp: '0x64' } }])

      const handler = createGaugeVotedBatch(true)

      const events = [
        {
          parsedEvent: {
            args: {
              voter: '0xVoter1',
              gauge: '0xGauge1',
              epoch: BigInt(3),
              votingPowerCastForGauge: BigInt('500000000000000000'),
            },
          } as any,
          info: {
            network: NetworksEnum.ethereumMainnet,
            address: '0xBatchPluginAddr1',
            transactionHash: '0xBatchTxHash1',
            transactionIndex: 0,
            logIndex: 0,
            blockNumber: 5000,
          } as any,
        },
      ]

      await handler(events)

      const records = await Models.VoteGauge.find({ pluginAddress: '0xBatchPluginAddr1' })
      expect(records).to.have.lengthOf(1)
      expect(records[0].type).to.equal('vote')
      expect(records[0].votingPower).to.equal('500000000000000000')
      expect(records[0].persistentVote).to.equal(true)
      expect(records[0].memberAddress).to.equal('0xVoter1')
      expect(records[0].gaugeAddress).to.equal('0xGauge1')
      expect(records[0].epochId).to.equal('3')
      expect(records[0].blockTimestamp).to.equal(100)
    })

    it('gaugeResetBatch should create VoteGauge records with type=reset and votingPower=0', async () => {
      sandbox
        .stub(Web3BatchHelper, 'callRpcMethod')
        .resolves([{ identifier: 6000, success: true, data: { timestamp: '0xc8' } }])

      const handler = createGaugeResetBatch(false)

      const events = [
        {
          parsedEvent: {
            args: {
              voter: '0xVoter2',
              gauge: '0xGauge2',
              epoch: BigInt(5),
              votingPowerRemovedFromGauge: BigInt('300000000000000000'),
            },
          } as any,
          info: {
            network: NetworksEnum.ethereumMainnet,
            address: '0xBatchPluginAddr2',
            transactionHash: '0xBatchTxHash2',
            transactionIndex: 1,
            logIndex: 2,
            blockNumber: 6000,
          } as any,
        },
      ]

      await handler(events)

      const records = await Models.VoteGauge.find({ pluginAddress: '0xBatchPluginAddr2' })
      expect(records).to.have.lengthOf(1)
      expect(records[0].type).to.equal('reset')
      expect(records[0].votingPower).to.equal('0')
      expect(records[0].persistentVote).to.equal(false)
      expect(records[0].memberAddress).to.equal('0xVoter2')
      expect(records[0].gaugeAddress).to.equal('0xGauge2')
      expect(records[0].epochId).to.equal('5')
      expect(records[0].blockTimestamp).to.equal(200)
    })

    it('should skip empty events array', async () => {
      const bulkWriteSpy = sandbox.spy(Models.VoteGauge, 'bulkWrite')
      const handler = createGaugeVotedBatch(false)
      await handler([])

      expect(bulkWriteSpy.called).to.be.false
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await syncGaugeVoteEventsMigration.stop()
      expect(true).to.be.true
    })
  })
})
