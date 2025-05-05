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
})
