import { Models } from '@dbModels'
import logger from '@logger'
import syncCrossChainGasAndPermissionIndexesMigration from '@src/migrations/20260809125315-syncCrossChainGasAndPermissionIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const daoPermissionIndexKeys = async () => {
  const indexes = await Models.DaoPermission.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

describe('migration: sync cross chain gas and permission indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.DaoPermission.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
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

  it('can be run again without failing', async () => {
    await syncCrossChainGasAndPermissionIndexesMigration.start()
    await syncCrossChainGasAndPermissionIndexesMigration.start()

    const keys = await daoPermissionIndexKeys()
    expect(keys).to.include(
      JSON.stringify({ network: 1, daoAddress: 1, blockNumber: -1, transactionIndex: -1, logIndex: -1 }),
    )
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await expect(syncCrossChainGasAndPermissionIndexesMigration.stop()).to.not.be.rejected
    })
  })
})
