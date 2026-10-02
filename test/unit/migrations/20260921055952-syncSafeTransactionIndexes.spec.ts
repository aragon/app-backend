import { Models } from '@dbModels'
import logger from '@logger'
import syncSafeTransactionIndexesMigration from '@src/migrations/20260921055952-syncSafeTransactionIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const uniqueKey = JSON.stringify({ network: 1, safeAddress: 1, safeTxHash: 1 })
const accountKey = JSON.stringify({ id: 1 })
const indexes = async () => Models.SafeTransaction.collection.indexes()
const accountIndexes = async () => Models.SafeAccount.collection.indexes()

describe('migration: sync safe transaction indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.SafeTransaction.collection.dropIndexes().catch(() => undefined)
    await Models.SafeAccount.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(() => sandbox?.restore())

  it('builds the unique index that stops a queue page writing a row twice', async () => {
    await syncSafeTransactionIndexesMigration.start()

    const built = (await indexes()).find((index: any) => JSON.stringify(index.key) === uniqueKey) as any
    expect(built, 'no unique network+safeAddress+safeTxHash index').to.exist
    expect(built.unique).to.equal(true)
  })

  it('builds the unique SafeAccount id index', async () => {
    await syncSafeTransactionIndexesMigration.start()

    const built = (await accountIndexes()).find((index: any) => JSON.stringify(index.key) === accountKey) as any
    expect(built, 'no unique id index on SafeAccount').to.exist
    expect(built.unique).to.equal(true)
  })

  it('can be run again and leaves both indexes once', async () => {
    await syncSafeTransactionIndexesMigration.start()
    await syncSafeTransactionIndexesMigration.start()

    const matching = (await indexes()).filter((index: any) => JSON.stringify(index.key) === uniqueKey)
    const accountMatching = (await accountIndexes()).filter((index: any) => JSON.stringify(index.key) === accountKey)
    expect(matching).to.have.length(1)
    expect(accountMatching).to.have.length(1)
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await expect(syncSafeTransactionIndexesMigration.stop()).to.not.be.rejected
    })
  })
})
