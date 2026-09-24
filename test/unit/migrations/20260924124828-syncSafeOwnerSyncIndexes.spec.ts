import { Models } from '@dbModels'
import logger from '@logger'
import syncSafeOwnerSyncIndexesMigration from '@src/migrations/20260924124828-syncSafeOwnerSyncIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('migration: sync SafeOwnerSync indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.SafeOwnerSync.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(() => sandbox.restore())

  it('builds the unique checkpoint index the owner sync serialises on', async () => {
    await syncSafeOwnerSyncIndexesMigration.start()

    const indexes = await Models.SafeOwnerSync.collection.indexes()
    const checkpoint = indexes.find(
      index => JSON.stringify(index.key) === JSON.stringify({ network: 1, safeAddress: 1 }),
    )

    expect(checkpoint?.unique).to.equal(true)
  })
})
