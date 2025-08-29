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

  it('Should create with existing id', async () => {
    const customId = 'custom-id-12345'
    const logMetadataWithId = {
      ...rawLogDaoMetadata,
      id: customId,
    }
    const createdLogDao = await Models.LogMetadata.create(logMetadataWithId)
    expect(createdLogDao.id).to.eq(customId)
  })

  it('Should not update when value is equal', async () => {
    const createdLogDao = await Models.LogMetadata.create(rawLogDaoMetadata)
    const saveSpy = sandbox.spy(createdLogDao, 'save')

    // Update with the same value
    await createdLogDao.update({
      daoURI: rawLogDaoMetadata.daoURI,
    })

    // Save should still be called but the value should remain the same
    expect(saveSpy.calledOnce).to.be.true
    expect(createdLogDao.daoURI).to.eq(rawLogDaoMetadata.daoURI)
  })

  it('Should getLatestMetadata', async () => {
    // Create multiple metadata entries with different block numbers
    const metadata1 = {
      ...rawLogDaoMetadata,
      blockNumber: 100,
      pluginAddress: '0x1234567890123456789012345678901234567890',
    }
    const metadata2 = {
      ...rawLogDaoMetadata,
      blockNumber: 200,
      pluginAddress: '0x1234567890123456789012345678901234567890',
      transactionIndex: 1,
    }
    const metadata3 = {
      ...rawLogDaoMetadata,
      blockNumber: 150,
      pluginAddress: '0x1234567890123456789012345678901234567890',
      logIndex: 2,
    }

    await Models.LogMetadata.create(metadata1)
    await Models.LogMetadata.create(metadata2)
    await Models.LogMetadata.create(metadata3)

    const latestMetadata = await Models.LogMetadata.getLatestMetadata(
      NetworksEnum.ethereumMainnet,
      '0x1234567890123456789012345678901234567890',
      'pluginAddress',
    )

    expect(latestMetadata).to.exist
    expect(latestMetadata.blockNumber).to.eq(200)
  })

  it('Should return empty object when no metadata found in getLatestMetadata', async () => {
    const latestMetadata = await Models.LogMetadata.getLatestMetadata(
      NetworksEnum.ethereumMainnet,
      '0x9999999999999999999999999999999999999999',
      'pluginAddress',
    )

    expect(latestMetadata).to.deep.equal({})
  })

  it('Should return empty object when no metadata found in getMetadataAtBlockNumber', async () => {
    const metadataAtBlockNumber = await Models.LogMetadata.getMetadataAtBlockNumber(
      '0x9999999999999999999999999999999999999999',
      1000,
      NetworksEnum.ethereumMainnet,
    )

    expect(metadataAtBlockNumber).to.deep.equal({})
  })

  it('Should getLatestMetadata with default key (pluginAddress)', async () => {
    const metadata = {
      ...rawLogDaoMetadata,
      pluginAddress: '0xAAAA567890123456789012345678901234567890',
    }
    await Models.LogMetadata.create(metadata)

    const latestMetadata = await Models.LogMetadata.getLatestMetadata(
      NetworksEnum.ethereumMainnet,
      '0xAAAA567890123456789012345678901234567890',
    )

    expect(latestMetadata).to.exist
    expect(latestMetadata.pluginAddress).to.eq('0xAAAA567890123456789012345678901234567890')
  })

  it('Should getMetadataAtBlockNumber with custom metadataOrigin', async () => {
    const metadata = {
      ...rawLogDaoMetadata,
      pluginAddress: '0xBBBB567890123456789012345678901234567890',
      blockNumber: 50,
    }
    await Models.LogMetadata.create(metadata)

    const metadataAtBlockNumber = await Models.LogMetadata.getMetadataAtBlockNumber(
      '0xBBBB567890123456789012345678901234567890',
      100,
      NetworksEnum.ethereumMainnet,
      'pluginAddress',
    )

    expect(metadataAtBlockNumber).to.exist
    expect(metadataAtBlockNumber.name).to.eq(metadata.name)
  })
})
