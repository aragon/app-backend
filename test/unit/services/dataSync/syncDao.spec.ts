import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { SyncDao } from '@services/dataSync/syncDao'
import { EnumPluginType, IDao, NetworksEnum } from '@types'
import dayjs from '@helpers/dayjs'

describe('DataSync: syncDao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

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
      block: 1111,
      createdAt: dayjs().toDate(),
      ens: 'test.eth',
      members: 12,
      metadataIpfs: null,
      network: NetworksEnum.ethereum,
      pluginName: EnumPluginType.MultisigPlugin,
      proposalsCreated: dayjs().unix(),
      proposalsExecuted: dayjs().unix(),
      tvlUSD: 10,
      txHash: '0x00001',
      uniqueVoters: 12,
      votes: 1,
      hideDao: false,
    }
    const dbDao = await SyncDao._createOrUpdate(
      dao,
      NetworksEnum.ethereum,
      metadata,
    )

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
    expect(dbDao.pluginName).to.eq(dao.pluginName)
    expect(dbDao.proposalsCreated).to.eq(dao.proposalsCreated)
    expect(dbDao.proposalsExecuted).to.eq(dao.proposalsExecuted)
    expect(dbDao.tvlUSD).to.eq(dao.tvlUSD)
    expect(dbDao.txHash).to.eq(dao.txHash)
    expect(dbDao.uniqueVoters).to.eq(dao.uniqueVoters)
    expect(dbDao.votes).to.eq(dao.votes)
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
      block: 1111,
      createdAt: dayjs().toDate(),
      ens: 'test.eth',
      members: 12,
      metadataIpfs: null,
      network: NetworksEnum.ethereum,
      pluginName: EnumPluginType.MultisigPlugin,
      proposalsCreated: dayjs().unix(),
      proposalsExecuted: dayjs().unix(),
      tvlUSD: 10,
      txHash: '0x00001',
      uniqueVoters: 12,
      votes: 1,
      hideDao: false,
    }
    const dbDao = await SyncDao._createOrUpdate(
      dao,
      NetworksEnum.ethereum,
      metadata,
    )

    expect(dbDao.name).to.eq(metadata.name)

    metadata.name = 'new-name'
    const updatedDao = await SyncDao._createOrUpdate(
      dao,
      NetworksEnum.ethereum,
      metadata,
    )

    expect(updatedDao.name).to.eq('new-name')
  })
})
