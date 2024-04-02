import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { SyncDao } from '@services/dataSync/syncDao'
import { EnumPluginType, IDao, NetworksEnum } from '@types'
import dayjs from '@helpers/dayjs'
import DuneHelper from '@helpers/dune'
import logger from '@logger'
import SatsumaHelper from '@helpers/satsuma'
import IPFSModule from '@modules/ipfs'

describe('DataSync: syncDao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('fetchAll', async () => {
    const duneDaosMock = [{ daoAddress: '0x123', network: NetworksEnum.mainnet }]
    const getDaosStub = sandbox.stub(DuneHelper, 'getDaos').resolves({ daos: duneDaosMock } as any)
    const _fetchDaosByNetworkStub = sandbox.stub(SyncDao, '_fetchDaosByNetwork').resolves()
    const _resetStub = sandbox.spy(SyncDao, '_reset')
    const stubLogger = sandbox.spy(logger, 'verbose')

    await SyncDao.fetchAll()

    expect(getDaosStub.calledOnce).to.be.true
    expect(_fetchDaosByNetworkStub.callCount).to.eq(Object.values(NetworksEnum).length)
    expect(_resetStub.calledOnce).to.be.true
    expect(stubLogger.callCount).to.eq(Object.values(NetworksEnum).length + 2)
  })

  it('_fetchDaosByNetwork', async () => {
    const networkName = NetworksEnum.mainnet
    const batchSize = 1
    const daosMock = [
      { daoAddress: '0x123', metadataIpfs: 'validIpfsUrl', hideDao: false },
      { daoAddress: '0x124', metadataIpfs: 'validIpfsUrl', hideDao: false },
      { daoAddress: '0x456', metadataIpfs: 'invalidIpfsUrl', hideDao: true },
    ]
    const metadataMock = {
      name: 'DAO Name',
      avatar: 'avatarUrl',
      description: 'A DAO',
    }

    const getDaosStub = sandbox
      .stub(SatsumaHelper, 'getDaos')
      .onFirstCall()
      .resolves({ daos: [daosMock[0]], nextCursor: 'next' } as any)
      .onSecondCall()
      .resolves({ daos: [daosMock[1]], nextCursor: 'next' } as any)
      .onThirdCall()
      .resolves({ daos: [daosMock[2]], nextCursor: null } as any)

    const fetchMetadataStub = sandbox
      .stub(IPFSModule, 'fetchMetadata')
      .onFirstCall()
      .resolves(metadataMock)
      .onSecondCall()
      .resolves(null)
      .onThirdCall()
      .resolves(metadataMock)

    const isValidIpfsUrlStub = sandbox.stub(IPFSModule, 'isValidIpfsUrl').callsFake(url => url === 'validIpfsUrl')
    const _createOrUpdateStub = sandbox.stub(SyncDao, '_createOrUpdate').resolves()

    await SyncDao._fetchDaosByNetwork(networkName, batchSize)

    expect(getDaosStub.callCount).to.eq(3)
    expect(fetchMetadataStub.callCount).to.eq(2)
    expect(isValidIpfsUrlStub.callCount).to.eq(3)
    expect(_createOrUpdateStub.callCount).to.eq(3)

    expect(SyncDao.extraLog[networkName].totalDaos).to.equal(3)
    expect(SyncDao.extraLog[networkName].includedDaos).to.equal(daosMock.filter(dao => !dao.hideDao).length)
    expect(SyncDao.extraLog[networkName].excludedDaos).to.equal(daosMock.filter(dao => dao.hideDao).length)
    expect(SyncDao.extraLog[networkName].metadataFetched).to.equal(1)
    expect(SyncDao.extraLog[networkName].metadataInvalid).to.equal(1)
  })

  describe('_createOrUpdate', async () => {
    it('should create dao', async () => {
      const metadata = {
        name: 'fake-name',
        avatar: 'fake-avatar',
        description: 'fake-description',
        links: [],
      }
      const dao: IDao = {
        creatorAddress: '0x00',
        daoAddress: '0x01',
        permalink: `${NetworksEnum.mainnet}-test.eth`,
        block: 1111,
        createdAt: dayjs().toDate(),
        ens: 'test.eth',
        members: 12,
        metadataIpfs: null,
        network: NetworksEnum.mainnet,
        links: [],
        plugins: [
          {
            address: '0x00',
            type: EnumPluginType.MultisigPlugin,
          },
        ],
        proposalsCreated: dayjs().unix(),
        proposalsExecuted: dayjs().unix(),
        tvlUSD: 0,
        txHash: null,
        uniqueVoters: 0,
        votes: 0,
        hideDao: false,
      }

      SyncDao.duneDaos = [
        {
          daoAddress: '0x01',
          ens: 'test.eth',
          network: NetworksEnum.mainnet,
          tvlUSD: 10,
          txHash: '0x00001',
          uniqueVoters: 12,
          votes: 1,
        } as any,
      ]

      const dbDao = await SyncDao._createOrUpdate(dao, NetworksEnum.mainnet, metadata)

      expect(dbDao.name).to.eq(metadata.name)
      expect(dbDao.avatar).to.eq(metadata.avatar)
      expect(dbDao.description).to.eq(metadata.description)
      expect(dbDao.links.length).to.eq(metadata.links.length)
      expect(dbDao.creatorAddress).to.eq(dao.creatorAddress)
      expect(dbDao.daoAddress).to.eq(dao.daoAddress)
      expect(dbDao.block).to.eq(dao.block)
      expect(dbDao.ens).to.eq(dao.ens)
      expect(dbDao.members).to.eq(dao.members)
      expect(dbDao.metadataIpfs).to.eq(dao.metadataIpfs)
      expect(dbDao.network).to.eq(dao.network)
      expect(dbDao.plugins.length).to.eq(1)
      expect(dbDao.plugins[0].type).to.eq(dao.plugins[0].type)
      expect(dbDao.plugins[0].address).to.eq(dao.plugins[0].address)
      expect(dbDao.proposalsCreated).to.eq(dao.proposalsCreated)
      expect(dbDao.proposalsExecuted).to.eq(dao.proposalsExecuted)
      expect(dbDao.tvlUSD).to.eq(10)
      expect(dbDao.txHash).to.eq('0x00001')
      expect(dbDao.uniqueVoters).to.eq(12)
      expect(dbDao.votes).to.eq(1)
      expect(dbDao.hideDao).to.eq(dao.hideDao)
      expect(dbDao.createdAt.toString()).to.eq(dao.createdAt.toString())
    })

    it('should create dao without dune and metadata', async () => {
      const dao: any = {
        creatorAddress: '0x00',
        daoAddress: '0x01',
        block: 1111,
        createdAt: dayjs().toDate(),
        ens: 'test.eth',
        metadataIpfs: null,
        network: NetworksEnum.mainnet,
        links: [],
        proposalsCreated: dayjs().unix(),
        proposalsExecuted: dayjs().unix(),
        tvlUSD: 0,
        txHash: null,
        uniqueVoters: 0,
        votes: 0,
        hideDao: false,
      }

      SyncDao.duneDaos = []

      const dbDao = await SyncDao._createOrUpdate(dao, NetworksEnum.mainnet)

      expect(dbDao.name).to.eq(null)
      expect(dbDao.avatar).to.eq(null)
      expect(dbDao.description).to.eq(null)
      expect(dbDao.links.length).to.eq(0)
      expect(dbDao.creatorAddress).to.eq(dao.creatorAddress)
      expect(dbDao.daoAddress).to.eq(dao.daoAddress)
      expect(dbDao.block).to.eq(dao.block)
      expect(dbDao.ens).to.eq(dao.ens)
      expect(dbDao.members).to.eq(0)
      expect(dbDao.metadataIpfs).to.eq(dao.metadataIpfs)
      expect(dbDao.network).to.eq(dao.network)
      expect(dbDao.plugins.length).to.eq(0)
      expect(dbDao.proposalsCreated).to.eq(dao.proposalsCreated)
      expect(dbDao.proposalsExecuted).to.eq(dao.proposalsExecuted)
      expect(dbDao.tvlUSD).to.eq(0)
      expect(dbDao.txHash).to.eq(null)
      expect(dbDao.uniqueVoters).to.eq(0)
      expect(dbDao.votes).to.eq(0)
      expect(dbDao.hideDao).to.eq(dao.hideDao)
      expect(dbDao.createdAt.toString()).to.eq(dao.createdAt.toString())
    })

    it('should update existing dao', async () => {
      const metadata = {
        name: 'fake-name',
        avatar: 'fake-avatar',
        description: 'fake-description',
        links: [],
      }
      const dao: IDao = {
        creatorAddress: '0x00',
        daoAddress: '0x01',
        permalink: `${NetworksEnum.mainnet}-test.eth`,
        block: 1111,
        createdAt: dayjs().toDate(),
        ens: 'test.eth',
        members: 12,
        metadataIpfs: null,
        network: NetworksEnum.mainnet,
        links: [],
        plugins: [
          {
            address: '0x00',
            type: EnumPluginType.MultisigPlugin,
          },
        ],
        proposalsCreated: dayjs().unix(),
        proposalsExecuted: dayjs().unix(),
        tvlUSD: 10,
        txHash: '0x00001',
        uniqueVoters: 12,
        votes: 1,
        hideDao: false,
      }
      const dbDao = await SyncDao._createOrUpdate(dao, NetworksEnum.mainnet, metadata)

      expect(dbDao.name).to.eq(metadata.name)

      metadata.name = 'new-name'
      const updatedDao = await SyncDao._createOrUpdate(dao, NetworksEnum.mainnet, metadata)

      expect(updatedDao.name).to.eq('new-name')
    })
  })

  it('should reset', () => {
    SyncDao.duneDaos = [{ daoAddress: '0x123', network: NetworksEnum.mainnet } as any]
    SyncDao.extraLog = { totalDaosAllNetworks: 1 }

    SyncDao._reset()

    expect(SyncDao.duneDaos).to.deep.equal([])
    expect(SyncDao.extraLog).to.deep.equal({ totalDaosAllNetworks: 0 })
  })
})
