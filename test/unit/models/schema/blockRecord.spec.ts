import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Model: BlockRecord', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumMainnet
  const blockNumber = 12345
  const blockHash = '0xabc123def456'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should getEntityId', () => {
    const entityId = Models.BlockRecord.getEntityId(network, blockNumber)
    expect(entityId).to.eq(`${network}-${blockNumber}`)
  })

  it('Should create BlockRecord', async () => {
    const record = await Models.BlockRecord.create({
      network,
      blockNumber,
      blockHash,
    })
    const expectedId = Models.BlockRecord.getEntityId(network, blockNumber)
    expect(record.id).to.eq(expectedId)
    expect(record.network).to.eq(network)
    expect(record.blockNumber).to.eq(blockNumber)
    expect(record.blockHash).to.eq(blockHash)
  })

  it('Should create with explicit id', async () => {
    const id = 'custom-id'
    const record = await Models.BlockRecord.create({
      id,
      network,
      blockNumber,
      blockHash,
    })
    expect(record.id).to.eq(id)
  })

  it('Should upsert - create new record', async () => {
    const record = await Models.BlockRecord.upsert(network, blockNumber, blockHash)
    expect(record).to.not.be.null
    expect(record!.network).to.eq(network)
    expect(record!.blockNumber).to.eq(blockNumber)
    expect(record!.blockHash).to.eq(blockHash)
  })

  it('Should upsert - update existing record', async () => {
    await Models.BlockRecord.create({ network, blockNumber, blockHash })

    const newHash = '0xnewHash789'
    const updated = await Models.BlockRecord.upsert(network, blockNumber, newHash)
    expect(updated!.blockHash).to.eq(newHash)
    expect(updated!.blockNumber).to.eq(blockNumber)

    // Verify only one record exists
    const count = await Models.BlockRecord.countDocuments({ network, blockNumber })
    expect(count).to.eq(1)
  })

  it('Should bulkUpsert multiple records', async () => {
    const records = [
      { network, blockNumber: 100, blockHash: '0xhash100' },
      { network, blockNumber: 101, blockHash: '0xhash101' },
      { network, blockNumber: 102, blockHash: '0xhash102' },
    ]

    await Models.BlockRecord.bulkUpsert(records)

    const found = await Models.BlockRecord.findByBlockRange(network, 100, 102)
    expect(found).to.have.lengthOf(3)
    expect(found[0].blockNumber).to.eq(100)
    expect(found[1].blockNumber).to.eq(101)
    expect(found[2].blockNumber).to.eq(102)
  })

  it('Should bulkUpsert with empty array', async () => {
    const result = await Models.BlockRecord.bulkUpsert([])
    expect(result).to.be.undefined
  })

  it('Should bulkUpsert update existing records', async () => {
    await Models.BlockRecord.create({ network, blockNumber: 200, blockHash: '0xold' })

    await Models.BlockRecord.bulkUpsert([
      { network, blockNumber: 200, blockHash: '0xnew' },
      { network, blockNumber: 201, blockHash: '0xhash201' },
    ])

    const record200 = await Models.BlockRecord.findByBlockNumber(network, 200)
    expect(record200!.blockHash).to.eq('0xnew')

    const record201 = await Models.BlockRecord.findByBlockNumber(network, 201)
    expect(record201!.blockHash).to.eq('0xhash201')
  })

  it('Should findByBlockNumber', async () => {
    await Models.BlockRecord.create({ network, blockNumber, blockHash })

    const found = await Models.BlockRecord.findByBlockNumber(network, blockNumber)
    expect(found).to.not.be.null
    expect(found!.blockHash).to.eq(blockHash)
  })

  it('Should return null for non-existent block number', async () => {
    const found = await Models.BlockRecord.findByBlockNumber(network, 999999)
    expect(found).to.be.null
  })

  it('Should findByBlockRange', async () => {
    await Models.BlockRecord.bulkUpsert([
      { network, blockNumber: 10, blockHash: '0xa' },
      { network, blockNumber: 15, blockHash: '0xb' },
      { network, blockNumber: 20, blockHash: '0xc' },
      { network, blockNumber: 25, blockHash: '0xd' },
    ])

    const found = await Models.BlockRecord.findByBlockRange(network, 10, 20)
    expect(found).to.have.lengthOf(3)
    expect(found[0].blockNumber).to.eq(10)
    expect(found[1].blockNumber).to.eq(15)
    expect(found[2].blockNumber).to.eq(20)
  })

  it('Should findByBlockRange returns empty for no matches', async () => {
    const found = await Models.BlockRecord.findByBlockRange(network, 1000, 2000)
    expect(found).to.have.lengthOf(0)
  })

  it('Should findByBlockRange only returns records for correct network', async () => {
    await Models.BlockRecord.bulkUpsert([
      { network: NetworksEnum.ethereumMainnet, blockNumber: 50, blockHash: '0xeth' },
      { network: NetworksEnum.polygonMainnet, blockNumber: 50, blockHash: '0xpoly' },
    ])

    const found = await Models.BlockRecord.findByBlockRange(NetworksEnum.ethereumMainnet, 50, 50)
    expect(found).to.have.lengthOf(1)
    expect(found[0].blockHash).to.eq('0xeth')
  })
})
