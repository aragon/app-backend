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

      const mockMappings = [{ daoAddress: '0xDao1' }]

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

      const tokenMembers = ['0xToken1', '0xToken2']
      const veMembers = ['0xVeToken1']
      const lockMembers = ['0xLockManager1']
      const pluginMembers = ['0xPlugin1', '0xPlugin2']
      const expectedDaoAddresses = ['0xDao1', '0xDao2', '0xDao3']

      sandbox.stub(Models.TokenMember, 'distinct').resolves(tokenMembers)
      sandbox.stub(Models.Lock, 'distinct').resolves(veMembers)
      sandbox.stub(Models.LockToVoteMember, 'distinct').resolves(lockMembers)
      sandbox.stub(Models.PluginMember, 'distinct').resolves(pluginMembers)
      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves(expectedDaoAddresses)

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(stubPluginDistinct.calledOnce).to.be.true
      expect(
        stubPluginDistinct.calledWith('daoAddress', {
          $or: [
            { tokenAddress: { $in: tokenMembers }, interfaceType: 'tokenVoting' },
            { tokenAddress: { $in: veMembers }, interfaceType: 'tokenVoting' },
            { lockManagerAddress: { $in: lockMembers }, interfaceType: 'lockToVote' },
            {
              address: { $in: pluginMembers },
              interfaceType: { $in: ['multisig', 'admin'] },
            },
          ],
          status: 'installed',
          isSupported: true,
          ...networkFilter,
        }),
      ).to.be.true
      expect(result).to.deep.equal(expectedDaoAddresses)
    })

    it('should handle empty membership arrays', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      sandbox.stub(Models.TokenMember, 'distinct').resolves([])
      sandbox.stub(Models.Lock, 'distinct').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'distinct').resolves([])
      sandbox.stub(Models.PluginMember, 'distinct').resolves([])
      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves([])

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(stubPluginDistinct.calledOnce).to.be.true
      expect(
        stubPluginDistinct.calledWith('daoAddress', {
          $or: [
            { tokenAddress: { $in: [] }, interfaceType: 'tokenVoting' },
            { tokenAddress: { $in: [] }, interfaceType: 'tokenVoting' },
            { lockManagerAddress: { $in: [] }, interfaceType: 'lockToVote' },
            {
              address: { $in: [] },
              interfaceType: { $in: ['multisig', 'admin'] },
            },
          ],
          status: 'installed',
          isSupported: true,
        }),
      ).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should apply network filter correctly', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = { network: { $in: [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet] } }

      const tokenMembers = ['0xToken1']
      const veMembers = ['0xVeToken1']
      const lockMembers = ['0xLockManager1']
      const pluginMembers = ['0xPlugin1']

      const stubTokenMember = sandbox.stub(Models.TokenMember, 'distinct').resolves(tokenMembers)
      const stubLock = sandbox.stub(Models.Lock, 'distinct').resolves(veMembers)
      const stubLockToVote = sandbox.stub(Models.LockToVoteMember, 'distinct').resolves(lockMembers)
      const stubPluginMember = sandbox.stub(Models.PluginMember, 'distinct').resolves(pluginMembers)
      sandbox.stub(Models.Plugin, 'distinct').resolves(['0xDao1'])

      await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(stubTokenMember.calledWith('tokenAddress', { memberAddress, ...networkFilter })).to.be.true
      expect(stubLock.calledWith('tokenAddress', { delegateReceiverAddress: memberAddress, ...networkFilter })).to.be
        .true
      expect(stubLockToVote.calledWith('lockManagerAddress', { memberAddress, ...networkFilter })).to.be.true
      expect(stubPluginMember.calledWith('pluginAddress', { memberAddress, ...networkFilter })).to.be.true
    })

    it('should handle member with only token voting membership', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      const tokenMembers = ['0xToken1', '0xToken2']
      const expectedDaoAddresses = ['0xDao1']

      sandbox.stub(Models.TokenMember, 'distinct').resolves(tokenMembers)
      sandbox.stub(Models.Lock, 'distinct').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'distinct').resolves([])
      sandbox.stub(Models.PluginMember, 'distinct').resolves([])
      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves(expectedDaoAddresses)

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(
        stubPluginDistinct.calledWith('daoAddress', {
          $or: [
            { tokenAddress: { $in: tokenMembers }, interfaceType: 'tokenVoting' },
            { tokenAddress: { $in: [] }, interfaceType: 'tokenVoting' },
            { lockManagerAddress: { $in: [] }, interfaceType: 'lockToVote' },
            {
              address: { $in: [] },
              interfaceType: { $in: ['multisig', 'admin'] },
            },
          ],
          status: 'installed',
          isSupported: true,
        }),
      ).to.be.true
      expect(result).to.deep.equal(expectedDaoAddresses)
    })

    it('should handle member with only plugin membership', async () => {
      const memberAddress = '0xMemberAddress'
      const networkFilter = {}

      const pluginMembers = ['0xPlugin1', '0xPlugin2']
      const expectedDaoAddresses = ['0xDao1', '0xDao2']

      sandbox.stub(Models.TokenMember, 'distinct').resolves([])
      sandbox.stub(Models.Lock, 'distinct').resolves([])
      sandbox.stub(Models.LockToVoteMember, 'distinct').resolves([])
      sandbox.stub(Models.PluginMember, 'distinct').resolves(pluginMembers)
      const stubPluginDistinct = sandbox.stub(Models.Plugin, 'distinct').resolves(expectedDaoAddresses)

      const result = await DaoController.getDaosOfMemberInNetwork(memberAddress, networkFilter)

      expect(
        stubPluginDistinct.calledWith('daoAddress', {
          $or: [
            { tokenAddress: { $in: [] }, interfaceType: 'tokenVoting' },
            { tokenAddress: { $in: [] }, interfaceType: 'tokenVoting' },
            { lockManagerAddress: { $in: [] }, interfaceType: 'lockToVote' },
            {
              address: { $in: pluginMembers },
              interfaceType: { $in: ['multisig', 'admin'] },
            },
          ],
          status: 'installed',
          isSupported: true,
        }),
      ).to.be.true
      expect(result).to.deep.equal(expectedDaoAddresses)
    })
  })
})
