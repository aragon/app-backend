import { Models } from '@dbModels'
import dedupeSelectorPermissionsMigration from '@src/migrations/20260819141224-dedupeSelectorPermissions'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

const DAO_ADDRESS = '0x32d627b081e0f4fF28474820f20128049DA55360'
const PLUGIN_ADDRESS = '0xC3611e534d37eC6cAE251CECc06b25CCfA088e7c'
const CONDITION_ADDRESS = '0xDC6f14D31A1f01784F0954eb90b675a4332D80A6'
const TARGET_ADDRESS = '0x0c4ad337B1b4aD6D7130185fb9ebDD6c58a0f95F'
const TRANSACTION_HASH = '0xb07380e446629624458fb3a6a9ae781352b0f2b764056b1e7d7839bef5a4f89e'

const selectorPermission = (overrides: Record<string, any> = {}) => {
  const logIndex = overrides.logIndex ?? 397
  return {
    id: `${NetworksEnum.baseMainnet}-${TRANSACTION_HASH}-49-${logIndex}-${CONDITION_ADDRESS}`,
    transactionHash: TRANSACTION_HASH,
    transactionIndex: 49,
    logIndex,
    blockNumber: 34567890,
    blockTimestamp: 1755000000,
    network: NetworksEnum.baseMainnet,
    chainId: 8453,
    pluginAddress: PLUGIN_ADDRESS,
    daoAddress: DAO_ADDRESS,
    conditionAddress: CONDITION_ADDRESS,
    selector: '0x3628731c',
    target: TARGET_ADDRESS,
    isAllowed: true,
    ...overrides,
  }
}

// Raw driver: the whole point is to seed rows that the unique index would now reject.
const seed = async (rows: Record<string, any>[]) => {
  await Models.SelectorPermission.collection.insertMany(rows as any)
}

describe('migration: dedupe selector permissions', () => {
  beforeEach(async () => {
    await Models.SelectorPermission.collection.dropIndexes().catch(() => undefined)
  })

  it('keeps one row per log when two workers wrote the same one', async () => {
    await seed([selectorPermission(), selectorPermission()])

    await dedupeSelectorPermissionsMigration.start()

    const rows = await Models.SelectorPermission.find({ daoAddress: DAO_ADDRESS })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].selector).to.equal('0x3628731c')
  })

  it('keeps the revoked copy, so a disallowed selector does not come back as allowed', async () => {
    await seed([
      selectorPermission(),
      selectorPermission({
        isAllowed: false,
        disallowed: {
          status: true,
          transactionHash: TRANSACTION_HASH,
          blockNumber: 34567999,
          blockTimestamp: 1755009999,
        },
      }),
    ])

    await dedupeSelectorPermissionsMigration.start()

    const rows = await Models.SelectorPermission.find({ daoAddress: DAO_ADDRESS })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].isAllowed).to.equal(false)
    expect(rows[0].disallowed.status).to.equal(true)
  })

  it('leaves the other logs alone', async () => {
    await seed([
      selectorPermission(),
      selectorPermission(),
      selectorPermission({ logIndex: 398, selector: '0xa84eb999' }),
      selectorPermission({ logIndex: 399, selector: '0x303f4336' }),
    ])

    await dedupeSelectorPermissionsMigration.start()

    const rows = await Models.SelectorPermission.find({ daoAddress: DAO_ADDRESS })
    expect(rows).to.have.lengthOf(3)
    expect(rows.map(row => row.selector).sort()).to.deep.equal(['0x303f4336', '0x3628731c', '0xa84eb999'])
  })

  it('builds the unique index that stops the race from writing twice again', async () => {
    await seed([selectorPermission(), selectorPermission()])

    await dedupeSelectorPermissionsMigration.start()

    const indexes = await Models.SelectorPermission.collection.indexes()
    const idIndex = indexes.find((index: any) => index.key?.id === 1) as any

    expect(idIndex, 'no index on id').to.exist
    expect(idIndex.unique).to.equal(true)

    const secondWrite = await seed([selectorPermission()]).catch((error: any) => error)
    expect(secondWrite?.code).to.equal(11000)
  })

  it('completes cleanly when there is nothing to migrate', async () => {
    await seed([selectorPermission()])

    await dedupeSelectorPermissionsMigration.start()

    const rows = await Models.SelectorPermission.find({})
    expect(rows).to.have.lengthOf(1)
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await dedupeSelectorPermissionsMigration.stop()
    })
  })
})
