import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DaoController from '@services/aragon-api/controllers/dao'
import { ErrorKeyEnum, HexAddress, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoList } from '@test/mock/fakeDao'
import Dao from '@models/schema/dao'
import PairDataModule from '@modules/pairData'
import { FakeMember } from '@test/mock/fakeMember'

describe('Controller: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      ...(DaoList[0] as any),
    }
    await Models.Dao.create(rawDao)
    await Models.PluginMember.create({
      memberAddress: FakeMember.address,
      pluginAddress: '0xPluginAddress',
      daoAddress: rawDao.address,
      network: rawDao.network,
    })

    await Models.Member.create(FakeMember)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDaosWithPagination', () => {
    it('should get daos with default pagination params', async () => {
      const mockPaginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const mockResponse = {
        data: [{ id: '1', address: '0x123' }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      const stubPairFromPaginationParams = sandbox
        .stub(PairDataModule, 'pairFromPaginationParams')
        .resolves(mockPaginationParams)
      const stubPairExtraQueryData = sandbox.stub(PairDataModule, 'pairExtraQueryData').resolves({})
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosWithPagination()

      expect(stubPairFromPaginationParams.calledOnce).to.be.true
      expect(stubPairFromPaginationParams.calledWith({})).to.be.true
      expect(stubPairExtraQueryData.calledOnce).to.be.true
      expect(stubPairExtraQueryData.calledWith({})).to.be.true
      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams: {},
          paginationParams: mockPaginationParams,
          extraQueryData: {},
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should get daos with network and address filters', async () => {
      const paginationParams = {
        search: 'test',
        pageSize: 20,
        page: 2,
        order: 'desc',
        sort: 'blockNumber',
      }

      const extraParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
      }

      const mockExtraQueryData = { someField: 'someValue' }
      const mockResponse = {
        data: [{ id: '1', address: '0x123' }],
        metadata: { page: 2, totalPages: 3, totalRecords: 50 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'pairExtraQueryData').resolves(mockExtraQueryData as any)
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosWithPagination(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: mockExtraQueryData,
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should get daos with pluginAddress filter', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: '0xPluginAddress',
      }

      const mockResponse = {
        data: [{ id: '1', address: '0x123' }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'pairExtraQueryData').resolves({})
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosWithPagination(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: {},
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })
  })

  describe('getDaoById', () => {
    it('should get dao by id successfully', async () => {
      const mockDao = {
        id: 'ethereum-mainnet-0x123',
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockDaoDetails = {
        id: mockDao.id,
        address: mockDao.address,
        network: mockDao.network,
        name: 'Test DAO',
      }

      const stubFindByEntityId = sandbox.stub(Models.Dao, 'findByEntityId').resolves(mockDao)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails').resolves(mockDaoDetails)

      const result = await DaoController.getDaoById(mockDao.id)

      expect(stubFindByEntityId.calledOnce).to.be.true
      expect(stubFindByEntityId.calledWith(mockDao.id)).to.be.true
      expect(stubGetDaoDetails.calledOnce).to.be.true
      expect(stubGetDaoDetails.calledWith(mockDao.address, mockDao.network)).to.be.true
      expect(result).to.deep.equal(mockDaoDetails)
    })

    it('should throw notFound error when dao not found', async () => {
      const stubFindByEntityId = sandbox.stub(Models.Dao, 'findByEntityId').resolves(null)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails')

      await expect(DaoController.getDaoById('non-existent-id')).to.be.rejectedWith(ErrorKeyEnum.notFound)

      expect(stubFindByEntityId.calledOnce).to.be.true
      expect(stubGetDaoDetails.notCalled).to.be.true
    })
  })

  describe('getDaoByAddress', () => {
    it('should get dao by address successfully', async () => {
      const mockDao = {
        id: 'ethereum-mainnet-0x123',
        address: '0x123' as HexAddress,
        network: NetworksEnum.ethereumMainnet,
      }

      const mockDaoDetails = {
        id: mockDao.id,
        address: mockDao.address,
        network: mockDao.network,
        name: 'Test DAO',
      }

      const stubFindByAddress = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails').resolves(mockDaoDetails)

      const result = await DaoController.getDaoByAddress(mockDao.address, mockDao.network)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindByAddress.calledWith(mockDao.address, mockDao.network)).to.be.true
      expect(stubGetDaoDetails.calledOnce).to.be.true
      expect(stubGetDaoDetails.calledWith(mockDao.address, mockDao.network)).to.be.true
      expect(result).to.deep.equal(mockDaoDetails)
    })

    it('should throw notFound error when dao not found by address', async () => {
      const stubFindByAddress = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails')

      await expect(
        DaoController.getDaoByAddress('0x999' as HexAddress, NetworksEnum.ethereumMainnet),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubGetDaoDetails.notCalled).to.be.true
    })
  })

  describe('getDaoByEns', () => {
    it('should get dao by ens successfully', async () => {
      const mockDao = {
        id: 'ethereum-mainnet-0x123',
        address: '0x123' as HexAddress,
        network: NetworksEnum.ethereumMainnet,
        ens: 'test-dao.eth',
      }

      const mockDaoDetails = {
        id: mockDao.id,
        address: mockDao.address,
        network: mockDao.network,
        ens: mockDao.ens,
        name: 'Test DAO',
      }

      const stubFindOne = sandbox.stub(Models.Dao, 'findOne').resolves(mockDao)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails').resolves(mockDaoDetails)

      const result = await DaoController.getDaoByEns(mockDao.ens, mockDao.network)

      expect(stubFindOne.calledOnce).to.be.true
      expect(
        stubFindOne.calledWith({
          ens: mockDao.ens,
          network: mockDao.network,
          isHidden: { $ne: true },
          isActive: { $eq: true },
        }),
      ).to.be.true
      expect(stubGetDaoDetails.calledOnce).to.be.true
      expect(stubGetDaoDetails.calledWith(mockDao.address, mockDao.network)).to.be.true
      expect(result).to.deep.equal(mockDaoDetails)
    })

    it('should throw notFound error when dao not found by ens', async () => {
      const stubFindOne = sandbox.stub(Models.Dao, 'findOne').resolves(null)
      const stubGetDaoDetails = sandbox.stub(Models.Dao, 'getDaoDetails')

      await expect(DaoController.getDaoByEns('non-existent.eth', NetworksEnum.ethereumMainnet)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )

      expect(stubFindOne.calledOnce).to.be.true
      expect(stubGetDaoDetails.notCalled).to.be.true
    })
  })

  describe('getDaosByMember', () => {
    it('should get daos by member successfully', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: '0xMemberAddress',
        networks: [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet],
      }

      const mockMappings = [{ daoAddress: '0xDao1' }, { daoAddress: '0xDao2' }]

      const mockResponse = {
        data: [
          { id: '1', address: '0xDao1' },
          { id: '2', address: '0xDao2' },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 2 },
      }

      const stubPairFromPaginationParams = sandbox
        .stub(PairDataModule, 'pairFromPaginationParams')
        .resolves(paginationParams)
      const stubCheckIFEns = sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      const stubPairAllMemberOfDao = sandbox.stub(PairDataModule, 'pairAllMemberOfDao').resolves(mockMappings)
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubPairFromPaginationParams.calledOnce).to.be.true
      expect(stubCheckIFEns.calledOnce).to.be.true
      expect(stubCheckIFEns.calledWith(extraParams.memberAddress)).to.be.true
      expect(stubPairAllMemberOfDao.calledTwice).to.be.true // Called for each network
      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: { daoAddresses: ['0xDao1', '0xDao2'] },
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should exclude dao when excludeDaoId is provided', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: '0xMemberAddress',
        networks: [NetworksEnum.ethereumMainnet],
        excludeDaoId: 'ethereum-mainnet-0xDao2',
      }

      const mockExcludedDao = {
        daoAddress: '0xDao2',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockMappings = [
        { daoAddress: '0xDao1' },
        { daoAddress: '0xDao2' }, // This should be excluded
        { daoAddress: '0xDao3' },
      ]

      const mockResponse = {
        data: [
          { id: '1', address: '0xDao1' },
          { id: '3', address: '0xDao3' },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 2 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(mockExcludedDao)
      sandbox.stub(PairDataModule, 'pairAllMemberOfDao').resolves(mockMappings)
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams: {
            ...extraParams,
            excludedDao: mockExcludedDao,
          },
          paginationParams,
          extraQueryData: { daoAddresses: ['0xDao1', '0xDao3'] }, // 0xDao2 excluded
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should handle empty dao addresses', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: '0xMemberAddress',
        networks: [NetworksEnum.ethereumMainnet],
      }

      const mockResponse = {
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      sandbox.stub(PairDataModule, 'pairAllMemberOfDao').resolves([]) // No mappings
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: { daoAddresses: [] },
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should handle duplicate dao addresses', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: '0xMemberAddress',
        networks: [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet],
      }

      const mockMappings1 = [{ daoAddress: '0xDao1' }, { daoAddress: '0xDao2' }]

      const mockMappings2 = [
        { daoAddress: '0xDao2' }, // Duplicate
        { daoAddress: '0xDao3' },
      ]

      const mockResponse = {
        data: [
          { id: '1', address: '0xDao1' },
          { id: '2', address: '0xDao2' },
          { id: '3', address: '0xDao3' },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 3 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      const stubPairAllMemberOfDao = sandbox.stub(PairDataModule, 'pairAllMemberOfDao')
      stubPairAllMemberOfDao.onFirstCall().resolves(mockMappings1)
      stubPairAllMemberOfDao.onSecondCall().resolves(mockMappings2)
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: { daoAddresses: ['0xDao1', '0xDao2', '0xDao3'] }, // Deduplicated
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should handle ENS resolution for member address', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: 'vitalik.eth',
        networks: [NetworksEnum.ethereumMainnet],
      }

      const resolvedAddress = '0xResolvedAddress'

      const mockMappings = [{ daoAddress: '0xDao1' }]

      const mockResponse = {
        data: [{ id: '1', address: '0xDao1' }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      const stubCheckIFEns = sandbox.stub(PairDataModule, 'checkIFEns').resolves(resolvedAddress)
      const stubPairAllMemberOfDao = sandbox.stub(PairDataModule, 'pairAllMemberOfDao').resolves(mockMappings)
      sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubCheckIFEns.calledOnce).to.be.true
      expect(stubCheckIFEns.calledWith('vitalik.eth')).to.be.true
      expect(
        stubPairAllMemberOfDao.calledWith({
          memberAddress: resolvedAddress, // Should use resolved address
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should filter out null/undefined dao addresses', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        memberAddress: '0xMemberAddress',
        networks: [NetworksEnum.ethereumMainnet],
      }

      const mockMappings = [
        { daoAddress: '0xDao1' },
        { daoAddress: null },
        { daoAddress: undefined },
        { daoAddress: '0xDao2' },
      ]

      const mockResponse = {
        data: [
          { id: '1', address: '0xDao1' },
          { id: '2', address: '0xDao2' },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 2 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      sandbox.stub(PairDataModule, 'pairAllMemberOfDao').resolves(mockMappings as any)
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
          extraQueryData: { daoAddresses: ['0xDao1', '0xDao2'] }, // null/undefined filtered out
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })
  })
})
