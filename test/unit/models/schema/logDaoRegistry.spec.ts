import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import LogDaoRegistry, { URIUpdate } from '@models/schema/logDaoRegistry'

describe('Model: LogDaoRegistry', () => {
  let sandbox: SinonSandbox
  let rawLogDaoRegistry: Partial<LogDaoRegistry>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogDaoRegistry = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      address,
      creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      subdomain: 'fake-subdomain',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogDaoRegistry', async () => {
    it('Should create LogDaoRegistry', async () => {
      const entityId = Models.LogDaoRegistry.getEntityId(rawLogDaoRegistry.transactionHash, rawLogDaoRegistry.address)
      rawLogDaoRegistry.entityId = entityId
      const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)

      expect(createdLogDaoRegistry.id).to.exist
      expect(createdLogDaoRegistry.entityId).to.eq(rawLogDaoRegistry.entityId)
      expect(createdLogDaoRegistry.transactionHash).to.eq(rawLogDaoRegistry.transactionHash)
      expect(createdLogDaoRegistry.blockNumber).to.eq(rawLogDaoRegistry.blockNumber)
      expect(createdLogDaoRegistry.network).to.eq(rawLogDaoRegistry.network)
      expect(createdLogDaoRegistry.address).to.eq(rawLogDaoRegistry.address)
      expect(createdLogDaoRegistry.creatorAddress).to.eq(rawLogDaoRegistry.creatorAddress)
      expect(createdLogDaoRegistry.subdomain).to.eq(rawLogDaoRegistry.subdomain)
    })

    it('Should create LogDaoRegistry without entityId', async () => {
      const entityId = Models.LogDaoRegistry.getEntityId(rawLogDaoRegistry.transactionHash, rawLogDaoRegistry.address)
      const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)

      expect(createdLogDaoRegistry.id).to.exist
      expect(createdLogDaoRegistry.entityId).to.eq(entityId)
      expect(createdLogDaoRegistry.transactionHash).to.eq(rawLogDaoRegistry.transactionHash)
      expect(createdLogDaoRegistry.blockNumber).to.eq(rawLogDaoRegistry.blockNumber)
      expect(createdLogDaoRegistry.network).to.eq(rawLogDaoRegistry.network)
      expect(createdLogDaoRegistry.address).to.eq(rawLogDaoRegistry.address)
      expect(createdLogDaoRegistry.creatorAddress).to.eq(rawLogDaoRegistry.creatorAddress)
      expect(createdLogDaoRegistry.subdomain).to.eq(rawLogDaoRegistry.subdomain)
    })
  })

  it('Should update LogDaoRegistry', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    expect(createdLogDaoRegistry.creatorAddress).to.eq(rawLogDaoRegistry.creatorAddress)

    await createdLogDaoRegistry.update({
      creatorAddress: '0x558c9997f8d382f02dfce79e275af637d8bb19e1',
    })

    expect(createdLogDaoRegistry.creatorAddress).to.eq('0x558c9997f8d382f02dfce79e275af637d8bb19e1')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const entityId = Models.LogDaoRegistry.getEntityId(transactionHash, address)
    expect(entityId).to.eq(`${transactionHash}-${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    const foundLogDaoRegistry = await Models.LogDaoRegistry.findExistingLog(
      createdLogDaoRegistry.transactionHash,
      createdLogDaoRegistry.address,
    )
    expect(foundLogDaoRegistry?.entityId).to.eq(createdLogDaoRegistry.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    const foundLogDaoRegistry = await Models.LogDaoRegistry.findByEntityId(createdLogDaoRegistry.entityId)
    expect(foundLogDaoRegistry?.entityId).to.eq(createdLogDaoRegistry.entityId)
  })

  it('Should reload', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    await createdLogDaoRegistry.reload()

    expect(createdLogDaoRegistry.address).to.eq(rawLogDaoRegistry.address)
  })

  it('should find by address', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    const foundLogDaoRegistry = await Models.LogDaoRegistry.findByAddress(
      createdLogDaoRegistry.address,
      createdLogDaoRegistry.network,
    )
    expect(foundLogDaoRegistry?.entityId).to.eq(createdLogDaoRegistry.entityId)
  })

  it('Should addUriEvent when empty', async () => {
    const daoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    daoRegistry.uriUpdates = undefined

    const rawUri: URIUpdate = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      uri: '1',
    }
    const daoRegistryDb = await daoRegistry.addUriEvent(rawUri)
    const uriDb = await daoRegistryDb.findUriEvent(rawUri.transactionHash)

    expect(daoRegistryDb?.transactionHash).to.eq(rawLogDaoRegistry.transactionHash)

    expect(uriDb?.transactionHash).to.eq(rawUri.transactionHash)
    expect(uriDb?.blockNumber).to.eq(rawUri.blockNumber)
    expect(uriDb?.uri).to.eq(rawUri.uri)
  })

  it('Should addUriEvent/findUriEvent', async () => {
    const proposal = await Models.LogDaoRegistry.create(rawLogDaoRegistry)

    const rawUri: URIUpdate = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      uri: '1',
    }
    const proposalDb = await proposal.addUriEvent(rawUri)
    const uriDb = await proposalDb.findUriEvent(rawUri.transactionHash)

    expect(proposalDb?.transactionHash).to.eq(rawLogDaoRegistry.transactionHash)

    expect(uriDb?.transactionHash).to.eq(rawUri.transactionHash)
    expect(uriDb?.blockNumber).to.eq(rawUri.blockNumber)
    expect(uriDb?.uri).to.eq(rawUri.uri)
  })

  it('save uri update', async () => {
    const createdLogDaoRegistry = await Models.LogDaoRegistry.create(rawLogDaoRegistry)
    const uri = 'fake-uri'
    await createdLogDaoRegistry.addUriEvent({
      uri,
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
    } as any)
    expect(createdLogDaoRegistry.uriUpdates[0].uri).to.eq(uri)
  })
})
