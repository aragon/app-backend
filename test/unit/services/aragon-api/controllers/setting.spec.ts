import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SettingController from '@services/aragon-api/controllers/setting'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Setting from '@models/schema/setting'

describe('Controller: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawSetting = {
      daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
      pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
      network: NetworksEnum.polygon,
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
    await Models.Setting.create(rawSetting)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getSettingsWithPagination', () => {
    it('should get settings with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
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
            endDate: '',
            startDate: '',
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
        endDate: '',
        startDate: '',
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
            endDate: '',
            startDate: '',
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
  })
})
