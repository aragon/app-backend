import { Models } from '@dbModels'
import Dao from '@models/schema/dao'
import PairDataModule from '@modules/pairData'
import DaoController from '@services/aragon-api/controllers/dao'
import { DaoList } from '@test/mock/fakeDao'
import { FakeMember } from '@test/mock/fakeMember'
import { ErrorKeyEnum, HexAddress, MembershipData, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

      const result = await DaoController.getDaosWithPagination({}, {})

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

      try {
        await DaoController.getDaoById('non-existent-id')
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal(ErrorKeyEnum.notFound)
      }

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

      try {
        await DaoController.getDaoByAddress('0x999' as HexAddress, NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal(ErrorKeyEnum.notFound)
      }

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

      try {
        await DaoController.getDaoByEns('non-existent.eth', NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal(ErrorKeyEnum.notFound)
      }

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
      const stubGetDaosOfMemberInNetwork = sandbox
        .stub(DaoController, 'getDaosOfMemberInNetwork')
        .resolves(['0xDao1', '0xDao2'])
      const stubFindWithPagination = sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubPairFromPaginationParams.calledOnce).to.be.true
      expect(stubCheckIFEns.calledOnce).to.be.true
      expect(stubCheckIFEns.calledWith(extraParams.memberAddress)).to.be.true
      expect(stubGetDaosOfMemberInNetwork.calledOnce).to.be.true
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
      sandbox.stub(DaoController, 'getDaosOfMemberInNetwork').resolves(['0xDao1', '0xDao2', '0xDao3'])
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
          extraQueryData: { daoAddresses: ['0xDao1', '0xDao2', '0xDao3'] },
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
      sandbox.stub(DaoController, 'getDaosOfMemberInNetwork').resolves([])
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
      sandbox.stub(DaoController, 'getDaosOfMemberInNetwork').resolves(['0xDao1', '0xDao2', '0xDao3'])
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

      const mockResponse = {
        data: [{ id: '1', address: '0xDao1' }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      const stubCheckIFEns = sandbox.stub(PairDataModule, 'checkIFEns').resolves(resolvedAddress)
      sandbox.stub(DaoController, 'getDaosOfMemberInNetwork').resolves(['0xDao1'])
      sandbox.stub(Models.Dao, 'findWithPagination').resolves(mockResponse)

      const result = await DaoController.getDaosByMember(paginationParams, extraParams)

      expect(stubCheckIFEns.calledOnce).to.be.true
      expect(stubCheckIFEns.calledWith('vitalik.eth')).to.be.true
      // getDaosOfMemberInNetwork is called internally
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

      const mockResponse = {
        data: [
          { id: '1', address: '0xDao1' },
          { id: '2', address: '0xDao2' },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 2 },
      }

      sandbox.stub(PairDataModule, 'pairFromPaginationParams').resolves(paginationParams)
      sandbox.stub(PairDataModule, 'checkIFEns').resolves(extraParams.memberAddress)
      sandbox.stub(DaoController, 'getDaosOfMemberInNetwork').resolves(['0xDao1', '0xDao2'])
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

  describe('getDaosOfMemberInNetwork', () => {
    it('should get daos for member from all membership types', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = { network: NetworksEnum.ethereumMainnet }

      // Prepare mock aggregate results with network context
      const tokenMembersWithNetwork = [
        { tokenAddress: '0xToken1', network: NetworksEnum.ethereumMainnet },
        { tokenAddress: '0xToken2', network: NetworksEnum.ethereumMainnet },
      ]
      const veMembersWithNetwork = [{ tokenAddress: '0xVeToken1', network: NetworksEnum.ethereumMainnet }]
      const lockMembersWithNetwork = [
        {
          lockManagerAddress: '0xLockManager1',
          network: NetworksEnum.ethereumMainnet,
        },
      ]
      const pluginMembersWithNetwork = [
        { pluginAddress: '0xPlugin1', network: NetworksEnum.ethereumMainnet },
        { pluginAddress: '0xPlugin2', network: NetworksEnum.ethereumMainnet },
      ]

      const expectedDaoAddresses = ['0xDao1', '0xDao2', '0xDao3']

      // Stub the aggregate calls instead of distinct
      sandbox.stub(Models.TokenMember, 'aggregate').resolves(tokenMembersWithNetwork)
      sandbox.stub(Models.Lock, 'aggregate').resolves(veMembersWithNetwork)
      sandbox.stub(Models.LockToVoteMember, 'aggregate').resolves(lockMembersWithNetwork)
      sandbox.stub(Models.PluginMember, 'aggregate').resolves(pluginMembersWithNetwork)

      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves(expectedDaoAddresses)

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(stubPluginDistinct.calledOnce).to.be.true
      const callArgs = stubPluginDistinct.firstCall.args
      expect(callArgs[0]).to.equal('daoAddress')
      const query = callArgs[1]
      expect(query.$or.length).to.equal(4)
      expect(query.status).to.equal('installed')
      expect(query.isSupported).to.equal(true)
      expect(query.network).to.equal(NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal(expectedDaoAddresses)
    })

    it('should handle empty membership arrays', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      // All membership queries return empty arrays
      sandbox.stub(Models.TokenMember, 'aggregate').resolves([])
      sandbox.stub(Models.Lock, 'aggregate').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'aggregate').resolves([])
      sandbox.stub(Models.PluginMember, 'aggregate').resolves([])

      // No calls to Plugin.distinct should be made
      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct')

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      // Result should be empty array and no call to Plugin.distinct
      expect(stubPluginDistinct.called).to.be.false
      expect(result).to.deep.equal([])
    })

    it('should apply network filter correctly', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = { network: { $in: [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet] } }

      // Stub the aggregate calls
      const stubTokenMember = sandbox.stub(Models.TokenMember, 'aggregate').resolves([])
      const stubLock = sandbox.stub(Models.Lock, 'aggregate').resolves([])
      const stubLockToVote = sandbox.stub(Models.LockToVoteMember, 'aggregate').resolves([])
      const stubPluginMember = sandbox.stub(Models.PluginMember, 'aggregate').resolves([])

      await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      // Verify that the aggregate calls were made with the correct filter
      const tokenMemberCallArgs = stubTokenMember.firstCall.args[0]
      expect(tokenMemberCallArgs).to.be.an('array')
      expect(tokenMemberCallArgs[0].$match).to.exist
      expect(tokenMemberCallArgs[0].$match.memberAddress).to.equal(memberAddress)
      expect(tokenMemberCallArgs[0].$match.network).to.exist
      expect(tokenMemberCallArgs[0].$match.network.$in).to.exist

      const lockCallArgs = stubLock.firstCall.args[0]
      expect(lockCallArgs).to.be.an('array')
      expect(lockCallArgs[0].$match).to.exist
      expect(lockCallArgs[0].$match.delegateReceiverAddress).to.equal(memberAddress)
      expect(lockCallArgs[0].$match.network).to.exist
      expect(lockCallArgs[0].$match.network.$in).to.exist

      const lockToVoteCallArgs = stubLockToVote.firstCall.args[0]
      expect(lockToVoteCallArgs).to.be.an('array')
      expect(lockToVoteCallArgs[0].$match).to.exist
      expect(lockToVoteCallArgs[0].$match.memberAddress).to.equal(memberAddress)
      expect(lockToVoteCallArgs[0].$match.network).to.exist
      expect(lockToVoteCallArgs[0].$match.network.$in).to.exist

      const pluginMemberCallArgs = stubPluginMember.firstCall.args[0]
      expect(pluginMemberCallArgs).to.be.an('array')
      expect(pluginMemberCallArgs[0].$match).to.exist
      expect(pluginMemberCallArgs[0].$match.memberAddress).to.equal(memberAddress)
      expect(pluginMemberCallArgs[0].$match.network).to.exist
      expect(pluginMemberCallArgs[0].$match.network.$in).to.exist
    })

    it('should handle address collisions across networks', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      // Same plugin address exists on two different networks
      const pluginMembersWithNetwork = [
        { pluginAddress: '0xSamePlugin', network: NetworksEnum.ethereumMainnet },
        { pluginAddress: '0xSamePlugin', network: NetworksEnum.polygonMainnet },
      ]

      sandbox.stub(Models.TokenMember, 'aggregate').resolves([])
      sandbox.stub(Models.Lock, 'aggregate').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'aggregate').resolves([])
      sandbox.stub(Models.PluginMember, 'aggregate').resolves(pluginMembersWithNetwork)

      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves(['0xDao1', '0xDao2'])

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(stubPluginDistinct.calledOnce).to.be.true

      // Check that the query contains two separate entries for the same plugin address
      const distinctCallArgs = stubPluginDistinct.firstCall.args
      expect(distinctCallArgs[0]).to.equal('daoAddress')
      const query = distinctCallArgs[1]

      const hasEthereumEntry = query.$or.some(
        item =>
          item.address && item.address.$in.includes('0xSamePlugin') && item.network === NetworksEnum.ethereumMainnet,
      )

      const hasPolygonEntry = query.$or.some(
        item =>
          item.address && item.address.$in.includes('0xSamePlugin') && item.network === NetworksEnum.polygonMainnet,
      )

      expect(hasEthereumEntry).to.be.true
      expect(hasPolygonEntry).to.be.true

      expect(result).to.deep.equal(['0xDao1', '0xDao2'])
    })

    it('should return empty array when all grouped networks have empty address arrays', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      // Return data but with null/undefined addresses that will be filtered by groupByNetwork
      const tokenMembersWithBadData = [
        { tokenAddress: null, network: NetworksEnum.ethereumMainnet },
        { tokenAddress: undefined, network: NetworksEnum.polygonMainnet },
      ]

      sandbox.stub(Models.TokenMember, 'aggregate').resolves(tokenMembersWithBadData as any)
      sandbox.stub(Models.Lock, 'aggregate').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'aggregate').resolves([])
      sandbox.stub(Models.PluginMember, 'aggregate').resolves([])

      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct')

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      // Should return empty array because groupByNetwork filters out null/undefined addresses
      // and orQueries.length === 0 after processing
      expect(stubPluginDistinct.called).to.be.false
      expect(result).to.deep.equal([])
    })
  })

  describe('groupByNetwork', () => {
    it('should group addresses by network correctly', () => {
      const data = [
        { tokenAddress: '0xToken1', network: NetworksEnum.ethereumMainnet },
        { tokenAddress: '0xToken2', network: NetworksEnum.ethereumMainnet },
        { tokenAddress: '0xToken3', network: NetworksEnum.polygonMainnet },
      ] as MembershipData[]

      const result = DaoController.groupByNetwork(data, 'tokenAddress')

      expect(result).to.deep.equal({
        [NetworksEnum.ethereumMainnet]: ['0xToken1', '0xToken2'],
        [NetworksEnum.polygonMainnet]: ['0xToken3'],
      })
    })

    it('should handle empty array', () => {
      const data: MembershipData[] = []

      const result = DaoController.groupByNetwork(data, 'tokenAddress')

      expect(result).to.deep.equal({})
    })

    it('should handle undefined addresses', () => {
      const data = [
        { tokenAddress: '0xToken1', network: NetworksEnum.ethereumMainnet },
        { network: NetworksEnum.ethereumMainnet } as MembershipData, // Missing tokenAddress
        { tokenAddress: '0xToken2', network: NetworksEnum.ethereumMainnet },
      ]

      const result = DaoController.groupByNetwork(data, 'tokenAddress')

      // Should only include entries with defined addresses
      expect(result).to.deep.equal({
        [NetworksEnum.ethereumMainnet]: ['0xToken1', '0xToken2'],
      })
    })

    it('should handle multiple address types', () => {
      const data = [
        { tokenAddress: '0xToken1', network: NetworksEnum.ethereumMainnet },
        { pluginAddress: '0xPlugin1', network: NetworksEnum.ethereumMainnet },
        { lockManagerAddress: '0xLock1', network: NetworksEnum.polygonMainnet },
      ] as MembershipData[]

      // Test with tokenAddress
      const resultToken = DaoController.groupByNetwork(data, 'tokenAddress')
      expect(resultToken).to.deep.equal({
        [NetworksEnum.ethereumMainnet]: ['0xToken1'],
      })

      // Test with pluginAddress
      const resultPlugin = DaoController.groupByNetwork(data, 'pluginAddress')
      expect(resultPlugin).to.deep.equal({
        [NetworksEnum.ethereumMainnet]: ['0xPlugin1'],
      })

      // Test with lockManagerAddress
      const resultLock = DaoController.groupByNetwork(data, 'lockManagerAddress')
      expect(resultLock).to.deep.equal({
        [NetworksEnum.polygonMainnet]: ['0xLock1'],
      })
    })
  })
})
