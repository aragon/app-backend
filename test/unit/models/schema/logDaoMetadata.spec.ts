import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import LogDaoMetadata from '@models/schema/logDaoMetadata'

describe('Model: LogDaoMetadata', () => {
  let sandbox: SinonSandbox
  let rawLogDaoMetadata: Partial<LogDaoMetadata>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const daoAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogDaoMetadata = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      fetchedMetadata: true,
      daoAddress,
      trustedForwarder: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      daoURI: 'test',
      ens: 'fake-ens.eth',
      metadataUri: 'fake-uri',
      name: 'fake-name',
      description: 'fake-description',
      avatar: 'fake-avatar',
      links: [],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogDaoMetadata', async () => {
    it('Should create LogDaoMetadata', async () => {
      const entityId = Models.LogDaoMetadata.getEntityId(
        rawLogDaoMetadata.transactionHash,
        rawLogDaoMetadata.daoAddress,
      )
      rawLogDaoMetadata.entityId = entityId

      const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawLogDaoMetadata.entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogDaoMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogDaoMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogDaoMetadata.network)
      expect(createdLogDao.daoAddress).to.eq(rawLogDaoMetadata.daoAddress)
      expect(createdLogDao.trustedForwarder).to.eq(rawLogDaoMetadata.trustedForwarder)
      expect(createdLogDao.daoURI).to.eq(rawLogDaoMetadata.daoURI)
      expect(createdLogDao.ens).to.eq(rawLogDaoMetadata.ens)
      expect(createdLogDao.metadataUri).to.eq(rawLogDaoMetadata.metadataUri)
      expect(createdLogDao.name).to.eq(rawLogDaoMetadata.name)
      expect(createdLogDao.description).to.eq(rawLogDaoMetadata.description)
      expect(createdLogDao.avatar).to.eq(rawLogDaoMetadata.avatar)
    })

    it('Should create without entityId', async () => {
      const entityId = Models.LogDaoMetadata.getEntityId(
        rawLogDaoMetadata.transactionHash,
        rawLogDaoMetadata.daoAddress,
      )
      const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogDaoMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogDaoMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogDaoMetadata.network)
      expect(createdLogDao.daoAddress).to.eq(rawLogDaoMetadata.daoAddress)
      expect(createdLogDao.trustedForwarder).to.eq(rawLogDaoMetadata.trustedForwarder)
      expect(createdLogDao.daoURI).to.eq(rawLogDaoMetadata.daoURI)
      expect(createdLogDao.ens).to.eq(rawLogDaoMetadata.ens)
      expect(createdLogDao.metadataUri).to.eq(rawLogDaoMetadata.metadataUri)
      expect(createdLogDao.name).to.eq(rawLogDaoMetadata.name)
      expect(createdLogDao.description).to.eq(rawLogDaoMetadata.description)
      expect(createdLogDao.avatar).to.eq(rawLogDaoMetadata.avatar)
    })
  })

  it('Should update LogDaoMetadata', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    expect(createdLogDao.creatorAddress).to.eq(rawLogDaoMetadata.creatorAddress)

    await createdLogDao.update({
      daoURI: 'new-uri',
    })

    expect(createdLogDao.daoURI).to.eq('new-uri')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const daoAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const entityId = await Models.LogDaoMetadata.getEntityId(transactionHash, daoAddress)
    expect(entityId).to.eq(`${transactionHash}-${daoAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    const foundLogDao = await Models.LogDaoMetadata.findExistingLog(
      createdLogDao.transactionHash,
      createdLogDao.daoAddress,
    )
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    const foundLogDao = await Models.LogDaoMetadata.findByEntityId(createdLogDao.entityId)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogDaoMetadata.address)
  })
})
