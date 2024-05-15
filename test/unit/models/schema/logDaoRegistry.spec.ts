import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import LogDaoRegistry from '@models/schema/logDaoRegistry'

describe('Model: LogDaoRegistry', () => {
  let sandbox: SinonSandbox
  let rawLogDaoRegistry: Partial<LogDaoRegistry>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogDaoRegistry = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      address,
      creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      ens: 'fake-ens.eth',
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
      expect(createdLogDaoRegistry.ens).to.eq(rawLogDaoRegistry.ens)
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
      expect(createdLogDaoRegistry.ens).to.eq(rawLogDaoRegistry.ens)
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
})
