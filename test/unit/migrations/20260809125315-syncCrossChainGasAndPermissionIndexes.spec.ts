import { Models } from '@dbModels'
import syncCrossChainGasAndPermissionIndexesMigration from '@src/migrations/20260809125315-syncCrossChainGasAndPermissionIndexes'
import { ICrossChainGasCacheKind } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const indexesByName = async () => {
  const indexes = await Models.CrossChainGasCache.collection.indexes()
  return Object.fromEntries(indexes.map((index: any) => [index.name, index]))
}

const daoPermissionIndexKeys = async () => {
  const indexes = await Models.DaoPermission.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

describe('migration: sync cross chain gas and permission indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    await Models.CrossChainGasCache.collection.dropIndexes().catch(() => undefined)
    await Models.DaoPermission.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('builds the ttl index so old documents are deleted', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    const indexes = await indexesByName()
    const ttl = Object.values(indexes).find((index: any) => index.key?.purgeAt === 1) as any

    expect(ttl, 'no index on purgeAt').to.exist
    // Without this the collection keeps every measurement and every hourly counter forever.
    expect(ttl.expireAfterSeconds).to.equal(0)
  })

  it('builds the unique index on id, which the budget counter depends on', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    const indexes = await indexesByName()
    const idIndex = Object.values(indexes).find((index: any) => index.key?.id === 1) as any

    expect(idIndex, 'no index on id').to.exist
    expect(idIndex.unique).to.equal(true)
  })

  it('builds the dao permission indexes that the dao lookups sort on', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    const keys = await daoPermissionIndexKeys()

    // The latest row for one permission holder.
    expect(keys).to.include(
      JSON.stringify({
        network: 1,
        daoAddress: 1,
        whoAddress: 1,
        permissionId: 1,
        blockNumber: -1,
        transactionIndex: -1,
        logIndex: -1,
      }),
    )
    // The dao wide permission list.
    expect(keys).to.include(
      JSON.stringify({ network: 1, daoAddress: 1, blockNumber: -1, transactionIndex: -1, logIndex: -1 }),
    )
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

    await syncCrossChainGasAndPermissionIndexesMigration.start()

    expect(await Models.CrossChainGasCache.countDocuments({})).to.equal(2)
    const budget = await Models.CrossChainGasCache.findOne({ id: 'budget|global|2026-08-09T12' })
    expect(budget?.count).to.equal(4)
  })

  it('can be run again without failing', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    const indexes = await indexesByName()
    expect(Object.values(indexes).some((index: any) => index.key?.purgeAt === 1)).to.be.true
  })

  it('completes cleanly when the collection is empty', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    expect(await Models.CrossChainGasCache.countDocuments({})).to.equal(0)
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await expect(syncCrossChainGasAndPermissionIndexesMigration.stop()).to.not.be.rejected
    })
  })
})
