import { Models } from '@dbModels'
import logger from '@logger'
import uniqueSafeExecutionMigration from '@src/migrations/20261105171522-uniqueSafeExecution'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { ITransactionType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('migration: unique Safe execution', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    await Models.Transaction.collection.dropIndex('safe_execution_unique').catch(() => undefined)
  })

  afterEach(async () => {
    try {
      await Models.Transaction.deleteMany({})
      await Models.Transaction.collection.createIndex(
        { network: 1, daoAddress: 1, safeTxHash: 1 },
        {
          unique: true,
          name: 'safe_execution_unique',
          partialFilterExpression: { type: 'execution', safeTxHash: { $type: 'string' } },
        },
      )
    } finally {
      sandbox.restore()
    }
  })

  it('builds a unique key only for Safe execution rows', async () => {
    await uniqueSafeExecutionMigration.start()
    const index = (await Models.Transaction.collection.indexes()).find(
      (item: any) => item.name === 'safe_execution_unique',
    )
    expect(index?.key).to.deep.equal({ network: 1, daoAddress: 1, safeTxHash: 1 })
    expect(index?.unique).to.be.true
    expect(index?.partialFilterExpression).to.deep.equal({ type: 'execution', safeTxHash: { $type: 'string' } })

    const execution = { ...FakeTransaction, type: ITransactionType.execution, safeTxHash: '0xsame' }
    await Models.Transaction.create({ ...execution, id: 'first' })
    const duplicate = await Models.Transaction.create({ ...execution, id: 'second' }).catch((error: any) => error)
    expect(duplicate.code).to.equal(11000)
    await Models.Transaction.create({ ...FakeTransaction, id: 'third', safeTxHash: '0xsame' })
    expect(await Models.Transaction.countDocuments()).to.equal(2)
  })
})
