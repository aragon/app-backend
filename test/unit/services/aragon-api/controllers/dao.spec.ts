import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/aragon-api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoList } from '@test/mock/fakeDao'
import Dao from '@models/schema/dao'
import PairDataModule from '@modules/pairData'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { FakeMember } from '@test/mock/fakeMember'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      ...(DaoList[0] as any),
      id: `${DaoList[0].network}-${FakeDaoMemberMappings[0].daoAddress}`,
      address: FakeDaoMemberMappings[0].daoAddress,
    }
    await Models.Dao.create(rawDao)
    await Models.DaoMemberMapping.create(FakeDaoMemberMappings[0])

    await Models.Member.create(FakeMember)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('get daos getWithPagination', async () => {
    it('get daos with pagination - by network and address', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawDao.network,
        address: rawDao.address,
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)

      const spyReq = sandbox.spy(Models.Dao, 'findWithPagination')
      const response = await DaoController.getDaosWithPagination(paginationParams, filterParams)

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
          extraQueryData: {},
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].id).to.eq(`${rawDao.network}-${rawDao.address}`)
      expect(response.data[0].network).to.eq(rawDao.network)
      expect(response.data[0].transactionHash).to.eq(rawDao.transactionHash)
      expect(response.data[0].blockNumber).to.eq(rawDao.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('get daos with pagination - by pluginAddress', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        pluginAddress: rawDao.plugins?.[0].address,
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      const spyReq = sandbox.spy(Models.Dao, 'findWithPagination')
      const response = await DaoController.getDaosWithPagination(paginationParams, filterParams)

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
          extraQueryData: {},
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].id).to.eq(`${rawDao.network}-${rawDao.address}`)
      expect(response.data[0].network).to.eq(rawDao.network)
      expect(response.data[0].transactionHash).to.eq(rawDao.transactionHash)
      expect(response.data[0].blockNumber).to.eq(rawDao.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('get daos with pagination - no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      const spyReq = sandbox.spy(Models.Dao, 'findWithPagination')
      const response = await DaoController.getDaosWithPagination(paginationParams, filterParams)

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
          extraQueryData: {},
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].id).to.eq(`${rawDao.network}-${rawDao.address}`)
      expect(response.data[0].network).to.eq(rawDao.network)
      expect(response.data[0].transactionHash).to.eq(rawDao.transactionHash)
      expect(response.data[0].blockNumber).to.eq(rawDao.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })
  })

  describe('getDaoById', () => {
    it('should getDaoById', async () => {
      const daoDb = await Models.Dao.create(DaoList[1])

      // Add stub for getDaoDetails to verify it's called with correct parameters
      const getDaoDetailsStub = sandbox.stub(Models.Dao, 'getDaoDetails').resolves({ id: daoDb.id } as any)

      const dao = await DaoController.getDaoById(daoDb.id)

      expect(dao.id).to.eq(daoDb.id)
      expect(getDaoDetailsStub.calledOnce).to.be.true
      expect(getDaoDetailsStub.calledWith(daoDb.address, daoDb.network)).to.be.true
    })

    it('should fail to getDaoById', async () => {
      sandbox.stub(Models.Dao, 'findByEntityId').resolves(null)
      const daoId = 'test-member'
      await expect(DaoController.getDaoById(daoId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaoByAddress', () => {
    it('should getDaoByAddress', async () => {
      const daoDB = await Models.Dao.create(DaoList[1])

      // Add stub for getDaoDetails to verify it's called with correct parameters
      const getDaoDetailsStub = sandbox.stub(Models.Dao, 'getDaoDetails').resolves({ id: daoDB.id } as any)

      const daoDb = await DaoController.getDaoByAddress(daoDB.address, daoDB.network)

      expect(daoDb.id).to.eq(daoDB.id)
      expect(getDaoDetailsStub.calledOnce).to.be.true
      expect(getDaoDetailsStub.calledWith(daoDB.address, daoDB.network)).to.be.true
    })

    it('should fail to getDaoByAddress', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const address = 'test-member'
      const network = NetworksEnum.baseMainnet
      await expect(DaoController.getDaoByAddress(address, network)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaoByEns', () => {
    it('should getDaoByEns', async () => {
      // Create a DAO with ENS
      const daoWithEns = {
        ...DaoList[1],
        ens: 'test-dao.eth',
      }
      const daoDB = await Models.Dao.create(daoWithEns)

      // Add stub for getDaoDetails to verify it's called with correct parameters
      const getDaoDetailsStub = sandbox.stub(Models.Dao, 'getDaoDetails').resolves({ id: daoDB.id } as any)

      const dao = await DaoController.getDaoByEns(daoDB.ens, daoDB.network)

      expect(dao.id).to.eq(daoDB.id)
      expect(getDaoDetailsStub.calledOnce).to.be.true
      expect(getDaoDetailsStub.calledWith(daoDB.address, daoDB.network)).to.be.true
    })

    it('should fail to getDaoByEns', async () => {
      sandbox.stub(Models.Dao, 'findOne').resolves(null)
      const ens = 'non-existent-dao.eth'
      const network = NetworksEnum.baseMainnet
      await expect(DaoController.getDaoByEns(ens, network)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaosByMember', () => {
    it('should getDaosByMember', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawDao.network,
        memberAddress: FakeDaoMemberMappings[0].memberAddress,
      }

      const spyReq = sandbox.spy(Models.Dao, 'findWithPagination')

      const response = await DaoController.getDaosByMember(paginationParams, filterParams)
      expect(spyReq.calledOnce).to.be.true
      expect(response.data.length).to.eq(1)
      expect(response.data[0].address).to.be.eq(rawDao.address)
    })

    it('should filter out excluded DAO when getting DAOs by member', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawDao.network,
        memberAddress: FakeMember.address,
        excludeDaoId: `${rawDao.network}-${rawDao.address}`,
      }

      const fakeMapping = [
        { daoAddress: '0xDaoAddress1' },
        { daoAddress: '0xDaoAddress2' },
        { daoAddress: rawDao.address },
      ]

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'pairFromDaoMemberMapping').resolves(fakeMapping)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(filterParams.memberAddress)
      sandbox
        .stub(PairDataModule, 'pairFromExtraParams')
        .resolves({ daoAddress: rawDao.address, network: rawDao.network })

      const spyReq = sandbox.spy(Models.Dao, 'findWithPagination')

      const response = await DaoController.getDaosByMember(paginationParams, filterParams)

      // Assertions
      expect(spyReq.calledOnce).to.be.true

      const expectedDaoAddresses = ['0xDaoAddress1', '0xDaoAddress2']
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams,
          extraQueryData: { daoAddresses: expectedDaoAddresses },
        }),
      ).to.be.true

      expect(response.data.length).to.eq(0)
    })
  })
})
