import { Models } from '@dbModels'
import logger from '@logger'
import syncTokenMemberIndexesMigration from '@src/migrations/20260929055041-syncTokenMemberIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const tokenMemberIndexKeys = async () => {
  const indexes = await Models.TokenMember.collection.indexes()
  return indexes.map((index: any) => JSON.stringify(index.key))
}

describe('migration: sync token member indexes', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.TokenMember.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('builds the voting power index and keeps the old member index', async () => {
    await syncTokenMemberIndexesMigration.start()

    const keys = await tokenMemberIndexKeys()

    expect(keys).to.include.members([
      JSON.stringify({ network: 1, tokenAddress: 1, votingPower: 1, memberAddress: 1 }),
      JSON.stringify({ network: 1, tokenAddress: 1, memberAddress: 1 }),
    ])
  })

  it('runs twice without error', async () => {
    await syncTokenMemberIndexesMigration.start()
    await syncTokenMemberIndexesMigration.start()

    const keys = await tokenMemberIndexKeys()

    expect(keys).to.include(JSON.stringify({ network: 1, tokenAddress: 1, votingPower: 1, memberAddress: 1 }))
  })
})
