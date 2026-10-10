import { Models } from '@dbModels'
import logger from '@logger'
import uniqueSafePluginAssociationsMigration from '@src/migrations/20261002000000-uniqueSafePluginAssociations'
import { PluginList } from '@test/mock/fakePlugins'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const safePlugin = {
  ...PluginList[0],
  id: 'safe-process',
  network: NETWORK,
  address: SAFE,
  interfaceType: IPluginInterfaceType.safe,
}
const safeMember = { id: 'safe-owner', network: NETWORK, safeAddress: SAFE, memberAddress: OWNER }

describe('migration: unique Safe plugin associations', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    // MockDB builds these on connect; remove them so start has to build them.
    await Models.Plugin.collection.dropIndex('plugin_safe_association_unique')
    await Models.SafeMember.collection.dropIndex('safe_member_unique')
  })

  afterEach(async () => {
    try {
      await Models.Plugin.deleteMany({})
      await Models.SafeMember.deleteMany({})
      await Models.SafeMember.syncIndexes()
      await Models.Plugin.syncIndexes()
    } finally {
      sandbox.restore()
    }
  })

  it('builds both unique indexes on clean collections', async () => {
    await Models.Plugin.create(safePlugin)
    await Models.SafeMember.create(safeMember)

    await uniqueSafePluginAssociationsMigration.start()

    const pluginIndexes = await Models.Plugin.collection.indexes()
    const memberIndexes = await Models.SafeMember.collection.indexes()
    const pluginIndex = pluginIndexes.find(index => index.name === 'plugin_safe_association_unique')!
    const memberIndex = memberIndexes.find(index => index.name === 'safe_member_unique')!
    expect(pluginIndex.key).to.deep.equal({ network: 1, daoAddress: 1, address: 1 })
    expect(pluginIndex.unique).to.be.true
    expect(pluginIndex.partialFilterExpression).to.deep.equal({ interfaceType: 'safe' })
    expect(pluginIndex.collation).to.include({ locale: 'en', strength: 2 })
    expect(memberIndex.key).to.deep.equal({ network: 1, safeAddress: 1, memberAddress: 1 })
    expect(memberIndex.unique).to.be.true
    expect(memberIndex.collation).to.include({ locale: 'en', strength: 2 })
    expect(await Models.Plugin.countDocuments({})).to.equal(1)
    expect(await Models.SafeMember.countDocuments({})).to.equal(1)
  })

  it('keeps rows and indexes unchanged on a second run', async () => {
    await Models.Plugin.create(safePlugin)
    await Models.SafeMember.create(safeMember)
    await uniqueSafePluginAssociationsMigration.start()
    const plugins = await Models.Plugin.find({}).lean()
    const members = await Models.SafeMember.find({}).lean()
    const pluginIndexes = await Models.Plugin.collection.indexes()
    const memberIndexes = await Models.SafeMember.collection.indexes()

    await uniqueSafePluginAssociationsMigration.start()

    expect(await Models.Plugin.find({}).lean()).to.deep.equal(plugins)
    expect(await Models.SafeMember.find({}).lean()).to.deep.equal(members)
    expect(await Models.Plugin.collection.indexes()).to.deep.equal(pluginIndexes)
    expect(await Models.SafeMember.collection.indexes()).to.deep.equal(memberIndexes)
  })

  it('fails when two Safe process rows differ only in address casing', async () => {
    await Models.Plugin.create(safePlugin)
    await Models.Plugin.create({ ...safePlugin, id: 'safe-case-variant', address: SAFE.toLowerCase() })

    const error = await uniqueSafePluginAssociationsMigration.start().catch(error => error)

    expect(error).to.have.property('code', 11000)
    expect(error.message).to.include('plugin_safe_association_unique')
    expect(await Models.Plugin.countDocuments({})).to.equal(2)
  })

  it('fails when two Safe owner rows differ only in owner casing', async () => {
    await Models.SafeMember.create(safeMember)
    await Models.SafeMember.create({ ...safeMember, id: 'owner-case-variant', memberAddress: OWNER.toLowerCase() })

    const error = await uniqueSafePluginAssociationsMigration.start().catch(error => error)

    expect(error).to.have.property('code', 11000)
    expect(error.message).to.include('safe_member_unique')
    expect(await Models.SafeMember.countDocuments({})).to.equal(2)
  })
})
