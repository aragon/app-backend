import { Models } from '@dbModels'
import syncAllIndexesMigration from '@src/migrations/20260713161032-syncAllIndexes'
import { expect } from 'chai'

describe('migration: syncAllIndexes', () => {
  const paginationIndex = 'daoAddress_1_network_1_blockNumber_-1_id_-1'
  const sidePaginationIndex = 'daoAddress_1_network_1_side_1_blockNumber_-1_id_-1'

  const indexNames = async () => {
    const indexes = await Models.Transaction.collection.indexes()
    return indexes.map((index: { name?: string }) => index.name)
  }

  it('creates the new Transaction pagination indexes when missing', async () => {
    await Models.Transaction.collection.dropIndexes()
    expect(await indexNames()).to.not.include(paginationIndex)

    await syncAllIndexesMigration.start()

    const names = await indexNames()
    expect(names).to.include(paginationIndex)
    expect(names).to.include(sidePaginationIndex)
  })

  it('drops indexes that are no longer declared on the schema', async () => {
    await Models.Transaction.collection.createIndex({ stray: 1 })
    expect(await indexNames()).to.include('stray_1')

    await syncAllIndexesMigration.start()

    expect(await indexNames()).to.not.include('stray_1')
  })

  it('is idempotent: re-running keeps the declared indexes in place', async () => {
    await syncAllIndexesMigration.start()
    await syncAllIndexesMigration.start()

    const names = await indexNames()
    expect(names).to.include(paginationIndex)
    expect(names).to.include(sidePaginationIndex)
  })
})
