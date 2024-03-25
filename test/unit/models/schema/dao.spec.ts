import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, EnumPluginType } from '@types'
import Dao from '@models/schema/dao'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'

describe('Model: Dao', () => {
  let sandbox: SinonSandbox
  let rawDao: Partial<Dao>
  let ethereumNetwork: Network
  let polygonNetwork: Network
  let arbitrumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.ethereum,
      status: 'healthy',
    })
    polygonNetwork = await Models.Network.create({
      name: NetworksEnum.polygon,
      status: 'healthy',
    })
    arbitrumNetwork = await Models.Network.create({
      name: NetworksEnum.arbitrum,
      status: 'healthy',
    })

    rawDao = {
      avatar: 'fake-avatar',
      name: 'fake-name',
      description: 'fake-description',
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      network: ethereumNetwork.name,
      members: 10,
      proposalsCreated: 5,
      proposalsExecuted: 3,
      tvlUSD: 10000,
      uniqueVoters: 100,
      votes: 500,
      plugins: [
        {
          type: EnumPluginType.MultisigPlugin,
          address: '0x0',
        },
      ],
      hideDao: false,
      txHash: '0x0',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create DAO', async () => {
    const createdDao = await Models.Dao.create(rawDao)

    expect(createdDao.id).to.exist
    expect(createdDao.avatar).to.eq(rawDao.avatar)
    expect(createdDao.name).to.eq(rawDao.name)
    expect(createdDao.description).to.eq(rawDao.description)
    expect(createdDao.daoAddress).to.eq(rawDao.daoAddress)
    expect(createdDao.creatorAddress).to.eq(rawDao.creatorAddress)
    expect(createdDao.network).to.eq(ethereumNetwork.name)
    expect(createdDao.members).to.eq(rawDao.members)
    expect(createdDao.proposalsCreated).to.eq(rawDao.proposalsCreated)
    expect(createdDao.proposalsExecuted).to.eq(rawDao.proposalsExecuted)
    expect(createdDao.tvlUSD).to.eq(rawDao.tvlUSD)
    expect(createdDao.uniqueVoters).to.eq(rawDao.uniqueVoters)
    expect(createdDao.votes).to.eq(rawDao.votes)
    expect(createdDao.plugins.length).to.eq(1)
    expect(createdDao.plugins[0].type).to.eq(rawDao.plugins![0].type)
    expect(createdDao.hideDao).to.eq(rawDao.hideDao)
    expect(createdDao.txHash).to.eq(rawDao.txHash)
    expect(createdDao.metadataIpfs).to.eq(null)
    expect(createdDao.lastUpdatedAt).to.eq(null)
  })

  it('Should update DAO', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    expect(createdDao.creatorAddress).to.eq('0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969')

    await createdDao.update({
      creatorAddress: '0x558c9997f8d382f02dfce79e275af637d8bb19e6',
    })

    expect(createdDao.creatorAddress).to.eq('0x558c9997f8d382f02dfce79e275af637d8bb19e6')
  })

  it('Should find DAO by address', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const dao = await Models.Dao.findByDaoAddress(createdDao.daoAddress)
    expect(dao?.daoAddress).to.eq(createdDao.daoAddress)
  })

  it('Should find DAO by address and networks', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const dao = await Models.Dao.findByDaoAddressAndNetwork(createdDao.daoAddress, rawDao.network as NetworksEnum)
    expect(dao?.daoAddress).to.eq(createdDao.daoAddress)
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
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          network: ethereumNetwork.name,
          members: 10,
          proposalsCreated: 5,
          proposalsExecuted: 3,
          tvlUSD: 10000,
          uniqueVoters: 100,
          votes: 500,
          plugins: [
            {
              type: EnumPluginType.MultisigPlugin,
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
          daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: polygonNetwork.name,
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
          daoAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          creatorAddress: '0x837b3ca530064776a04192b54eCa937fc1fF2d8C',
          network: arbitrumNetwork.name,
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
      ]

      await Promise.all(fakeDaos.map(w => Models.Dao.create(w)))
    })

    it('Should find Pagination', async () => {
      const { data, totRecords, currentPage, totPages } = await Models.Dao.findWithPagination(
        { networks: [], pluginTypes: [] },
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
          networks: [NetworksEnum.ethereum],
          pluginTypes: [EnumPluginType.MultisigPlugin],
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
        daoAddress: '0xee0627bA21e9114336977482372486d084497efa',
        creatorAddress: '0xEFbB4E6e5CF4bB4Ae8Cdc2c109da90D2a2433B50',
        network: polygonNetwork.name,
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
        createdAt: dayjs().utc().subtract(5, 'day').toDate(),
      })

      const result = await Models.Dao.findWithPagination(
        { networks: [], pluginTypes: [] },
        { fromDate: dayjs().utc().subtract(4, 'day').toDate() },
      )

      expect(result.data.length).to.eq(3)
      expect(result.totRecords).to.eq(3)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(1)

      const result2 = await Models.Dao.findWithPagination(
        { networks: [], pluginTypes: [] },
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
        { networks: [], pluginTypes: [] },
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

      const result = await Models.Dao.findWithPagination({ networks: [], pluginTypes: [] }, params)

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

      const result = await Models.Dao.findWithPagination({ networks: [], pluginTypes: [] }, opts)

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

      const result = await Models.Dao.findWithPagination({ networks: [], pluginTypes: [] }, opts)

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
    expect(Object.keys(filterDao).length).to.eq(20)
  })
})
