import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSettingHandler } from '@services/indexer/handlers/pluginSettingHandler'
import { Models } from '@dbModels'

describe('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('votingSettingsUpdated', async () => {
    const network = NetworksEnum.mainnet

    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
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
    await PluginSettingHandler.votingSettingsUpdated(fakeEvent as any, txLog, network)
    expect(stubLogger.calledTwice).to.be.true

    const pluginSettingDB = await Models.LogPluginSetting.findExistingLog(txLog.transactionHash, txLog.address)
    expect(pluginSettingDB.transactionHash).to.eq(txLog.transactionHash)
    expect(pluginSettingDB.blockNumber).to.eq(txLog.blockNumber)
    expect(pluginSettingDB.pluginAddress).to.eq(txLog.address)
    expect(pluginSettingDB.votingMode).to.eq(Number(fakeEvent.args.votingMode))
    expect(pluginSettingDB.supportThreshold).to.eq(Number(fakeEvent.args.supportThreshold))
    expect(pluginSettingDB.minParticipation).to.eq(Number(fakeEvent.args.minParticipation))
    expect(pluginSettingDB.minDuration).to.eq(Number(fakeEvent.args.minDuration))
    expect(pluginSettingDB.minProposerVotingPower).to.eq(Number(fakeEvent.args.minProposerVotingPower))
  })

  it('multisigSettingsUpdated', async () => {
    const network = NetworksEnum.mainnet

    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }

    const fakeEvent = {
      args: {
        onlyListed: true,
        minApprovals: 3n,
      },
    }

    const stubLogger = sandbox.stub(logger, 'verbose')
    await PluginSettingHandler.multisigSettingsUpdated(fakeEvent as any, txLog, network)
    expect(stubLogger.calledTwice).to.be.true

    const pluginSettingDB = await Models.LogPluginSetting.findExistingLog(txLog.transactionHash, txLog.address)
    expect(pluginSettingDB.transactionHash).to.eq(txLog.transactionHash)
    expect(pluginSettingDB.blockNumber).to.eq(txLog.blockNumber)
    expect(pluginSettingDB.pluginAddress).to.eq(txLog.address)
    expect(pluginSettingDB.onlyListed).to.eq(fakeEvent.args.onlyListed)
    expect(pluginSettingDB.minApprovals).to.eq(Number(fakeEvent.args.minApprovals))
  })
})
