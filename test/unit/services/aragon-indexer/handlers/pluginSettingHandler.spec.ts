import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSettingHandler } from '@services/aragon-indexer/handlers/pluginSettingHandler'
import { Models } from '@dbModels'

describe('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('votingSettingsUpdated', () => {
    it('should votingSettingsUpdated', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          votingMode: 2n,
          supportThreshold: 150n,
          minParticipation: 222n,
          minDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }

      const stubLogger = sandbox.stub(logger, 'verbose')
      await PluginSettingHandler.votingSettingsUpdated(fakeEvent as any, logInfo)
      expect(stubLogger.calledOnce).to.be.true

      const pluginSettingDB = await Models.LogPluginSetting.findExistingLog(logInfo.transactionHash, logInfo.address)
      expect(pluginSettingDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(pluginSettingDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(pluginSettingDB.pluginAddress).to.eq(logInfo.address)
      expect(pluginSettingDB.votingMode).to.eq(Number(fakeEvent.args.votingMode))
      expect(pluginSettingDB.supportThreshold).to.eq(Number(fakeEvent.args.supportThreshold))
      expect(pluginSettingDB.minParticipation).to.eq(Number(fakeEvent.args.minParticipation))
      expect(pluginSettingDB.minDuration).to.eq(Number(fakeEvent.args.minDuration))
      expect(pluginSettingDB.minProposerVotingPower).to.eq(Number(fakeEvent.args.minProposerVotingPower))
    })

    it('votingSettingsUpdated throw error', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogPluginSetting, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSettingHandler.votingSettingsUpdated(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error votingSettingsUpdated' as any)).to.be.true
    })
  })

  describe('multisigSettingsUpdated', () => {
    it('should multisigSettingsUpdated', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          onlyListed: true,
          minApprovals: 3n,
        },
      }

      const stubLogger = sandbox.stub(logger, 'verbose')
      await PluginSettingHandler.multisigSettingsUpdated(fakeEvent as any, logInfo)
      expect(stubLogger.calledOnce).to.be.true

      const pluginSettingDB = await Models.LogPluginSetting.findExistingLog(logInfo.transactionHash, logInfo.address)
      expect(pluginSettingDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(pluginSettingDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(pluginSettingDB.pluginAddress).to.eq(logInfo.address)
      expect(pluginSettingDB.onlyListed).to.eq(fakeEvent.args.onlyListed)
      expect(pluginSettingDB.minApprovals).to.eq(Number(fakeEvent.args.minApprovals))
    })

    it('multisigSettingsUpdated throw error', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogPluginSetting, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSettingHandler.multisigSettingsUpdated(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error multisigSettingsUpdated' as any)).to.be.true
    })
  })
})
