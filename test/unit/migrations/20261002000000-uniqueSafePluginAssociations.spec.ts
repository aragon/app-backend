import { Models } from '@dbModels'
import logger from '@logger'
import uniqueSafePluginAssociationsMigration from '@src/migrations/20261002000000-uniqueSafePluginAssociations'
import { SAFE_PLUGIN_ASSOCIATION_INDEX_NAME } from '@models/schema/plugin'
import { SAFE_MEMBER_INDEX_NAME } from '@models/schema/safeMember'
import { IPluginInterfaceType, IPluginStatus, IPluginSlug, NetworksEnum } from '@types'
import { getAddress } from 'ethers'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const SAFE_INDEX_NAME = SAFE_PLUGIN_ASSOCIATION_INDEX_NAME
const NETWORK = NetworksEnum.ethereumSepolia
const DAO_LOWER = '0x1234567890abcdef1234567890abcdef12345678'
const DAO_UPPER = `0x${DAO_LOWER.slice(2).toUpperCase()}`
const ADDRESS_LOWER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const ADDRESS_UPPER = `0x${ADDRESS_LOWER.slice(2).toUpperCase()}`
const CONDITION_LOWER = '0x3333333333333333333333333333333333333333'
const OTHER_ADDRESS_LOWER = '0x1111111111111111111111111111111111111111'
const CANONICAL_DAO = getAddress(DAO_LOWER)
const CANONICAL_ADDRESS = getAddress(ADDRESS_LOWER)
const CANONICAL_OTHER_ADDRESS = getAddress(OTHER_ADDRESS_LOWER)
const MEMBER_LOWER = '0x2222222222222222222222222222222222222222'
const MEMBER_UPPER = `0x${MEMBER_LOWER.slice(2).toUpperCase()}`
const CANONICAL_MEMBER = getAddress(MEMBER_LOWER)

type Row = Record<string, unknown>

const pluginRow = (
  id: string,
  address: string,
  daoAddress: string,
  updatedAt: string,
  blockNumber: number,
  overrides: Row = {},
): Row => ({
  id,
  network: NETWORK,
  address,
  daoAddress,
  interfaceType: IPluginInterfaceType.safe,
  status: IPluginStatus.installed,
  transactionHash: `0x${id}`,
  blockNumber,
  updatedAt,
  ...overrides,
})

const slugRow = (id: string, pluginAddress: string, daoAddress: string, slug: string, updatedAt: string): Row => ({
  _id: id,
  network: NETWORK,
  pluginAddress,
  daoAddress,
  slug,
  updatedAt,
})

const seedPlugins = async (rows: Row[]) => {
  await Models.Plugin.collection.insertMany(rows)
}

const seedSlugs = async (rows: Row[]) => {
  await Models.PluginSlug.collection.insertMany(rows)
}

const seedSafeMembers = async (rows: Row[]) => {
  await Models.SafeMember.collection.insertMany(rows)
}

