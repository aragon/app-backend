import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Setting from '@models/schema/setting'
import { Models } from '@dbModels'
import { fakeSettings } from '@test/mock/fakeSettings'
import { NetworksEnum } from '@types'

describe('Model: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawSetting = {
      ...fakeSettings,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Setting', async () => {
    it('Should create Setting', async () => {
      rawSetting.id = Models.Setting.getEntityId({
        transactionHash: rawSetting.transactionHash,
        pluginAddress: rawSetting.pluginAddress,
      })
      const createdSettings = await Models.Setting.create(rawSetting)

      expect(createdSettings.id).to.eq(rawSetting.id)
      expect(createdSettings.pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(createdSettings.network).to.eq(rawSetting.network)
      expect(createdSettings.transactionHash).to.eq(rawSetting.transactionHash)
      expect(createdSettings.blockNumber).to.eq(rawSetting.blockNumber)

      expect(createdSettings.votingMode).to.eq(rawSetting.votingMode)
      expect(createdSettings.supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(createdSettings.minParticipation).to.eq(rawSetting.minParticipation)
      expect(createdSettings.minDuration).to.eq(rawSetting.minDuration)
      expect(createdSettings.minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
    })
  })

  it('Should getEntityId', async () => {
    const transactionHash = rawSetting.transactionHash
    const pluginAddress = rawSetting.pluginAddress
    const entityId = Models.Setting.getEntityId({ transactionHash, pluginAddress })
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}`)
  })

  it('Should findExistingLog', async () => {
    const settingDb = await Models.Setting.create(rawSetting)
    const foundSettingDb = await Models.Setting.findExistingLog({
      transactionHash: settingDb.transactionHash,
      pluginAddress: settingDb.pluginAddress,
    })
    expect(foundSettingDb?.id).to.eq(settingDb.id)
  })

  it('Should findByEntityId', async () => {
    const settingDb = await Models.Setting.create(rawSetting)
    const foundSettingDb = await Models.Setting.findByEntityId(settingDb.id)
    expect(foundSettingDb?.id).to.eq(settingDb.id)
  })

  it('Should correctly find the last setting by blockNumber', async () => {
    const settings = [
      { id: 'xx', blockNumber: 1, pluginAddress: '0x', network: NetworksEnum.polygonMainnet, transactionHash: '0x' },
      { id: 'xx1', blockNumber: 3, pluginAddress: '0x', network: NetworksEnum.polygonMainnet, transactionHash: '0x' },
      { id: 'xx2', blockNumber: 8, pluginAddress: '0x', network: NetworksEnum.polygonMainnet, transactionHash: '0x' },
      { id: 'xx3', blockNumber: 11, pluginAddress: '0x', network: NetworksEnum.polygonMainnet, transactionHash: '0x' },
      { id: 'xx4', blockNumber: 15, pluginAddress: '0x', network: NetworksEnum.polygonMainnet, transactionHash: '0x' },
    ]

    await Models.Setting.insertMany(settings)

    let result: any

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 1)
    expect(result?.blockNumber).to.eq(1)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 2)
    expect(result?.blockNumber).to.eq(1)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 3)
    expect(result?.blockNumber).to.eq(3)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 4)
    expect(result?.blockNumber).to.eq(3)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 5)
    expect(result?.blockNumber).to.eq(3)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 6)
    expect(result?.blockNumber).to.eq(3)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 7)
    expect(result?.blockNumber).to.eq(3)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 8)
    expect(result?.blockNumber).to.eq(8)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 9)
    expect(result?.blockNumber).to.eq(8)

    result = await Models.Setting.findLastSettingByBlockNumber('0x', 15)
    expect(result?.blockNumber).to.eq(15)
  })

  it('Should findByTransactionHash', async () => {
    const createdProposal = await Models.Setting.create(rawSetting)
    const foundProposal = await Models.Setting.findByTransactionHash(
      createdProposal.transactionHash,
      createdProposal.network,
    )
    expect(foundProposal?.id).to.eq(createdProposal.id)
  })

  it('Should update Setting', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    expect(createdLogDao.pluginAddress).to.eq(rawSetting.pluginAddress)

    await createdLogDao.update({
      pluginAddress: '0x00',
    })

    expect(createdLogDao.pluginAddress).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    await createdLogDao.reload()

    expect(createdLogDao.fromTxHash).to.eq(rawSetting.fromTxHash)
  })
})
