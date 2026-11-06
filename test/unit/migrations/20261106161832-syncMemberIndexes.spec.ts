import { Models } from '@dbModels'
import logger from '@logger'
import syncMemberIndexesMigration from '@src/migrations/20261106161832-syncMemberIndexes'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: sync member indexes', () => {
  let sandbox: SinonSandbox
  const members = [
    {
      id: '0x0000000000000000000000000000000000000001',
      address: '0x0000000000000000000000000000000000000001',
      ens: 'one.eth',
    },
    {
      id: '0x0000000000000000000000000000000000000002',
      address: '0x0000000000000000000000000000000000000002',
      ens: 'two.eth',
    },
    {
      id: '0x0000000000000000000000000000000000000003',
      address: '0x0000000000000000000000000000000000000003',
      ens: 'three.eth',
    },
  ]

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await Models.Member.collection.dropIndexes().catch(() => undefined)
    await Models.Member.collection.insertMany(members)
    await Models.Member.collection.createIndex({ address: 1, ens: 1 })
    await Models.Member.collection.createIndex({ ens: 1 })
  })

  afterEach(() => sandbox?.restore())

  it('builds address_1 before old indexes are dropped and keeps saved names', async () => {
    await syncMemberIndexesMigration.start()
    await syncMemberIndexesMigration.start()

    const indexes = await Models.Member.collection.indexes()
    expect(indexes.map(index => index.name)).to.include.members(['address_1', 'address_1_ens_1', 'ens_1'])
    expect(indexes.find(index => index.name === 'address_1')?.key).to.deep.equal({ address: 1 })
    expect((await Models.Member.collection.find({}).sort({ id: 1 }).toArray()).map(member => member.ens)).to.deep.equal(
      ['one.eth', 'two.eth', 'three.eth'],
    )

    await Models.Member.syncIndexes()

    expect((await Models.Member.collection.indexes()).map(index => index.name).sort()).to.deep.equal([
      '_id_',
      'address_1',
      'id_1',
    ])
    expect((await Models.Member.collection.find({}).sort({ id: 1 }).toArray()).map(member => member.ens)).to.deep.equal(
      ['one.eth', 'two.eth', 'three.eth'],
    )
  })
})
