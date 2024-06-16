import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Setting from '@models/schema/setting'
import { Models } from '@dbModels'

describe('Model: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawSetting = {
      pluginAddress: '0x1C9776b903DbA78C597C0512c6291F618d20427f',
      network: NetworksEnum.mainnet,
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
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Setting', async () => {
    it('Should create Setting', async () => {
      const entityId = Models.Setting.getEntityId(rawSetting.pluginAddress, rawSetting.network)
      rawSetting.entityId = entityId
      const createdLogDao = await Models.Setting.create(rawSetting)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawSetting.entityId)
      expect(createdLogDao.pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(createdLogDao.network).to.eq(rawSetting.network)

      expect(createdLogDao.history[0].fromTxHash).to.eq(rawSetting?.history?.[0]?.fromTxHash)
      expect(createdLogDao.history[0].toTxHash).to.eq(rawSetting?.history?.[0]?.toTxHash)
      expect(createdLogDao.history[0].fromBlockNumber).to.eq(rawSetting?.history?.[0]?.fromBlockNumber)
      expect(createdLogDao.history[0].toBlockNumber).to.eq(rawSetting?.history?.[0]?.toBlockNumber)
      expect(createdLogDao.history[0].settings.votingMode).to.eq(rawSetting?.history?.[0]?.settings?.votingMode)
      expect(createdLogDao.history[0].settings.supportThreshold).to.eq(
        rawSetting?.history?.[0]?.settings?.supportThreshold,
      )
      expect(createdLogDao.history[0].settings.minParticipation).to.eq(
        rawSetting?.history?.[0]?.settings?.minParticipation,
      )
      expect(createdLogDao.history[0].settings.minDuration).to.eq(rawSetting?.history?.[0]?.settings?.minDuration)
      expect(createdLogDao.history[0].settings.minProposerVotingPower).to.eq(
        rawSetting?.history?.[0]?.settings?.minProposerVotingPower,
      )
      expect(createdLogDao.history[0].settings.minApprovals).to.eq(rawSetting?.history?.[0]?.settings?.minApprovals)
      expect(createdLogDao.history[0].settings.onlyListed).to.eq(rawSetting?.history?.[0]?.settings?.onlyListed)
    })
  })

  it('Should update Setting', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    expect(createdLogDao.plugin).to.eq(rawSetting.plugin)

    await createdLogDao.update({
      pluginAddress: '0x00',
    })

    expect(createdLogDao.pluginAddress).to.eq('0x00')
  })

  it('Should getEntityId', async () => {
    const pluginAddress = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.mainnet
    const entityId = Models.Setting.getEntityId(pluginAddress, network)
    expect(entityId).to.eq(`${pluginAddress}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetupProcessor = await Models.Setting.create(rawSetting)
    const foundLogPluginSetupProcessor = await Models.Setting.findExistingLog(
      createdLogPluginSetupProcessor.pluginAddress,
      createdLogPluginSetupProcessor.network,
    )
    expect(foundLogPluginSetupProcessor?.entityId).to.eq(createdLogPluginSetupProcessor.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetupProcessor = await Models.Setting.create(rawSetting)
    const foundLogPluginSetupProcessor = await Models.Setting.findByEntityId(createdLogPluginSetupProcessor.entityId)
    expect(foundLogPluginSetupProcessor?.entityId).to.eq(createdLogPluginSetupProcessor.entityId)
  })

  it('Should getSettingByPluginAddress', async () => {
    rawSetting = {
      pluginAddress: '0x1C9776b903DbA78C597C0512c6291F618d20427f',
      network: NetworksEnum.mainnet,
      history: [
        {
          fromBlockNumber: 41326113,
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

    const createdLogPluginSetupProcessor = await Models.Setting.create(rawSetting)
    const foundLogPluginSetupProcessor = await Models.Setting.getSettingByPluginAddress(
      createdLogPluginSetupProcessor.pluginAddress,
    )
    expect(foundLogPluginSetupProcessor?.transactionHash).to.eq(createdLogPluginSetupProcessor.history[0].fromTxHash)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    await createdLogDao.reload()

    expect(createdLogDao.fromTxHash).to.eq(rawSetting.fromTxHash)
  })
})
