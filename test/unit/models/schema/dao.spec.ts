import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { EnumPluginType, NetworksEnum } from '@types'
import Dao from '@models/schema/dao'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'

describe('Model: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      network: NetworksEnum.mainnet,
      transactionHash: '0x0',
      blockNumber: 0,
      blockTimestamp: 2141242,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: 'dao.eth',
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
      proposalsCreated: 5,
      proposalsExecuted: 3,
      tvlUSD: '10000',
      uniqueVoters: 100,
      votes: 500,
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
      const createdDao = await Models.Dao.create(rawDao)

      expect(createdDao.id).to.exist
      expect(createdDao.entityId).to.exist
      expect(createdDao.network).to.eq(rawDao.network)
      expect(createdDao.transactionHash).to.eq(rawDao.transactionHash)
      expect(createdDao.blockNumber).to.eq(rawDao.blockNumber)
      expect(createdDao.blockTimestamp).to.eq(rawDao.blockTimestamp)
      expect(createdDao.permalink).to.eq(`${createdDao.network}-${createdDao.ens || createdDao.address}`)
      expect(createdDao.address).to.eq(rawDao.address)
      expect(createdDao.implementationAddress).to.eq(rawDao.implementationAddress)
      expect(createdDao.creatorAddress).to.eq(rawDao.creatorAddress)
      expect(createdDao.ens).to.eq(rawDao.ens)
      expect(createdDao.members).to.eq(rawDao.members)
      expect(createdDao.metadataIpfs).to.eq(rawDao.metadataIpfs)
      expect(createdDao.name).to.eq(rawDao.name)
      expect(createdDao.description).to.eq(rawDao.description)
      expect(createdDao.avatar).to.eq(rawDao.avatar)
      expect(createdDao.links[0].name).to.eq(rawDao.links?.[0].name)
      expect(createdDao.links[0].url).to.eq(rawDao.links?.[0].url)
      expect(createdDao.proposalsCreated).to.eq(rawDao.proposalsCreated)
      expect(createdDao.proposalsExecuted).to.eq(rawDao.proposalsExecuted)
      expect(createdDao.tvlUSD).to.eq(rawDao.tvlUSD)
      expect(createdDao.uniqueVoters).to.eq(rawDao.uniqueVoters)
      expect(createdDao.votes).to.eq(rawDao.votes)
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

    it('Should create DAO with ens on permalink', async () => {
      const createdDao = await Models.Dao.create({
        ...rawDao,
        ...{
          ens: 'fake-ens',
        },
      })

      expect(createdDao.id).to.exist
      expect(createdDao.permalink).to.eq(`${createdDao.network}-fake-ens`)
    })

    it('Should not create DAO with same permalink', async () => {
      const createdDao = await Models.Dao.create(rawDao)
      expect(createdDao.id).to.exist
      await expect(Models.Dao.create(rawDao)).rejectedWith(Error, 'entityId_1 dup key')
    })
  })

  it('Should findByPermalink', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const dao = await Models.Dao.findByPermalink(createdDao.permalink)
    expect(dao?.address).to.eq(createdDao.address)
  })

  it('Should update DAO', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    expect(createdDao.creatorAddress).to.eq('0x17366cae2b9c6c3055e9e3c78936a69006be5409')

    await createdDao.update({
      creatorAddress: '0x558c9997f8d382f02dfce79e275af637d8bb19e6',
    })

    expect(createdDao.creatorAddress).to.eq('0x558c9997f8d382f02dfce79e275af637d8bb19e6')
  })

  it('Should reload', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    await createdDao.reload()

    expect(createdDao.members).to.eq(10)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeDaos = [
        {
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          network: NetworksEnum.mainnet,
          members: 10,
          proposalsCreated: 5,
          proposalsExecuted: 3,
          tvlUSD: 10000,
          uniqueVoters: 100,
          votes: 500,
          plugins: [
            {
              type: EnumPluginType.MultisigPlugin,
              address: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
            },
          ],
          hideDao: false,
          txHash: '0x0',
        },
        {
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: NetworksEnum.polygon,
          members: 15,
          proposalsCreated: 7,
          proposalsExecuted: 5,
          tvlUSD: 20000,
          uniqueVoters: 130,
          votes: 700,
          plugins: [
            {
              type: EnumPluginType.TokenVotingPlugin,
              address: '0x0',
            },
          ],
          hideDao: false,
          txHash: '0x0',
        },
        {
          avatar: 'fake-avatar',
          name: 'fake-name',
          description: 'fake-description',
          address: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: NetworksEnum.arbitrum,
          members: 15,
          proposalsCreated: 7,
          proposalsExecuted: 5,
          tvlUSD: 20000,
          uniqueVoters: 130,
          votes: 700,
          plugins: [
            {
              type: EnumPluginType.TokenVotingPlugin,
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
      const { data, totRecords, currentPage, totPages } = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        {},
      )

      expect(data.length).to.eq(3)
      expect(totRecords).to.eq(3)
      expect(currentPage).to.eq(1)
      expect(totPages).to.eq(1)
    })

    it('Should find Pagination with networks and plugin', async () => {
      const { data, totRecords, currentPage, totPages } = await Models.Dao.findWithPagination(
        {
          networks: [NetworksEnum.mainnet],
          pluginAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
        },
        {},
      )

      expect(data.length).to.eq(1)
      expect(totRecords).to.eq(1)
      expect(currentPage).to.eq(1)
      expect(totPages).to.eq(1)
    })

    it('Should find Pagination with from to date', async () => {
      await Models.Dao.create({
        address: '0xee0627bA21e9114336977482372486d084497efa',
        creatorAddress: '0xEFbB4E6e5CF4bB4Ae8Cdc2c109da90D2a2433B50',
        network: NetworksEnum.polygon,
        members: 15,
        proposalsCreated: 7,
        proposalsExecuted: 5,
        tvlUSD: '20000',
        uniqueVoters: 130,
        votes: 700,
        plugins: [
          {
            type: EnumPluginType.TokenVotingPlugin,
            address: '0x0',
          },
        ],
        hideDao: false,
        txHash: '0x0',
        createdAt: dayjs().utc().subtract(5, 'day').toDate(),
      })

      const result = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginTypes: [],
        },
        { fromDate: dayjs().utc().subtract(4, 'day').toDate() },
      )

      expect(result.data.length).to.eq(3)
      expect(result.totRecords).to.eq(3)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(1)

      const result2 = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        {
          fromDate: dayjs().utc().subtract(6, 'days').toDate(),
          toDate: dayjs().utc().add(6, 'days').toDate(),
        },
      )

      expect(result2.data.length).to.eq(4)
      expect(result2.totRecords).to.eq(4)
      expect(result2.currentPage).to.eq(1)
      expect(result2.totPages).to.eq(1)

      const result3 = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        {
          fromDate: new Date().setDate(new Date().getDate() - 4).toString(),
        },
      )

      expect(result3.data.length).to.eq(4)
      expect(result3.totRecords).to.eq(4)
      expect(result3.currentPage).to.eq(1)
      expect(result3.totPages).to.eq(1)
    })

    it('Should find Pagination with limit', async () => {
      const params = {
        limit: 2,
      }

      const result = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        params,
      )

      expect(result.data.length).to.eq(2)
      expect(result.totRecords).to.eq(3)
      expect(result.totPages).to.eq(2)
      expect(result.currentPage).to.eq(1)
    })

    it('Should find Pagination with skip and limit', async () => {
      const opts = {
        skip: 1,
        limit: 2,
      }

      const result = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        opts,
      )

      expect(result.data.length).to.eq(2)
      expect(result.totRecords).to.eq(3)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(2)
    })

    it('Should not found documents', async () => {
      const opts = {
        skip: 7,
        limit: 2,
      }

      const result = await Models.Dao.findWithPagination(
        {
          networks: [],
          pluginAddress: undefined,
        },
        opts,
      )

      expect(result.data.length).to.eq(0)
      expect(result.totRecords).to.eq(0)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(1)
    })
  })

  it('Should filterKeys', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.id).to.be.undefined
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(23)
  })
})
