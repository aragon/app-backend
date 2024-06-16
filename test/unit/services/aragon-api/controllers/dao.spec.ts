import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/aragon-api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoList } from '@test/mock/fakeDao'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('get daos getWithPagination', async () => {
    it('get daos with pagination - all params', async () => {
      const stupReq = sandbox.stub(Models.Dao, 'findWithPagination').resolves({
        data: [{ id: 1, name: 'Test DAO', filterKeys: () => ({ name: 'Test DAO' }) }],
        metadata: {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 1,
        },
      })

      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: NetworksEnum.mainnet,
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      }

      const response = await DaoController.getDaosWithPagination(paginationParams, filterParams)

      expect(stupReq.calledOnce).to.be.true
      expect(
        stupReq.calledWith(
          { networks: [filterParams.network], pluginAddress: filterParams.pluginAddress },
          {
            search: '',
            endDate: '',
            startDate: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        ),
      ).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].name).to.eq('Test DAO')
      expect(response.metadata.currentPage).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    describe('getDaoByPermalink', () => {
      it('should get by permalink', async () => {
        const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
          ...DaoList[0],
          filterKeys: () => DaoList[0],
        })
        const permalink = 'test-dao'
        const dao = await DaoController.getDaoByPermalink(permalink)
        expect(stub.calledOnce).to.be.true
        expect(dao).to.deep.eq(DaoList[0])
      })

      it('should fail to get by permalink', async () => {
        sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
        const permalink = 'test-dao'
        await expect(DaoController.getDaoByPermalink(permalink)).to.be.rejectedWith(ErrorKeyEnum.notFound)
      })
    })

    describe('getDaoPlugin', () => {
      it('should get dao plugin', async () => {
        const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
          ...DaoList[0],
          filterKeys: () => DaoList[0],
        })
        const permalink = 'test-dao'
        const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'

        const findByAddressPluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
          ...DaoList[0].plugins[0],
          filterKeys: () => DaoList[0].plugins[0],
        })

        const plugin = await DaoController.getDaoPlugin({ permalink, pluginAddress })
        expect(stub.calledOnce).to.be.true
        expect(findByAddressPluginStub.calledOnce).to.be.true
        expect(plugin).to.deep.eq(DaoList[0].plugins[0])
      })

      it('should fail to get dao plugin', async () => {
        sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
        const permalink = 'test-dao'
        const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'
        await expect(DaoController.getDaoPlugin({ permalink, pluginAddress })).to.be.rejectedWith(ErrorKeyEnum.notFound)
      })

      it('should fail if the plugin is not from dao', async () => {
        sandbox.stub(Models.Dao, 'findByPermalink').resolves(DaoList[0])
        const permalink = 'test-dao'
        const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754282'
        await expect(
          DaoController.getDaoPlugin({
            permalink,
            pluginAddress,
          }),
        ).to.be.rejectedWith(ErrorKeyEnum.pluginNotFound)
      })
    })
  })

  describe('getDaoMembersWithPagination', () => {
    it('should get dao members with pagination', async () => {
      const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
        ...DaoList[0],
        filterKeys: () => DaoList[0],
      })
      const permalink = 'test-dao'
      const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const findByMemberStub = sandbox.stub(Models.Member, 'findWithPagination').resolves({
        data: [
          {
            address: '0x123',
          },
        ],
      })

      const members = await DaoController.getDaoMembersWithPagination(paginationParams, { permalink, pluginAddress })
      expect(stub.calledOnce).to.be.true
      expect(members).to.have.property('data').with.lengthOf(1)
      expect(findByMemberStub.calledOnce).to.be.true
      expect(findByMemberStub.calledWith({ daoAddress: DaoList[0].address, pluginAddress }, paginationParams)).to.be
        .true
    })

    it('should fail to get dao members with pagination', async () => {
      sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
      const permalink = 'test-dao'
      const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      await expect(
        DaoController.getDaoMembersWithPagination(paginationParams, { permalink, pluginAddress }),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaoProposalsWithPagination', () => {
    it('should get dao proposals with pagination', async () => {
      const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
        ...DaoList[0],
        filterKeys: () => DaoList[0],
      })

      const permalink = 'test-dao'
      const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'

      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const findByProposalStub = sandbox.stub(Models.Proposal, 'findWithPagination').resolves({
        data: [
          {
            address: '0x123',
            filterKeys: () => ({ address: '0x123' }),
          },
        ],
      })

      const proposals = await DaoController.getDaoProposalsWithPagination(paginationParams, {
        permalink,
        pluginAddress,
      })

      expect(stub.calledOnce).to.be.true
      expect(proposals).to.have.property('data').with.lengthOf(1)
      expect(findByProposalStub.calledOnce).to.be.true
      expect(findByProposalStub.calledWith({ daoAddress: DaoList[0].address, pluginAddress }, paginationParams)).to.be
        .true
    })

    it('should fail to get dao proposals with pagination', async () => {
      sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
      const permalink = 'test-dao'
      const pluginAddress = '0x4423f3a76d2090e1388cb67fb7b2ae162f754281'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      await expect(
        DaoController.getDaoProposalsWithPagination(paginationParams, { permalink, pluginAddress }),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaoAssetsWithPagination', () => {
    it('should get dao assets with pagination', async () => {
      const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
        ...DaoList[0],
        filterKeys: () => DaoList[0],
      })

      const permalink = 'test-dao'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const findByAssetStub = sandbox.stub(Models.Asset, 'findWithPagination').resolves({
        data: [
          {
            address: '0x123',
          },
        ],
      })

      const assets = await DaoController.getDaoAssetsWithPagination(paginationParams, { permalink })

      expect(stub.calledOnce).to.be.true
      expect(assets).to.have.property('data').with.lengthOf(1)
      expect(findByAssetStub.calledOnce).to.be.true
      expect(findByAssetStub.calledWith({ daoAddress: DaoList[0].address }, paginationParams)).to.be.true
    })

    it('should fail to get dao assets with pagination', async () => {
      sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
      const permalink = 'test-dao'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      await expect(DaoController.getDaoAssetsWithPagination(paginationParams, { permalink })).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })
  })

  describe('getDaoTransactionsWithPagination', () => {
    it('should get dao transactions with pagination', async () => {
      const stub = sandbox.stub(Models.Dao, 'findByPermalink').resolves({
        ...DaoList[0],
        filterKeys: () => DaoList[0],
      })

      const permalink = 'test-dao'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const findByTransactionStub = sandbox.stub(Models.Transaction, 'findWithPagination').resolves({
        data: [
          {
            address: '0x123',
          },
        ],
      })

      const transactions = await DaoController.getDaoTransactionsWithPagination(paginationParams, { permalink })

      expect(stub.calledOnce).to.be.true
      expect(transactions).to.have.property('data').with.lengthOf(1)
      expect(findByTransactionStub.calledOnce).to.be.true
      expect(findByTransactionStub.calledWith({ daoAddress: DaoList[0].address }, paginationParams)).to.be.true
    })

    it('should fail to get dao transactions with pagination', async () => {
      sandbox.stub(Models.Dao, 'findByPermalink').resolves(null)
      const permalink = 'test-dao'
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      await expect(DaoController.getDaoTransactionsWithPagination(paginationParams, { permalink })).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })
  })

  describe('getDaoPluginSettings', () => {
    it('should get dao plugin setting', async () => {
      const daoDb = await Models.Dao.create(DaoList[0])

      const rawSetting = {
        network: NetworksEnum.mainnet,
        pluginAddress: DaoList[0].plugins[0].address,
        history: [
          {
            fromTxHash: '0xbc7bd245fc5775d05d546d69136879bff2d5b9c43e969e644536e895a31e635d',
            toTxHash: null,
            fromBlockNumber: 18939029,
            toBlockNumber: null,
            settings: {
              minApprovals: 1,
              onlyListed: true,
              votingMode: 1,
              supportThreshold: 500000,
              minParticipation: 170000,
              minDuration: 172800,
              minProposerVotingPower: '1.4844e+23',
            },
          },
        ],
      }
      await Models.Setting.create(rawSetting)

      const setting = await DaoController.getDaoPluginSettings({
        permalink: daoDb.permalink,
        pluginAddress: rawSetting.pluginAddress,
      })

      expect(setting.blockNumber).to.eq(rawSetting.history[0].fromBlockNumber)
      expect(setting.transactionHash).to.eq(rawSetting.history[0].fromTxHash)
      expect(setting.settings.minApprovals).to.eq(rawSetting.history[0].settings.minApprovals)
      expect(setting.settings.onlyListed).to.eq(rawSetting.history[0].settings.onlyListed)
      expect(setting.settings.votingMode).to.eq(rawSetting.history[0].settings.votingMode)
      expect(setting.settings.supportThreshold).to.eq(rawSetting.history[0].settings.supportThreshold)
      expect(setting.settings.minParticipation).to.eq(rawSetting.history[0].settings.minParticipation)
      expect(setting.settings.minDuration).to.eq(rawSetting.history[0].settings.minDuration)
      expect(setting.settings.minProposerVotingPower).to.eq(rawSetting.history[0].settings.minProposerVotingPower)
    })
  })
})
