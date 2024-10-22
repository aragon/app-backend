import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IMetadataType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import LogMetadata from '@models/schema/logMetadata'

describe('Model: LogMetadata', () => {
  let sandbox: SinonSandbox
  let rawLogDaoMetadata: Partial<LogMetadata>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogDaoMetadata = {
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      transactionIndex: 0,
      logIndex: 1,
      blockNumber: 3,
      fetchedMetadata: true,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      trustedForwarder: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      daoURI: 'test',
      ens: 'fake-ens.eth',
      metadataUri: 'fake-uri',
      name: 'fake-name',
      description: 'fake-description',
      avatar: 'fake-avatar',
      links: [],
      type: IMetadataType.dao,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogDaoMetadata', async () => {
    it('Should create LogDaoMetadata', async () => {
      const entityId = Models.LogMetadata.getEntityId(
        rawLogDaoMetadata.network,
        rawLogDaoMetadata.transactionHash,
        rawLogDaoMetadata.transactionIndex,
        rawLogDaoMetadata.logIndex,
      )
      rawLogDaoMetadata.id = entityId

      const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)

      expect(createdLogDao.id).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogDaoMetadata.transactionHash)
      expect(createdLogDao.transactionIndex).to.eq(rawLogDaoMetadata.transactionIndex)
      expect(createdLogDao.logIndex).to.eq(rawLogDaoMetadata.logIndex)
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
      const entityId = Models.LogMetadata.getEntityId({
        network: rawLogDaoMetadata.network!,
        transactionHash: rawLogDaoMetadata.transactionHash!,
        transactionIndex: rawLogDaoMetadata.transactionIndex!,
        logIndex: rawLogDaoMetadata.logIndex!,
      })
      const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)

      expect(createdLogDao.id).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogDaoMetadata.transactionHash)
      expect(createdLogDao.transactionIndex).to.eq(rawLogDaoMetadata.transactionIndex)
      expect(createdLogDao.logIndex).to.eq(rawLogDaoMetadata.logIndex)
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
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    expect(createdLogDao.creatorAddress).to.eq(rawLogDaoMetadata.creatorAddress)

    await createdLogDao.update({
      daoURI: 'new-uri',
    })

    expect(createdLogDao.daoURI).to.eq('new-uri')
  })

  it('Should getEntityId', async () => {
    const network = NetworksEnum.polygonMainnet
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const transactionIndex = 0
    const logIndex = 0
    const entityId = Models.LogMetadata.getEntityId({
      network,
      transactionHash,
      transactionIndex,
      logIndex,
    })
    expect(entityId).to.eq(`${network}-${transactionHash}-${transactionIndex}-${logIndex}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    const foundLogDao = await Models.LogMetadata.findExistingLog({
      network: createdLogDao.network,
      transactionHash: createdLogDao.transactionHash,
      transactionIndex: createdLogDao.transactionIndex,
      logIndex: createdLogDao.logIndex,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    const foundLogDao = await Models.LogMetadata.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogDaoMetadata.address)
  })

  it('getMetadataAtBlockNumber', async () => {
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    const metadataAtBlockNumber = await Models.LogMetadata.getMetadataAtBlockNumber(
      rawLogDaoMetadata.daoAddress!,
      rawLogDaoMetadata.blockNumber!,
      NetworksEnum.ethereumMainnet,
    )

    expect(metadataAtBlockNumber?.name).to.eq(createdLogDao.name)
  })
})
