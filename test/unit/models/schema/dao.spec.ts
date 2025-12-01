import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import Dao from '@models/schema/dao'
import { Models } from '@dbModels'
import { PluginList } from '@test/mock/fakePlugins'
import { DaoList } from '@test/mock/fakeDao'
import ModelUtils from '@models/utils/models'

describe('Model: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      ...(DaoList[0] as any),
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create DAO', async () => {
    it('Should create DAO', async () => {
      const entityId = Models.Dao.getEntityId({
        network: rawDao.network!,
        address: rawDao.address!,
      })
      const createdDao = await Models.Dao.create(rawDao)

      expect(createdDao.id).to.eq(entityId)
      expect(createdDao.network).to.eq(rawDao.network)
      expect(createdDao.transactionHash).to.eq(rawDao.transactionHash)
      expect(createdDao.blockNumber).to.eq(rawDao.blockNumber)
      expect(createdDao.blockTimestamp).to.eq(rawDao.blockTimestamp)
      expect(createdDao.address).to.eq(rawDao.address)
      expect(createdDao.implementationAddress).to.eq(rawDao.implementationAddress)
      expect(createdDao.creatorAddress).to.eq(rawDao.creatorAddress)
      expect(createdDao.ens).to.eq(rawDao.ens)
      expect(createdDao.subdomain).to.eq(rawDao.subdomain)
      expect(createdDao.metadataIpfs).to.eq(rawDao.metadataIpfs)
      expect(createdDao.name).to.eq(rawDao.name)
      expect(createdDao.description).to.eq(rawDao.description)
      expect(createdDao.avatar).to.eq(rawDao.avatar)
      expect(createdDao.links[0].name).to.eq(rawDao.links?.[0].name)
      expect(createdDao.links[0].url).to.eq(rawDao.links?.[0].url)
      expect(createdDao.metrics.members).to.eq(rawDao.metrics?.members)
      expect(createdDao.metrics.proposalsCreated).to.eq(rawDao.metrics?.proposalsCreated)
      expect(createdDao.metrics.proposalsExecuted).to.eq(rawDao.metrics?.proposalsExecuted)
      expect(createdDao.metrics?.uniqueVoters).to.eq(rawDao.metrics?.uniqueVoters)
      expect(createdDao.metrics?.votes).to.eq(rawDao.metrics?.votes)
      expect(createdDao.isHidden).to.eq(rawDao.isHidden)
      expect(createdDao.isActive).to.eq(rawDao.isActive)
    })
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Dao.getEntityId({
      network,
      address,
    })
    expect(entityId).to.eq(`${network}-${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Dao.create(rawDao)
    const foundLogDao = await Models.Dao.findExistingLog({
      network: createdLogDao.network,
      address: createdLogDao.address,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Dao.create(rawDao)
    const foundLogDao = await Models.Dao.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByAddress', async () => {
    const createdLogDao = await Models.Dao.create(rawDao)
    const foundLogDao = await Models.Dao.findByAddress(createdLogDao.address, createdLogDao.network)
    expect(foundLogDao?.address).to.eq(createdLogDao.address)
  })

  it('Should update DAO', async () => {
    const createdDao = await Models.Dao.create(rawDao)

    await createdDao.update({
      network: NetworksEnum.baseMainnet,
      creatorAddress: '0x558c9997f8d382f02dfce79e275af637d8bb19e6',
    })

    expect(createdDao.network).to.eq(NetworksEnum.baseMainnet)
    expect(createdDao.id).to.eq(`${NetworksEnum.baseMainnet}-${rawDao.address}`)
    expect(createdDao.creatorAddress).to.eq('0x558c9997f8d382f02dfce79e275af637d8bb19e6')
  })

  it('Should reload', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    await createdDao.reload()

    expect(createdDao.id).to.eq(rawDao.id)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeDaos = [
        {
          blockTimestamp: 1919577224,
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          network: NetworksEnum.polygonMainnet,
          members: 10,
          metrics: {
            members: 15,
            proposalsCreated: 5,
            proposalsExecuted: 3,
            uniqueVoters: 100,
            votes: 500,
            tvlUSD: 10000,
          },
          isHidden: false,
          isActive: true,
          txHash: '0x0',
        },
        {
          blockTimestamp: 1819577224,
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: NetworksEnum.polygonMainnet,
          metrics: {
            members: 15,
            proposalsCreated: 5,
            proposalsExecuted: 3,
            uniqueVoters: 100,
            votes: 500,
            tvlUSD: 20000,
          },
          isHidden: false,
          isActive: true,
          txHash: '0x0',
        },
        {
          blockTimestamp: 1719577224,
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: NetworksEnum.arbitrumMainnet,
          metrics: {
            members: 15,
            proposalsCreated: 5,
            proposalsExecuted: 3,
            uniqueVoters: 100,
            votes: 500,
            tvlUSD: 20000,
          },
          isActive: true,
          isHidden: false,
          txHash: '0x0',
        },
      ]

      const fakePlugin = {
        ...PluginList[0],
        interfaceType: IPluginInterfaceType.multisig,
      }

      fakePlugin.daoAddress = fakeDaos[0].address

      await Models.Plugin.create(fakePlugin)
      await Promise.all(fakeDaos.map(w => Models.Dao.create(w)))
    })

    it('Should return empty pagination response when memberAddress is provided and extraQueryData.daoAddresses is empty', async () => {
      const paginationParams = { page: 1, pageSize: 10 }
      const extraParams = { memberAddress: '0xMemberAddress' }
      const extraQueryData = { daoAddresses: [] }

      const result = await Models.Dao.findWithPagination({
        extraParams,
        paginationParams,
        extraQueryData,
      })

      const expected = ModelUtils.paginateEmptyResponse(paginationParams.pageSize)
      expect(result).to.deep.equal(expected)
    })

    it('Should find Pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find Pagination with networks and plugin', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Dao.findWithPagination({
        extraParams: {
          networks: [NetworksEnum.polygonMainnet],
          pluginAddress: PluginList[0].address,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find Pagination with from to date', async () => {
      await Models.Dao.create({
        blockTimestamp: 1719577230,
        address: '0xee0627bA21e9114336977482372486d084497efa',
        creatorAddress: '0xEFbB4E6e5CF4bB4Ae8Cdc2c109da90D2a2433B50',
        network: NetworksEnum.polygonMainnet,
        metrics: {
          members: 15,
          proposalsCreated: 5,
          proposalsExecuted: 3,
          uniqueVoters: 100,
          votes: 500,
          tvlUSD: 20000,
        },
        isHidden: false,
        isActive: true,
        txHash: '0x0',
      } as any)

      const result = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: {
          startDateProp: 'blockTimestamp',
          endDateProp: 'blockTimestamp',
          startDate: 1719577230,
          endDate: 1719577230,
        },
      } as any)

      expect(result.data.length).to.eq(1)
      expect(result.metadata.totalRecords).to.eq(1)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)

      const result2 = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: {
          startDateProp: 'blockTimestamp',
          endDateProp: 'blockTimestamp',
          startDate: 719577230,
          endDate: 9719577230,
        },
      } as any)

      expect(result2.data.length).to.eq(4)
      expect(result2.metadata.totalRecords).to.eq(4)
      expect(result2.metadata.page).to.eq(1)
      expect(result2.metadata.totalPages).to.eq(1)

      const result3 = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: {
          startDateProp: 'blockTimestamp',
          startDate: 719577230,
        },
      } as any)

      expect(result3.data.length).to.eq(4)
      expect(result3.metadata.totalRecords).to.eq(4)
      expect(result3.metadata.page).to.eq(1)
      expect(result3.metadata.totalPages).to.eq(1)

      const result4 = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: {
          endDateProp: 'blockTimestamp',
          endDate: 9719577230,
        },
      } as any)

      expect(result4.data.length).to.eq(4)
      expect(result4.metadata.totalRecords).to.eq(4)
      expect(result4.metadata.page).to.eq(1)
      expect(result4.metadata.totalPages).to.eq(1)
    })

    it('Should find Pagination with pageSize', async () => {
      const params = {
        pageSize: 2,
      }

      const result = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: params,
      })

      expect(result.data.length).to.eq(2)
      expect(result.metadata.totalRecords).to.eq(3)
      expect(result.metadata.totalPages).to.eq(2)
      expect(result.metadata.page).to.eq(1)
    })

    it('Should find Pagination with page and pageSize', async () => {
      const opts = {
        page: 1,
        pageSize: 2,
      }

      const result = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(2)
      expect(result.metadata.totalRecords).to.eq(3)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(2)
    })

    it('Should not add excluded keys to the filter', async () => {
      const extraParams = {
        networks: [NetworksEnum.polygonMainnet],
        pluginAddress: '0xPluginAddress',
        memberAddress: '0xMemberAddress',
        excludeDaoId: '0xExcludedDaoId',
        excludedDao: '0xExcludedDao',
        someOtherParam: 'someValue', // This one should be kept
      }

      const paginationParams = {}

      // Stub the MongoDB aggregate call to capture the actual query filter
      const aggregateStub = sandbox.stub(Models.Dao, 'aggregate').resolves([])

      await Models.Dao.findWithPagination({
        extraParams,
        paginationParams,
      })

      // Get the actual filter that was passed to MongoDB
      const generatedFilter = aggregateStub.args[0][0].find(step => step.$match)?.$match

      expect(generatedFilter).to.not.have.property('pluginAddress')
      expect(generatedFilter).to.not.have.property('memberAddress')
      expect(generatedFilter).to.not.have.property('excludeDaoId')
      expect(generatedFilter).to.not.have.property('excludedDao')
      expect(generatedFilter).to.have.property('someOtherParam', 'someValue')
    })

    it('Should not found documents', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Dao.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(0)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
    })

    it('should exclude dao when excludedDao is provided', async () => {
      const extraParams = {
        excludedDao: {
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          network: NetworksEnum.polygonMainnet,
        },
      }
      const extraQueryData = {
        daoAddresses: ['0x17366cae2b9c6c3055e9e3c78936a69006be5409', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
      }

      const result = await Models.Dao.findWithPagination({
        extraParams,
        paginationParams: { page: 1, pageSize: 10 },
        extraQueryData,
      })

      expect(result.data.length).to.eq(1)
      expect(result.data[0].address).to.eq('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
    })
  })

  it('should getDaoDetails', async () => {
    const aggregateStub = sandbox.stub(Models.Dao, 'aggregate').returns([{ a: 1 }] as any)
    await Models.Dao.getDaoDetails('0x17366cae2b9c6c3055e9e3c78936a69006be5409', NetworksEnum.polygonMainnet)

    expect(aggregateStub.calledOnce).to.be.true
    expect(aggregateStub.args[0][0][0].$match).to.deep.eq({
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      network: NetworksEnum.polygonMainnet,
      isActive: {
        $eq: true,
      },
      isHidden: {
        $ne: true,
      },
    })
  })

  it('should update the dao metrics', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    await createdDao.updateMetrics({
      members: 100,
      proposalsCreated: 50,
      proposalsExecuted: 30,
      uniqueVoters: 200,
      votes: 1000,
      tvlUSD: 100000,
    })

    expect(createdDao.metrics.members).to.eq(100)
    expect(createdDao.metrics.proposalsCreated).to.eq(50)
    expect(createdDao.metrics.proposalsExecuted).to.eq(30)
    expect(createdDao.metrics.uniqueVoters).to.eq(200)
    expect(createdDao.metrics.votes).to.eq(1000)
    expect(createdDao.metrics.tvlUSD).to.eq(100000)
  })

  describe('countUniqueMembers', () => {
    const mockDaoAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const mockNetwork = NetworksEnum.polygonMainnet

    beforeEach(async () => {
      // Create test DAO
      await Models.Dao.create({
        address: mockDaoAddress,
        network: mockNetwork,
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        isActive: true,
        isHidden: false,
        blockNumber: 1000,
        blockTimestamp: 1699577224,
      })
    })

    it('should return 0 when no plugins exist', async () => {
      // Mock Plugin.find to return empty array
      sandbox.stub(Models.Plugin, 'find').resolves([])

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)
      expect(count).to.eq(0)
    })

    it('should count unique members across different governance types', async () => {
      // Mock plugins of different types
      const mockPlugins = [
        {
          address: '0xplugin1',
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenAddress: '0xtoken1',
        },
        {
          address: '0xplugin2',
          interfaceType: IPluginInterfaceType.multisig,
        },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      // Mock distinct calls for TokenMember
      sandbox.stub(Models.TokenMember, 'distinct').withArgs('memberAddress').resolves(['0xmember1', '0xmember2'])

      // Mock distinct calls for Lock
      sandbox.stub(Models.Lock, 'distinct').withArgs('delegateReceiverAddress').resolves(['0xmember3'])

      // Mock distinct calls for PluginMember
      sandbox.stub(Models.PluginMember, 'distinct').withArgs('memberAddress').resolves(['0xmember2', '0xmember4'])

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)

      // Should have 4 unique members (member2 is counted only once)
      expect(count).to.eq(4)
    })

    it('should return 0 when Plugin.find fails', async () => {
      // Mock Plugin.find to throw error
      sandbox.stub(Models.Plugin, 'find').rejects(new Error('Database error'))

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)

      expect(count).to.eq(0)
    })

    it('should handle token voting plugins correctly', async () => {
      const mockPlugins = [
        {
          address: '0xplugin1',
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenAddress: '0xtoken1',
        },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)
      sandbox.stub(Models.TokenMember, 'distinct').resolves(['0xmember1', '0xmember2'])
      sandbox.stub(Models.Lock, 'distinct').resolves(['0xmember3'])

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)

      expect(count).to.eq(3)
    })

    it('should handle lockToVote plugins correctly', async () => {
      const mockPlugins = [
        {
          address: '0xplugin1',
          interfaceType: IPluginInterfaceType.lockToVote,
          lockManagerAddress: '0xlockmanager1',
        },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      const lockToVoteStub = sandbox.stub(Models.LockToVoteMember, 'distinct')
      lockToVoteStub.resolves(['0xmember1', '0xmember2'])

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)

      expect(count).to.eq(2)

      // Verify votingPower filter is applied
      expect(lockToVoteStub.firstCall.args[1]).to.deep.equal({
        lockManagerAddress: '0xlockmanager1',
        network: mockNetwork,
        votingPower: { $ne: '0' },
      })
    })

    it('should handle errors in individual plugin queries gracefully', async () => {
      const mockPlugins = [
        {
          address: '0xplugin1',
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenAddress: '0xtoken1',
        },
        {
          address: '0xplugin2',
          interfaceType: IPluginInterfaceType.multisig,
        },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      // TokenMember query fails
      sandbox.stub(Models.TokenMember, 'distinct').rejects(new Error('Query failed'))
      sandbox.stub(Models.Lock, 'distinct').resolves([])

      // PluginMember query succeeds
      sandbox.stub(Models.PluginMember, 'distinct').resolves(['0xmember1', '0xmember2'])

      const count = await Models.Dao.countUniqueMembers(mockDaoAddress, mockNetwork)

      // Should still count members from successful queries
      expect(count).to.eq(2)
    })
  })

  describe('WithoutPlugins API Methods', () => {
    beforeEach(async () => {
      const parentDao = {
        blockTimestamp: 1919577224,
        avatar: 'parent-avatar',
        name: 'parent-dao',
        description: 'parent-description',
        address: '0x1111111111111111111111111111111111111111',
        creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        network: NetworksEnum.polygonMainnet,
        metrics: {
          members: 15,
          proposalsCreated: 5,
          proposalsExecuted: 3,
          uniqueVoters: 100,
          votes: 500,
          tvlUSD: 50000,
        },
        isHidden: false,
        isActive: true,
        parentDao: null,
        subDaos: ['0x2222222222222222222222222222222222222222'],
      }

      const childDao = {
        blockTimestamp: 1819577224,
        avatar: 'child-avatar',
        name: 'child-dao',
        description: 'child-description',
        address: '0x2222222222222222222222222222222222222222',
        creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
        network: NetworksEnum.polygonMainnet,
        metrics: {
          members: 10,
          proposalsCreated: 3,
          proposalsExecuted: 2,
          uniqueVoters: 50,
          votes: 200,
          tvlUSD: 20000,
        },
        isHidden: false,
        isActive: true,
        parentDao: '0x1111111111111111111111111111111111111111',
        subDaos: [],
      }

      await Promise.all([Models.Dao.create(parentDao as any), Models.Dao.create(childDao as any)])
    })

    describe('findWithPaginationWithoutPlugins', () => {
      it('should return DAOs without plugins', async () => {
        const result = await Models.Dao.findWithPaginationWithoutPlugins({
          extraParams: {},
          paginationParams: {},
          extraQueryData: {},
        })

        expect(result.data.length).to.eq(2)
        expect(result.metadata.totalRecords).to.eq(2)
        // V3 should NOT include plugins
        expect(result.data[0]).to.not.have.property('plugins')
      })

      it('should return empty pagination response when memberAddress is provided and extraQueryData.daoAddresses is empty', async () => {
        const paginationParams = { page: 1, pageSize: 10 }
        const extraParams = { memberAddress: '0xMemberAddress' }
        const extraQueryData = { daoAddresses: [] }

        const result = await Models.Dao.findWithPaginationWithoutPlugins({
          extraParams,
          paginationParams,
          extraQueryData,
        })

        const expected = ModelUtils.paginateEmptyResponse(paginationParams.pageSize)
        expect(result).to.deep.equal(expected)
      })

      it('should filter by networks', async () => {
        const result = await Models.Dao.findWithPaginationWithoutPlugins({
          extraParams: {
            networks: [NetworksEnum.polygonMainnet],
          },
          paginationParams: {},
          extraQueryData: {},
        })

        expect(result.data.length).to.eq(2)
        result.data.forEach(dao => {
          expect(dao.network).to.eq(NetworksEnum.polygonMainnet)
        })
      })

      it('should exclude dao when excludedDao is provided', async () => {
        const extraParams = {
          excludedDao: {
            daoAddress: '0x1111111111111111111111111111111111111111',
            network: NetworksEnum.polygonMainnet,
          },
        }
        const extraQueryData = {
          daoAddresses: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
        }

        const result = await Models.Dao.findWithPaginationWithoutPlugins({
          extraParams,
          paginationParams: { page: 1, pageSize: 10 },
          extraQueryData,
        })

        expect(result.data.length).to.eq(1)
        expect(result.data[0].address).to.eq('0x2222222222222222222222222222222222222222')
      })
    })

    describe('getDaoDetailsWithoutPlugins', () => {
      it('should return DAO details without plugins', async () => {
        const aggregateStub = sandbox.stub(Models.Dao, 'aggregate').returns([
          {
            address: '0x1111111111111111111111111111111111111111',
            name: 'parent-dao',
            parentDao: null,
            subDaos: [{ address: '0x2222222222222222222222222222222222222222' }],
          },
        ] as any)

        const result = await Models.Dao.getDaoDetailsWithoutPlugins(
          '0x1111111111111111111111111111111111111111',
          NetworksEnum.polygonMainnet,
        )

        expect(aggregateStub.calledOnce).to.be.true
        expect(result).to.have.property('address')
        expect(result).to.not.have.property('plugins')
      })

      it('should include parentDao and subDaos in response', async () => {
        sandbox.stub(Models.Dao, 'aggregate').returns([
          {
            address: '0x1111111111111111111111111111111111111111',
            name: 'parent-dao',
            parentDao: null,
            subDaos: [
              {
                address: '0x2222222222222222222222222222222222222222',
                name: 'child-dao',
              },
            ],
            metrics: { tvlUSD: 70000 },
          },
        ] as any)

        const result = await Models.Dao.getDaoDetailsWithoutPlugins(
          '0x1111111111111111111111111111111111111111',
          NetworksEnum.polygonMainnet,
        )

        expect(result).to.have.property('parentDao')
        expect(result).to.have.property('subDaos')
        expect(result.subDaos).to.be.an('array')
      })

      it('should aggregate TVL from subDaos', async () => {
        // Restore sandbox to use real aggregate for this test
        sandbox.restore()

        // Query the parent DAO
        const result = await Models.Dao.getDaoDetailsWithoutPlugins(
          '0x1111111111111111111111111111111111111111',
          NetworksEnum.polygonMainnet,
        )

        // Parent TVL (50000) + Child TVL (20000) = 70000
        expect(result.metrics.tvlUSD).to.eq(70000)
      })
    })
  })
})
