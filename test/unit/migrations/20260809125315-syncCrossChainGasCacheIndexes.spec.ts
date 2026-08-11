import { Models } from '@dbModels'
import syncCrossChainGasCacheIndexesMigration from '@src/migrations/20260809125315-syncCrossChainGasCacheIndexes'
import { ICrossChainGasCacheKind } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const indexesByName = async () => {
  const indexes = await Models.CrossChainGasCache.collection.indexes()
  return Object.fromEntries(indexes.map((index: any) => [index.name, index]))
}

describe('migration: sync cross chain gas cache indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    await Models.CrossChainGasCache.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('builds the ttl index so old documents are deleted', async () => {
    await syncCrossChainGasCacheIndexesMigration.start()

    const indexes = await indexesByName()
    const ttl = Object.values(indexes).find((index: any) => index.key?.purgeAt === 1) as any

    expect(ttl, 'no index on purgeAt').to.exist
    // Without this the collection keeps every measurement and every hourly counter forever.
    expect(ttl.expireAfterSeconds).to.equal(0)
  })

  it('builds the unique index on id, which the budget counter depends on', async () => {
    await syncCrossChainGasCacheIndexesMigration.start()

    const indexes = await indexesByName()
    const idIndex = Object.values(indexes).find((index: any) => index.key?.id === 1) as any

    expect(idIndex, 'no index on id').to.exist
    expect(idIndex.unique).to.equal(true)
  })

  it('keeps the documents that are already there', async () => {
    // Raw driver, so the seed does not have to satisfy the schema.
    await Models.CrossChainGasCache.collection.insertMany([
      {
        id: 'ethereum-mainnet|0xabc|8453|0xdead',
        kind: ICrossChainGasCacheKind.cache,
        result: { status: 'success', requiredGas: '228100', runAt: 1 },
        expiresAt: new Date(Date.now() + 60_000),
        purgeAt: new Date(Date.now() + 660_000),
      },
      {
        id: 'budget|global|2026-08-09T12',
        kind: ICrossChainGasCacheKind.budget,
        count: 4,
        purgeAt: new Date(Date.now() + 7_200_000),
      },
    ])

    await syncCrossChainGasCacheIndexesMigration.start()

    expect(await Models.CrossChainGasCache.countDocuments({})).to.equal(2)
    const budget = await Models.CrossChainGasCache.findOne({ id: 'budget|global|2026-08-09T12' })
    expect(budget?.count).to.equal(4)
  })

  it('can be run again without failing', async () => {
    await syncCrossChainGasCacheIndexesMigration.start()
    await syncCrossChainGasCacheIndexesMigration.start()

    const indexes = await indexesByName()
    expect(Object.values(indexes).some((index: any) => index.key?.purgeAt === 1)).to.be.true
  })

  it('completes cleanly when the collection is empty', async () => {
    await syncCrossChainGasCacheIndexesMigration.start()

    expect(await Models.CrossChainGasCache.countDocuments({})).to.equal(0)
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await expect(syncCrossChainGasCacheIndexesMigration.stop()).to.not.be.rejected
    })
  })
})
