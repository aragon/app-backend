import SettingController from '@api/controllers/setting'
import { Models } from '@dbModels'
import Setting from '@models/schema/setting'
import Token from '@models/schema/token'
import PairDataModule from '@modules/pairData'
import { DaoList } from '@test/mock/fakeDao'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import { ErrorKeyEnum, HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>
  let rawToken: Partial<Token>

  let settingDb: Setting

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      ...(FakeToken as any),
    }

    rawSetting = {
      ...(fakeSettings as any),
      tokenAddress: rawToken.address,
      daoAddress: DaoList[0].address,
    }

    await Promise.all([Models.Dao.create(DaoList[0]), Models.Token.create(rawToken), Models.Setting.create(rawSetting)])

    settingDb = (await Models.Setting.findOne({})) as Setting
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
        network: rawSetting.network,
        daoAddress: rawSetting.daoAddress,
        pluginAddress: rawSetting.pluginAddress,
      }

      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = (await SettingController.getSettingsWithPagination(paginationParams, filterParams)) as any

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
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].votingMode).to.eq(rawSetting.votingMode)
      expect(response.data[0].supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(response.data[0].minParticipation).to.eq(rawSetting.minParticipation)
      expect(response.data[0].minDuration).to.eq(rawSetting.minDuration)
      expect(response.data[0].minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
      expect(response.data[0].token.network).to.eq(rawSetting.network)
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

      const response = (await SettingController.getSettingsWithPagination(paginationParams, filterParams)) as any

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
      expect(response.data[0].votingMode).to.eq(rawSetting.votingMode)
      expect(response.data[0].supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(response.data[0].minParticipation).to.eq(rawSetting.minParticipation)
      expect(response.data[0].minDuration).to.eq(rawSetting.minDuration)
      expect(response.data[0].minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
      expect(response.data[0].token.network).to.eq(rawSetting.network)
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
        daoId: `${rawSetting.network}-${rawSetting.daoAddress}`,
      }

      sandbox.stub(Models.Dao, 'findByEntityId').resolves({
        address: rawSetting.daoAddress,
        network: rawSetting.network,
      })
      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = (await SettingController.getSettingsWithPagination(
        paginationParams,
        filterParams,
        pairParams,
      )) as any

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
      expect(response.data[0].votingMode).to.eq(rawSetting.votingMode)
      expect(response.data[0].supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(response.data[0].minParticipation).to.eq(rawSetting.minParticipation)
      expect(response.data[0].minDuration).to.eq(rawSetting.minDuration)
      expect(response.data[0].minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
      expect(response.data[0].token.network).to.eq(rawSetting.network)
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
        daoId: `${rawSetting.network}-${rawSetting.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      const spyReq = sandbox.spy(Models.Setting, 'findWithPagination')

      const response = await SettingController.getSettingsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  describe('getActiveSettingOfDao', () => {
    it('should get active setting by daoId', async () => {
      const daoId = Models.Dao.getEntityId({
        network: rawSetting.network,
        address: rawSetting.daoAddress,
      })
      const pluginAddress = rawSetting.pluginAddress as HexAddress

      const response = await SettingController.getActiveSettingByDaoId(daoId, pluginAddress)

      expect(response.votingMode).to.eq(rawSetting.votingMode)
      expect(response.supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(response.minParticipation).to.eq(rawSetting.minParticipation)
      expect(response.minDuration).to.eq(rawSetting.minDuration)
      expect(response.minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
    })

    it('should get active setting by daoAddress', async () => {
      const pluginAddress = rawSetting.pluginAddress as HexAddress

      const response = await SettingController.getActiveSettingByDaoAddress(
        rawSetting.daoAddress as HexAddress,
        rawSetting.network as NetworksEnum,
        pluginAddress,
      )

      expect(response.votingMode).to.eq(rawSetting.votingMode)
      expect(response.supportThreshold).to.eq(rawSetting.supportThreshold)
      expect(response.minParticipation).to.eq(rawSetting.minParticipation)
      expect(response.minDuration).to.eq(rawSetting.minDuration)
      expect(response.minProposerVotingPower).to.eq(rawSetting.minProposerVotingPower)
    })

    it('should fail when dao not found', async () => {
      const daoId = Models.Dao.getEntityId({
        network: rawSetting.network,
        address: '0xfakeDao',
      })
      const pluginAddress = rawSetting.pluginAddress as HexAddress

      await expect(SettingController.getActiveSettingByDaoId(daoId, pluginAddress)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })

    it('should fail when setting not found', async () => {
      await Models.Setting.deleteMany({})
      const pluginAddress = rawSetting.pluginAddress as HexAddress

      await expect(
        SettingController.getActiveSettingByDaoAddress(
          rawSetting.daoAddress as HexAddress,
          rawSetting.network as NetworksEnum,
          pluginAddress,
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })
})
