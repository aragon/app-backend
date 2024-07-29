import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Dao from '@models/schema/dao'
import { Models } from '@dbModels'

describe('Model: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0x0',
      blockNumber: 0,
      blockTimestamp: 1219577223,
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
      expect(createdDao.tvlUSD).to.eq(rawDao.tvlUSD)
      expect(createdDao.plugins.length).to.eq(1)
      expect(createdDao.plugins[0].transactionHash).to.eq(rawDao.plugins![0].transactionHash)
      expect(createdDao.plugins[0].blockNumber).to.eq(rawDao.plugins![0].blockNumber)
      expect(createdDao.plugins[0].tokenAddress).to.eq(rawDao.plugins![0].tokenAddress)
      expect(createdDao.plugins[0].pluginSetupRepoAddress).to.eq(rawDao.plugins![0].pluginSetupRepoAddress)
      expect(createdDao.plugins[0].address).to.eq(rawDao.plugins![0].address)
      expect(createdDao.plugins[0].implementationAddress).to.eq(rawDao.plugins![0].implementationAddress)
      expect(createdDao.plugins[0].release).to.eq(rawDao.plugins![0].release)
      expect(createdDao.plugins[0].build).to.eq(rawDao.plugins![0].build)
      expect(createdDao.plugins[0].subdomain).to.eq(rawDao.plugins![0].subdomain)
      expect(createdDao.hideDao).to.eq(rawDao.hideDao)
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
    expect(createdDao.creatorAddress).to.eq('0x17366cae2b9c6c3055e9e3c78936a69006be5409')

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
          network: NetworksEnum.ethereumMainnet,
          members: 10,
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
              address: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
            },
          ],
          hideDao: false,
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
          },
          tvlUSD: 20000,
          plugins: [
            {
              address: '0x0',
            },
          ],
          hideDao: false,
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
          },
          tvlUSD: 20000,
          plugins: [
            {
              address: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1962',
            },
          ],
          hideDao: false,
          txHash: '0x0',
        },
      ]

      await Promise.all(fakeDaos.map(w => Models.Dao.create(w)))
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
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
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
        },
        tvlUSD: 20000,
        plugins: [
          {
            address: '0x0',
          },
        ],
        hideDao: false,
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

  it('Should filterKeys', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.id).to.exist
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(filterDao.hideDao).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(18)
  })

  it('should getDaoDetails', async () => {
    const aggregateStub = sandbox.stub(Models.Dao, 'aggregate').returns([{ a: 1 }])
    await Models.Dao.getDaoDetails('0x17366cae2b9c6c3055e9e3c78936a69006be5409')

    expect(aggregateStub.calledOnce).to.be.true
    expect(aggregateStub.args[0][0][0].$match).to.deep.eq({
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    })
  })
})
