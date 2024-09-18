import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import SettingController from '@api/controllers/setting'
import Setting from '@models/schema/setting'
import PairDataModule from '@modules/pairData'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import Token from '@models/schema/token'

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
    }

    await Promise.all([Models.Token.create(rawToken), Models.Setting.create(rawSetting)])

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
      expect(response.data[0].votingMode).to.eq(rawSetting?.votingMode)
      expect(response.data[0].tokenAddress).to.eq(rawSetting.tokenAddress)
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
        daoId: `${rawSetting.network}-${rawSetting.daoAddress}`,
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
      expect(response.data[0].votingMode).to.eq(rawSetting.votingMode)
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
})
