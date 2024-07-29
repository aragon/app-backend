import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/aragon-api/controllers/dao'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoList } from '@test/mock/fakeDao'
import Dao from '@models/schema/dao'
import PairDataModule from '@modules/pairData'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0x0',
      blockNumber: 0,
      blockTimestamp: 2141242,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: 'dao.eth',
      subdomain: 'dao',
      members: 10,
      metadataIpfs: 'metadataIpfs',
      name: 'fake-name',
      description: 'fake-description',
      avatar: 'fake-avatar',
      links: [
        {
          name: 'fake-name',
          url: 'fake-url',
        },
      ],
      metrics: {
        members: 15,
        proposalsCreated: 5,
        proposalsExecuted: 3,
        uniqueVoters: 100,
        votes: 500,
      },
      tvlUSD: 10000,
      plugins: [
        {
          transactionHash: '0x0',
          blockNumber: 0,
          address: '0x0',
          implementationAddress: '0x0',
          tokenAddress: '0x01',
          pluginSetupRepoAddress: '0x02',
          release: '0',
          build: '0',
          subdomain: 'test',
        },
      ],
      hideDao: false,
    }
    await Models.Dao.create(rawDao)
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
      const daoDb = await Models.Dao.create(DaoList[0])

      const dao = await DaoController.getDaoById(daoDb.id)
      expect(dao.id).to.eq(daoDb.id)
    })

    it('should fail to getDaoById', async () => {
      sandbox.stub(Models.Dao, 'findByEntityId').resolves(null)
      const daoId = 'test-member'
      await expect(DaoController.getDaoById(daoId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaoByAddress', () => {
    it('should getDaoByAddress', async () => {
      const daoDB = await Models.Dao.create(DaoList[0])

      const daoDb = await DaoController.getDaoByAddress(daoDB.address, daoDB.network)
      expect(daoDb.id).to.eq(daoDB.id)
    })

    it('should fail to getDaoByAddress', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const address = 'test-member'
      const network = NetworksEnum.baseMainnet
      await expect(DaoController.getDaoByAddress(address, network)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getDaosByMember', () => {
    it('should get daos by member', async () => {
      const findStub = sandbox.stub(Models.Member, 'findDaoOfMemberWithPagination').resolves([true])
      const checkIFEnsStub = sandbox
        .stub(PairDataModule, 'checkIFEns')
        .resolves('0x17366cae2b9c6c3055e9e3c78936a69006be5409')
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const filterParams: any = {
        memberAddress: 'abc.eth',
      }

      await DaoController.getDaosByMember(paginationParams, filterParams)
      expect(checkIFEnsStub.calledOnce).to.be.true
      expect(findStub.calledOnce).to.be.true
      expect(findStub.args[0][0]?.memberAddress).to.be.eq('0x17366cae2b9c6c3055e9e3c78936a69006be5409')
    })
  })
})
