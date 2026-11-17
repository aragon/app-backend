import { Models } from '@dbModels'
import logger from '@logger'
import syncLockAndLockToVoteMemberIndexesMigration from '@src/migrations/20261117213933-syncLockAndLockToVoteMemberIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const lockIndexKeys = async () => {
  const indexes = await Models.Lock.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

const lockToVoteMemberIndexKeys = async () => {
  const indexes = await Models.LockToVoteMember.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

describe('migration: sync lock and lock-to-vote member indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.Lock.collection.dropIndexes().catch(() => undefined)
    await Models.LockToVoteMember.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('builds the wallet-first indexes and keeps the old ones', async () => {
    await syncLockAndLockToVoteMemberIndexesMigration.start()

    expect(await lockIndexKeys()).to.include.members([
      JSON.stringify({ delegateReceiverAddress: 1, network: 1 }),
      JSON.stringify({ network: 1, tokenAddress: 1, delegateReceiverAddress: 1 }),
    ])
    expect(await lockToVoteMemberIndexKeys()).to.include.members([
      JSON.stringify({ memberAddress: 1, network: 1 }),
      JSON.stringify({ network: 1, lockManagerAddress: 1, memberAddress: 1 }),
    ])
  })

  it('runs twice without error', async () => {
    await syncLockAndLockToVoteMemberIndexesMigration.start()
    await syncLockAndLockToVoteMemberIndexesMigration.start()

    expect(await lockIndexKeys()).to.include(JSON.stringify({ delegateReceiverAddress: 1, network: 1 }))
    expect(await lockToVoteMemberIndexKeys()).to.include(JSON.stringify({ memberAddress: 1, network: 1 }))
  })
})
