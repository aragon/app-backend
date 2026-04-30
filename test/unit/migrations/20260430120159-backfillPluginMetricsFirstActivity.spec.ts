import { Models } from '@dbModels'
import backfillPluginMetricsFirstActivityMigration from '@src/migrations/20260430120159-backfillPluginMetricsFirstActivity'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: backfillPluginMetricsFirstActivity', () => {
  const network = NetworksEnum.ethereumMainnet
  const pluginAddress = '0xA000000000000000000000000000000000000001'
  const tokenAddress = '0xB000000000000000000000000000000000000002'
  const daoAddress = '0xD000000000000000000000000000000000000003'

  let counter = 0
  const uid = (prefix: string) => `${prefix}-${++counter}`

  const seedPlugin = async () =>
    Models.Plugin.collection.insertOne({
      id: uid('plugin'),
      address: pluginAddress,
      network,
      tokenAddress,
      daoAddress,
    } as any)

  const seedMetric = async (memberAddress: string, lastActivity: number | null, firstActivity?: number | null) => {
    const doc: any = {
      id: `${network}-${memberAddress}-${pluginAddress}`,
      memberAddress,
      pluginAddress,
      network,
      daoAddress,
      voteCount: 0,
      proposalCount: 0,
      lastActivity,
    }
    if (firstActivity !== undefined) doc.firstActivity = firstActivity
    return Models.PluginMetrics.collection.insertOne(doc)
  }

  const seedVote = (data: any) => Models.Vote.collection.insertOne({ id: uid('vote'), ...data })
  const seedProposal = (data: any) => Models.Proposal.collection.insertOne({ id: uid('proposal'), ...data })
  const seedLog = (data: any) => Models.LogDelegateChanged.collection.insertOne({ id: uid('log'), ...data })

  const fetchMetric = async (memberAddress: string) =>
    Models.PluginMetrics.collection.findOne({ memberAddress, pluginAddress, network })

  it('backfills firstActivity from MIN(Vote.blockNumber)', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000001'
    await seedPlugin()
    await seedMetric(memberAddress, 5000)
    await seedVote({ memberAddress, pluginAddress, network, blockNumber: 2000 })
    await seedVote({ memberAddress, pluginAddress, network, blockNumber: 4500 })

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(2000)
  })

  it('backfills firstActivity from MIN(Proposal.blockNumber) when no votes', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000002'
    await seedPlugin()
    await seedMetric(memberAddress, 5000)
    await seedProposal({ creatorAddress: memberAddress, pluginAddress, network, blockNumber: 1500 })
    await seedProposal({ creatorAddress: memberAddress, pluginAddress, network, blockNumber: 4000 })

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(1500)
  })

  it('backfills from MIN(LogDelegateChanged.blockNumber) via tokenAddress (delegator or toDelegate)', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000003'
    const otherAddress = '0x9000000000000000000000000000000000000099'
    await seedPlugin()
    await seedMetric(memberAddress, 5000)
    await seedLog({ delegator: memberAddress, toDelegate: otherAddress, tokenAddress, network, blockNumber: 3000 })
    await seedLog({ delegator: otherAddress, toDelegate: memberAddress, tokenAddress, network, blockNumber: 1200 })
    await seedLog({ delegator: otherAddress, toDelegate: otherAddress, tokenAddress, network, blockNumber: 100 })

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(1200)
  })

  it('takes the MIN across all sources when multiple exist', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000004'
    await seedPlugin()
    await seedMetric(memberAddress, 9999)
    await seedVote({ memberAddress, pluginAddress, network, blockNumber: 800 })
    await seedProposal({ creatorAddress: memberAddress, pluginAddress, network, blockNumber: 500 })
    await seedLog({ delegator: memberAddress, toDelegate: memberAddress, tokenAddress, network, blockNumber: 300 })

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(300)
  })

  it('falls back to lastActivity when no source events exist', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000005'
    await seedPlugin()
    await seedMetric(memberAddress, 7777)

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(7777)
  })

  it('leaves docs that already have firstActivity untouched', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000006'
    await seedPlugin()
    await seedMetric(memberAddress, 8000, 2222)
    await seedVote({ memberAddress, pluginAddress, network, blockNumber: 100 })

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity).to.eq(2222)
  })

  it('skips docs with lastActivity=null', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000007'
    await seedPlugin()
    await seedMetric(memberAddress, null)

    await backfillPluginMetricsFirstActivityMigration.start()

    const result = await fetchMetric(memberAddress)
    expect(result?.firstActivity ?? null).to.be.null
  })

  it('is idempotent: re-running does not change a backfilled doc', async () => {
    const memberAddress = '0x1000000000000000000000000000000000000008'
    await seedPlugin()
    await seedMetric(memberAddress, 5000)
    await seedVote({ memberAddress, pluginAddress, network, blockNumber: 1000 })

    await backfillPluginMetricsFirstActivityMigration.start()
    const after1 = await fetchMetric(memberAddress)
    await backfillPluginMetricsFirstActivityMigration.start()
    const after2 = await fetchMetric(memberAddress)

    expect(after1?.firstActivity).to.eq(1000)
    expect(after2?.firstActivity).to.eq(1000)
  })
})