describe('migration: unique Safe Plugin associations', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    await Models.Plugin.collection.dropIndexes().catch(() => undefined)
    await Models.PluginSlug.collection.dropIndexes().catch(() => undefined)
    await Models.SafeMember.collection.dropIndexes().catch(() => undefined)
  })

  afterEach(async () => {
    sandbox?.restore()
    await Models.Plugin.syncIndexes()
    await Models.PluginSlug.syncIndexes()
    await Models.SafeMember.syncIndexes()
  })

  it('canonicalizes the newest association and its dependent slug, cursor, and owner keys', async () => {
    await seedPlugins([
      pluginRow('old', ADDRESS_LOWER, DAO_LOWER, '2026-01-01T00:00:00.000Z', 1000),
      pluginRow('same-date-lower-block', ADDRESS_UPPER, DAO_LOWER, '2026-01-02T00:00:00.000Z', 20),
      pluginRow('winner', ADDRESS_LOWER, DAO_UPPER, '2026-01-02T00:00:00.000Z', 30),
    ])
    await seedSlugs([
      slugRow('old-slug', ADDRESS_LOWER, DAO_LOWER, 'safe_old', '2026-01-01T00:00:00.000Z'),
      slugRow('lower-block-slug', ADDRESS_UPPER, DAO_LOWER, 'safe_loser', '2026-01-02T00:00:00.000Z'),
      slugRow('winner-slug', ADDRESS_UPPER, DAO_UPPER, IPluginSlug.safe, '2026-01-03T00:00:00.000Z'),
    ])
    const lowerService = `permission-${NETWORK}-${ADDRESS_LOWER}-${DAO_LOWER}-${CONDITION_LOWER}`
    const upperService = `permission-${NETWORK}-${ADDRESS_UPPER}-${DAO_UPPER}-${CONDITION_LOWER}`
    await Models.ConfigIndexer.collection.insertMany([
      {
        _id: 'cursor-lower',
        id: `${NETWORK}-${lowerService}`,
        network: NETWORK,
        service: lowerService,
        lastSync: 100,
        end: false,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        _id: 'cursor-upper',
        id: `${NETWORK}-${upperService}`,
        network: NETWORK,
        service: upperService,
        lastSync: 200,
        end: true,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ])
    await seedSafeMembers([
      {
        _id: 'member-lower',
        id: `${NETWORK}-${ADDRESS_LOWER}-${MEMBER_LOWER}`,
        network: NETWORK,
        safeAddress: ADDRESS_LOWER,
        memberAddress: MEMBER_LOWER,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        _id: 'member-upper',
        id: `${NETWORK}-${ADDRESS_UPPER}-${MEMBER_UPPER}`,
        network: NETWORK,
        safeAddress: ADDRESS_UPPER,
        memberAddress: MEMBER_UPPER,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ])

    await uniqueSafePluginAssociationsMigration.start()

    const plugins = await Models.Plugin.find({ interfaceType: IPluginInterfaceType.safe }).lean()
    expect(plugins).to.have.lengthOf(1)
    expect(plugins[0]).to.include({
      id: `${NETWORK}-0xwinner-${CANONICAL_ADDRESS}-${CANONICAL_DAO}`,
      network: NETWORK,
      address: CANONICAL_ADDRESS,
      daoAddress: CANONICAL_DAO,
    })

    const slugs = await Models.PluginSlug.find({ network: NETWORK }).lean()
    expect(slugs).to.have.lengthOf(1)
    expect(slugs[0]).to.include({
      network: NETWORK,
      daoAddress: CANONICAL_DAO,
      pluginAddress: CANONICAL_ADDRESS,
      slug: IPluginSlug.safe,
    })

    const permissionService = `permission-${NETWORK}-${CANONICAL_ADDRESS}-${CANONICAL_DAO}-${CONDITION_LOWER}`
    const cursors = await Models.ConfigIndexer.find({ network: NETWORK }).lean()
    expect(cursors).to.have.lengthOf(1)
    expect(cursors[0]).to.include({
      id: `${NETWORK}-${permissionService}`,
      service: permissionService,
      lastSync: 200,
      end: true,
    })

    const members = await Models.SafeMember.find({ network: NETWORK }).lean()
    expect(members).to.have.lengthOf(1)
    expect(members[0]).to.include({
      id: `${NETWORK}-${CANONICAL_ADDRESS}-${CANONICAL_MEMBER}`,
      safeAddress: CANONICAL_ADDRESS,
      memberAddress: CANONICAL_MEMBER,
    })

    const indexes = await Models.Plugin.collection.indexes()
    const safeIndex = indexes.find((index: { name?: string }) => index.name === SAFE_INDEX_NAME)
    expect(safeIndex).to.exist
    expect(safeIndex.key).to.deep.equal({ network: 1, daoAddress: 1, address: 1 })
    expect(safeIndex.unique).to.equal(true)
    expect(safeIndex.partialFilterExpression).to.deep.equal({ interfaceType: IPluginInterfaceType.safe })
    expect(safeIndex.collation).to.include({ locale: 'en', strength: 2 })
    const memberIndexes = await Models.SafeMember.collection.indexes()
    const memberIndex = memberIndexes.find((index: { name?: string }) => index.name === SAFE_MEMBER_INDEX_NAME)
    expect(memberIndex).to.exist
    expect(memberIndex.key).to.deep.equal({ network: 1, safeAddress: 1, memberAddress: 1 })
    expect(memberIndex.unique).to.equal(true)
    expect(memberIndex.collation).to.include({ locale: 'en', strength: 2 })

    const caseVariantError = await Models.SafeMember.collection
      .insertOne({
        _id: 'member-case-variant',
        id: `${NETWORK}-${ADDRESS_LOWER}-${MEMBER_LOWER}`,
        network: NETWORK,
        safeAddress: ADDRESS_LOWER,
        memberAddress: MEMBER_LOWER,
      })
      .catch(error => error)
    expect(caseVariantError.code).to.equal(11000)
    expect(caseVariantError.message).to.include('E11000')
  })

  it('stages case-variant slug keys before canonicalizing two Safes in one DAO', async () => {
    await seedPlugins([
      pluginRow('first-safe', OTHER_ADDRESS_LOWER, DAO_LOWER, '2026-01-01T00:00:00.000Z', 1),
      pluginRow('second-safe', ADDRESS_LOWER, CANONICAL_DAO, '2026-01-02T00:00:00.000Z', 2),
    ])
    await seedSlugs([
      slugRow('first-safe-slug', OTHER_ADDRESS_LOWER, DAO_LOWER, IPluginSlug.safe, '2026-01-01T00:00:00.000Z'),
      slugRow('second-safe-slug', ADDRESS_LOWER, CANONICAL_DAO, IPluginSlug.safe, '2026-01-02T00:00:00.000Z'),
    ])

    await uniqueSafePluginAssociationsMigration.start()

    const slugs = await Models.PluginSlug.find({ network: NETWORK }).lean()
    expect(slugs).to.have.lengthOf(2)
    expect(slugs.map(slug => slug.daoAddress)).to.deep.equal([CANONICAL_DAO, CANONICAL_DAO])
    expect(slugs.map(slug => slug.pluginAddress)).to.have.members([CANONICAL_OTHER_ADDRESS, CANONICAL_ADDRESS])
    expect(slugs.map(slug => slug.slug)).to.have.members([IPluginSlug.safe, `${IPluginSlug.safe}_1`])
  })

  it('is idempotent when rerun after cleanup and index creation', async () => {
    await seedPlugins([pluginRow('only', ADDRESS_LOWER, DAO_LOWER, '2026-01-02T00:00:00.000Z', 1)])
    await seedSlugs([slugRow('only-slug', ADDRESS_LOWER, DAO_LOWER, IPluginSlug.safe, '2026-01-02T00:00:00.000Z')])

    await uniqueSafePluginAssociationsMigration.start()
    await uniqueSafePluginAssociationsMigration.start()

    expect(await Models.Plugin.countDocuments({ interfaceType: IPluginInterfaceType.safe })).to.equal(1)
    const slugs = await Models.PluginSlug.find({ network: NETWORK }).lean()
    expect(slugs).to.have.lengthOf(1)
    expect(slugs[0]).to.include({
      daoAddress: CANONICAL_DAO,
      pluginAddress: CANONICAL_ADDRESS,
      slug: IPluginSlug.safe,
    })
    const indexes = await Models.Plugin.collection.indexes()
    expect(indexes.filter((index: { name?: string }) => index.name === SAFE_INDEX_NAME)).to.have.lengthOf(1)
  })

  it('allows duplicate non-Safe historical rows', async () => {
    await seedPlugins([
      pluginRow('non-safe-lower', ADDRESS_LOWER, DAO_LOWER, '2026-01-01T00:00:00.000Z', 1, {
        interfaceType: IPluginInterfaceType.tokenVoting,
      }),
      pluginRow('non-safe-upper', ADDRESS_UPPER, DAO_UPPER, '2026-01-02T00:00:00.000Z', 2, {
        interfaceType: IPluginInterfaceType.tokenVoting,
      }),
    ])

    await uniqueSafePluginAssociationsMigration.start()
    await seedPlugins([
      pluginRow('non-safe-third', ADDRESS_LOWER, DAO_LOWER, '2026-01-03T00:00:00.000Z', 3, {
        interfaceType: IPluginInterfaceType.tokenVoting,
      }),
    ])

    expect(await Models.Plugin.countDocuments({ interfaceType: IPluginInterfaceType.tokenVoting })).to.equal(3)
  })

  it('fails invalid Safe addresses before building the enforcing index', async () => {
    await seedPlugins([pluginRow('invalid', 'not-an-address', DAO_LOWER, '2026-01-02T00:00:00.000Z', 1)])

    const error = await uniqueSafePluginAssociationsMigration.start().then(
      () => undefined,
      (migrationError: unknown) => migrationError,
    )

    expect(error).to.be.instanceOf(Error)
    const indexes = await Models.Plugin.collection.indexes()
    expect(indexes.some((index: { name?: string }) => index.name === SAFE_INDEX_NAME)).to.equal(false)
  })

  it('fails invalid SafeMember addresses before mutating valid Safe associations', async () => {
    await seedPlugins([pluginRow('valid', ADDRESS_LOWER, DAO_LOWER, '2026-01-02T00:00:00.000Z', 1)])
    await seedSafeMembers([
      {
        id: `${NETWORK}-${ADDRESS_LOWER}-invalid`,
        network: NETWORK,
        safeAddress: ADDRESS_LOWER,
        memberAddress: 'not-an-address',
      },
    ])

    const error = await uniqueSafePluginAssociationsMigration.start().then(
      () => undefined,
      (migrationError: unknown) => migrationError,
    )

    expect(error).to.be.instanceOf(Error)
    expect((error as Error).message).to.include('invalid SafeMember.memberAddress')
    const plugin = await Models.Plugin.collection.findOne({ id: 'valid' })
    expect(plugin).to.include({ address: ADDRESS_LOWER, daoAddress: DAO_LOWER })
  })

  it('retries cleanup once when an old writer causes E11000 during index creation', async () => {
    await seedPlugins([
      pluginRow('race-old', ADDRESS_LOWER, DAO_LOWER, '2026-01-01T00:00:00.000Z', 1),
      pluginRow('race-new', ADDRESS_UPPER, DAO_UPPER, '2026-01-02T00:00:00.000Z', 2),
    ])

    const syncIndexes = sandbox.stub(Models.Plugin, 'syncIndexes')
    syncIndexes.onFirstCall().callsFake(async () => {
      await seedPlugins([
        pluginRow('race-written-during-build', ADDRESS_LOWER, DAO_LOWER, '2026-01-03T00:00:00.000Z', 3),
      ])
      throw Object.assign(new Error('E11000 duplicate key error collection'), { code: 11000 })
    })
    syncIndexes.onSecondCall().callsFake(async () => {
      syncIndexes.restore()
      return await Models.Plugin.syncIndexes()
    })

    await uniqueSafePluginAssociationsMigration.start()

    expect(await Models.Plugin.countDocuments({ interfaceType: IPluginInterfaceType.safe })).to.equal(1)
    expect(
      (await Models.Plugin.collection.indexes()).some((index: { name?: string }) => index.name === SAFE_INDEX_NAME),
    ).to.equal(true)
  })
})
