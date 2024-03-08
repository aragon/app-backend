import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, EnumPluginType } from '@types'
import Dao from '@models/schema/dao'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import dayjs from 'dayjs'

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
      pluginName: EnumPluginType.MultisigPlugin,
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
    expect(createdDao).to.have.property('avatar', rawDao.avatar)
    expect(createdDao).to.have.property('name', rawDao.name)
    expect(createdDao).to.have.property('description', rawDao.description)
    expect(createdDao).to.have.property('daoAddress', rawDao.daoAddress)
    expect(createdDao).to.have.property('creatorAddress', rawDao.creatorAddress)
    expect(createdDao).to.have.property('network', ethereumNetwork.name)
    expect(createdDao).to.have.property('members', rawDao.members)
    expect(createdDao).to.have.property(
      'proposalsCreated',
      rawDao.proposalsCreated,
    )
    expect(createdDao).to.have.property(
      'proposalsExecuted',
      rawDao.proposalsExecuted,
    )
    expect(createdDao).to.have.property('tvlUSD', rawDao.tvlUSD)
    expect(createdDao).to.have.property('uniqueVoters', rawDao.uniqueVoters)
    expect(createdDao).to.have.property('votes', rawDao.votes)
    expect(createdDao).to.have.property('pluginName', rawDao.pluginName)
    expect(createdDao).to.have.property('hideDao', rawDao.hideDao)
    expect(createdDao).to.have.property('txHash', rawDao.txHash)
    expect(createdDao).to.have.property('metadataIpfs', null)
    expect(createdDao).to.have.property('lastUpdatedAt', null)
  })

  it('Should update DAO', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    expect(createdDao).to.have.property('members', rawDao.members)

    await createdDao.update({
      members: 30,
    })

    expect(createdDao).to.have.property('members', 30)
  })

  it('Should find DAO by address', async () => {
    const createdDao = await Models.Dao.create(rawDao)
    const dao = await Models.Dao.findByDaoAddress(createdDao.daoAddress)
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
          pluginName: EnumPluginType.MultisigPlugin,
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
          pluginName: EnumPluginType.TokenVotingPlugin,
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
          pluginName: EnumPluginType.TokenVotingPlugin,
          hideDao: false,
          txHash: '0x0',
        },
      ]

      await Promise.all(fakeDaos.map(w => Models.Dao.create(w)))
    })

    it('Should find Pagination', async () => {
      const { data, totRecords, currentPage, totPages } =
        await Models.Dao.findWithPagination(
          { networks: [], pluginNames: [] },
          {},
        )

      expect(data.length).to.eq(3)
      expect(totRecords).to.eq(3)
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
        pluginName: EnumPluginType.TokenVotingPlugin,
        hideDao: false,
        txHash: '0x0',
        createdAt: dayjs().subtract(5, 'day').toDate(),
      })

      const result = await Models.Dao.findWithPagination(
        { networks: [], pluginNames: [] },
        { fromDate: dayjs().subtract(4, 'day').toString() },
      )

      expect(result.data.length).to.eq(3)
      expect(result.totRecords).to.eq(3)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(1)

      const result2 = await Models.Dao.findWithPagination(
        { networks: [], pluginNames: [] },
        {
          fromDate: dayjs().subtract(6, 'days').toString(),
          toDate: dayjs().add(6, 'days').toString(),
        },
      )

      expect(result2.data.length).to.eq(4)
      expect(result2.totRecords).to.eq(4)
      expect(result2.currentPage).to.eq(1)
      expect(result2.totPages).to.eq(1)

      const result3 = await Models.Dao.findWithPagination(
        { networks: [], pluginNames: [] },
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
        { networks: [], pluginNames: [] },
        params,
      )

      expect(result.data.length).to.eq(2)
      expect(result.totRecords).to.eq(3)
      expect(result.totPages).to.eq(2)
      expect(result.currentPage).to.eq(1)
    })

    it('Should find Pagination with offset and limit', async () => {
      const opts = {
        offset: 1,
        limit: 2,
      }

      const result = await Models.Dao.findWithPagination(
        { networks: [], pluginNames: [] },
        opts,
      )

      expect(result.data.length).to.eq(2)
      expect(result.totRecords).to.eq(3)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(2)
    })

    it('Should not found documents', async () => {
      const opts = {
        offset: 7,
        limit: 2,
      }

      const result = await Models.Dao.findWithPagination(
        { networks: [], pluginNames: [] },
        opts,
      )

      expect(result.data.length).to.eq(0)
      expect(result.totRecords).to.eq(0)
      expect(result.currentPage).to.eq(1)
      expect(result.totPages).to.eq(1)
    })
  })
})
