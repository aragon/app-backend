import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Setting from '@models/schema/setting'
import { Models } from '@dbModels'
import { fakeSettings } from '@test/mock/fakeSettings'
import { ISettingStatus, NetworksEnum } from '@types'

describe('Model: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawSetting = {
      ...fakeSettings,
      votingEscrow: {
        minDeposit: '1000000000000000000',
        minLockTime: 86400,
        maxTime: 31536000,
        slope: '1',
        bias: '22',
        cooldown: 86400,
      },
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
      expect(createdSettings.status).to.eq(rawSetting.status)
      expect(createdSettings.votingMode).to.eq(rawSetting.votingMode)
      expect(createdSettings.supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(createdSettings.minParticipation).to.eq(rawSetting.minParticipation)
      expect(createdSettings.minDuration).to.eq(rawSetting.minDuration)
      expect(createdSettings.minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
      expect(createdSettings.votingEscrow.minDeposit).to.eq(rawSetting?.votingEscrow?.minDeposit)
      expect(createdSettings.votingEscrow.minLockTime).to.eq(rawSetting?.votingEscrow?.minLockTime)
      expect(createdSettings.votingEscrow.maxTime).to.eq(rawSetting?.votingEscrow?.maxTime)
      expect(createdSettings.votingEscrow.slope).to.eq(rawSetting?.votingEscrow?.slope)
      expect(createdSettings.votingEscrow.bias).to.eq(rawSetting?.votingEscrow?.bias)
      expect(createdSettings.votingEscrow.cooldown).to.eq(rawSetting?.votingEscrow?.cooldown)
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

  it('Should correctly find the active Settings', async () => {
    const settings = [
      {
        id: 'xx',
        blockNumber: 1,
        pluginAddress: '0xaa',
        daoAddress: '0xdd',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.active,
      },
      {
        id: 'xx1',
        blockNumber: 3,
        pluginAddress: '0xaa',
        daoAddress: '0xdd',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.inactive,
      },
    ]

    await Models.Setting.insertMany(settings)

    const activeSetting = await Models.Setting.findActive({
      daoAddress: '0xdd',
      pluginAddress: '0xaa',
      network: NetworksEnum.polygonMainnet,
    })

    expect(activeSetting?.id).to.eq('xx')
    expect(activeSetting?.status).to.eq(ISettingStatus.active)
  })

  it('Should find active Settings with tokenAddress filter', async () => {
    const settings = [
      {
        id: 'xx-token',
        blockNumber: 1,
        pluginAddress: '0xaa',
        daoAddress: '0xdd',
        tokenAddress: '0xtoken123',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.active,
      },
      {
        id: 'xx-token2',
        blockNumber: 2,
        pluginAddress: '0xbb',
        daoAddress: '0xdd',
        tokenAddress: '0xtoken456',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.active,
      },
    ]

    await Models.Setting.insertMany(settings)

    const activeSetting = await Models.Setting.findActive({
      tokenAddress: '0xtoken123',
      network: NetworksEnum.polygonMainnet,
    })

    expect(activeSetting?.id).to.eq('xx-token')
    expect(activeSetting?.tokenAddress).to.eq('0xtoken123')
    expect(activeSetting?.status).to.eq(ISettingStatus.active)
  })

  it('Should correctly find the last setting by blockNumber', async () => {
    const settings = [
      {
        id: 'xx',
        blockNumber: 1,
        pluginAddress: '0x',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.active,
      },
      {
        id: 'xx1',
        blockNumber: 3,
        pluginAddress: '0x',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.inactive,
      },
      {
        id: 'xx2',
        blockNumber: 8,
        pluginAddress: '0x',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.inactive,
      },
      {
        id: 'xx3',
        blockNumber: 11,
        pluginAddress: '0x',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.inactive,
      },
      {
        id: 'xx4',
        blockNumber: 15,
        pluginAddress: '0x',
        network: NetworksEnum.polygonMainnet,
        transactionHash: '0x',
        status: ISettingStatus.inactive,
      },
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

  it('Should getPlugin', async () => {
    // Create a plugin for testing
    const pluginData = {
      id: 'plugin-1',
      address: rawSetting.pluginAddress,
      network: rawSetting.network,
      daoAddress: rawSetting.daoAddress,
      version: 1,
      contractName: 'TestPlugin',
      supportedVersion: '1.0.0',
      interfaceType: 'tokenVoting',
      isSupported: true,
      status: 'active',
      blockNumber: 100,
      transactionHash: '0xtest123',
    }
    await Models.Plugin.create(pluginData)

    // Create setting and test getPlugin
    const createdSetting = await Models.Setting.create(rawSetting)
    const plugin = await createdSetting.getPlugin()

    expect(plugin).to.not.be.null
    expect(plugin?.address).to.eq(rawSetting.pluginAddress)
    expect(plugin?.network).to.eq(rawSetting.network)
    expect(plugin?.contractName).to.eq('TestPlugin')
  })

  describe('findWithPagination', () => {
    beforeEach(async () => {
      await Models.Setting.create(rawSetting)
    })

    it('Should find all settings with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find the settings by daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {
          daoAddress: rawSetting.daoAddress,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should not find the settings by daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {
          daoAddress: '0xBeB63a356',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })
  })

  describe('should find settings', () => {
    it('should find the settings by different filters', async () => {
      await Models.Setting.create(rawSetting)
      const settings = await Models.Setting.findSetting({
        daoAddress: rawSetting.daoAddress,
        pluginAddress: rawSetting.pluginAddress,
        network: rawSetting.network,
        status: rawSetting.status,
      })
      expect(settings.votingMode).to.eq(rawSetting.votingMode)
      expect(settings.supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(settings.minParticipation).to.eq(rawSetting.minParticipation)
    })
  })
})
