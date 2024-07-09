import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import SettingController from '@api/controllers/setting'
import Setting from '@models/schema/setting'
import PairDataModule from "@modules/pairData";

describe.only('Controller: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>
  let settingDb: Setting

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawSetting = {
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
    settingDb = await Models.Setting.create(rawSetting)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getSettingsWithPagination', () => {
    it('should get settings with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawSetting.daos?.[0].network,
        daoAddress: rawSetting.daos?.[0].daoAddress,
        pluginAddress: rawSetting.daos?.[0].pluginAddress,
      }

      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = await SettingController.getSettingsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].daoAddress).to.eq(rawSetting.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(response.data[0].network).to.eq(rawSetting.network)
      expect(response.data[0].settings.votingMode).to.eq(rawSetting.settings?.votingMode)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get settings no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = await SettingController.getSettingsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].daoAddress).to.eq(rawSetting.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(response.data[0].network).to.eq(rawSetting.network)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get settings with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawSetting.network}-${rawSetting.daoAddress}`
      }

      sandbox.stub(Models.Dao, 'findByEntityId').resolves({
        address: rawSetting.daoAddress,
        network: rawSetting.network,
      })
      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = await SettingController.getSettingsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawSetting.daoAddress,
            network: rawSetting.network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].daoAddress).to.eq(rawSetting.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(response.data[0].network).to.eq(rawSetting.network)
      expect(response.data[0].settings.votingMode).to.eq(rawSetting.settings?.votingMode)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get settings with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const pairParams: any = {
        daoId: `${rawSetting.network}-${rawSetting.daoAddress}`
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = await SettingController.getSettingsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  describe('getActiveSettingByDaoId', () => {
    it('should getActiveSettingByDaoAddress', async () => {
      const newSettingDb = await Models.Setting.create({
        daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
        pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
        network: NetworksEnum.polygonMainnet,
        fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef0',
        fromBlockNumber: 47758873,
        settings: {
          votingMode: 1,
          supportThreshold: 500000,
          minParticipation: 150000,
          minDuration: 86400,
          minProposerVotingPower: '5e+18',

          minApprovals: 1,
          onlyListed: true,
        },
      })

      sandbox
        .stub(Models.Dao, 'findByEntityId')
        .resolves({ network: newSettingDb.network, address: newSettingDb.daoAddress })
      const setting = await SettingController.getActiveSettingByDaoId(settingDb.id)
      expect(setting.id).to.eq(newSettingDb.id)
    })

    it('should fail to getActiveSettingByDaoAddress', async () => {
      sandbox.stub(Models.Setting, 'findActiveByDaoAddress').resolves(null)
      await expect(
        SettingController.getActiveSettingByDaoAddress(settingDb.daoAddress, settingDb.network),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getActiveSettingByDaoAddress', () => {
    it('should getActiveSettingByDaoAddress', async () => {
      const newSettingDb = await Models.Setting.create({
        daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
        pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
        network: NetworksEnum.polygonMainnet,
        fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef0',
        fromBlockNumber: 47758873,
        settings: {
          votingMode: 1,
          supportThreshold: 500000,
          minParticipation: 150000,
          minDuration: 86400,
          minProposerVotingPower: '5e+18',

          minApprovals: 1,
          onlyListed: true,
        },
      })

      const setting = await SettingController.getActiveSettingByDaoAddress(settingDb.daoAddress, settingDb.network)
      expect(setting.id).to.eq(newSettingDb.id)
    })

    it('should fail to getActiveSettingByDaoAddress', async () => {
      sandbox.stub(Models.Setting, 'findActiveByDaoAddress').resolves(null)
      await expect(
        SettingController.getActiveSettingByDaoAddress(settingDb.daoAddress, settingDb.network),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })
})
