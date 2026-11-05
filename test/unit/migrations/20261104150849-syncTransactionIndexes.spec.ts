import { Models } from '@dbModels'
import logger from '@logger'
import syncTransactionIndexesMigration from '@src/migrations/20261104150849-syncTransactionIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const workspaceFeedIndex = JSON.stringify({ daoAddress: 1, network: 1, blockTimestamp: -1, id: -1 })

const transactionIndexKeys = async () => {
  const indexes = await Models.Transaction.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

describe('migration: sync transaction indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.Transaction.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('builds the workspace feed index and keeps the pagination index', async () => {
    expect(await transactionIndexKeys()).to.not.include(workspaceFeedIndex)

    await syncTransactionIndexesMigration.start()

    expect(await transactionIndexKeys()).to.include.members([
      workspaceFeedIndex,
      JSON.stringify({ daoAddress: 1, network: 1, blockNumber: -1, id: -1 }),
    ])
  })

  it('runs twice without error', async () => {
    await syncTransactionIndexesMigration.start()
    await syncTransactionIndexesMigration.start()

    const matching = (await transactionIndexKeys()).filter(key => key === workspaceFeedIndex)
    expect(matching).to.have.length(1)
  })
})
