import { Models } from '@dbModels'
import logger from '@logger'
import syncSafeAccountIndexesMigration from '@src/migrations/20261016155850-syncSafeAccountIndexes'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const indexName = 'network_1_tracked_1'

describe('migration: sync SafeAccount indexes', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    if ((await Models.SafeAccount.collection.indexes()).some(index => index.name === indexName)) {
      await Models.SafeAccount.collection.dropIndex(indexName)
    }
    await Models.SafeAccount.track(NETWORK, SAFE)
  })

  afterEach(() => sandbox.restore())

  it('builds the tracked Safe index', async () => {
    const before = await Models.SafeAccount.collection.findOne({ safeAddress: SAFE })
    expect((await Models.SafeAccount.collection.indexes()).some(index => index.name === indexName)).to.be.false

    await syncSafeAccountIndexesMigration.start()

    const built = (await Models.SafeAccount.collection.indexes()).find(index => index.name === indexName)
    expect(built?.key).to.deep.equal({ network: 1, tracked: 1 })
    expect(await Models.SafeAccount.collection.findOne({ safeAddress: SAFE })).to.deep.equal(before)
  })

  it('can run twice without adding another index', async () => {
    await syncSafeAccountIndexesMigration.start()
    await syncSafeAccountIndexesMigration.start()

    const matching = (await Models.SafeAccount.collection.indexes()).filter(index => index.name === indexName)
    expect(matching).to.have.length(1)
  })
})
