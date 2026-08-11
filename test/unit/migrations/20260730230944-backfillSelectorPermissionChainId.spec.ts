import { Models } from '@dbModels'
import backfillSelectorPermissionChainIdMigration from '@src/migrations/20260730230944-backfillSelectorPermissionChainId'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: backfillSelectorPermissionChainId', () => {
  const pluginAddress = '0xA000000000000000000000000000000000000001'
  const daoAddress = '0xD000000000000000000000000000000000000003'
  const conditionAddress = '0xC000000000000000000000000000000000000002'
  const target = '0xB000000000000000000000000000000000000004'

  let counter = 0
  const uid = (prefix: string) => `${prefix}-${++counter}`

  const seedPermission = async (network: NetworksEnum, extra: Record<string, unknown> = {}) => {
    const id = uid('selector-permission')
    await Models.SelectorPermission.collection.insertOne({
      id,
      transactionHash: '0xtx',
      transactionIndex: 0,
      logIndex: counter,
      blockNumber: 1000,
      network,
      pluginAddress,
      daoAddress,
      conditionAddress,
      selector: '0x12345678',
      target,
      isAllowed: true,
      ...extra,
    } as any)
    return id
  }

  const fetchPermission = async (id: string) => Models.SelectorPermission.collection.findOne({ id })

  it('sets chainId to the network chain id when the field is missing', async () => {
    const mainnetId = await seedPermission(NetworksEnum.ethereumMainnet)
    const baseId = await seedPermission(NetworksEnum.baseMainnet)

    await backfillSelectorPermissionChainIdMigration.start()

    expect((await fetchPermission(mainnetId))?.chainId).to.equal(1)
    expect((await fetchPermission(baseId))?.chainId).to.equal(8453)
  })

  it('sets chainId when the field is explicitly null', async () => {
    const id = await seedPermission(NetworksEnum.arbitrumMainnet, { chainId: null })

    await backfillSelectorPermissionChainIdMigration.start()

    expect((await fetchPermission(id))?.chainId).to.equal(42161)
  })

  it('leaves an existing numeric chainId untouched', async () => {
    const id = await seedPermission(NetworksEnum.ethereumMainnet, { chainId: 8453 })

    await backfillSelectorPermissionChainIdMigration.start()

    expect((await fetchPermission(id))?.chainId).to.equal(8453)
  })

  it('backfills native transfer rows (null selector) as well', async () => {
    const id = await seedPermission(NetworksEnum.ethereumMainnet, { selector: null })

    await backfillSelectorPermissionChainIdMigration.start()

    expect((await fetchPermission(id))?.chainId).to.equal(1)
  })
})
