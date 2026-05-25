import { Models } from '@dbModels'
import fixProposalSettingsMinProposerVotingPowerTypeMigration from '@src/migrations/20260501100801-fixProposalSettingsMinProposerVotingPowerType'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: fixProposalSettingsMinProposerVotingPowerType', () => {
  const network = NetworksEnum.ethereumMainnet
  const pluginAddress = '0xA000000000000000000000000000000000000001'
  const daoAddress = '0xD000000000000000000000000000000000000003'

  let counter = 0
  const uid = (prefix: string) => `${prefix}-${++counter}`

  const seedProposal = async (settings: Record<string, unknown> | null, blockNumber = 1000) => {
    const id = uid('proposal')
    await Models.Proposal.collection.insertOne({
      id,
      transactionHash: '0xtx',
      blockNumber,
      network,
      pluginAddress,
      daoAddress,
      settings,
    } as any)
    return id
  }

  const seedSetting = async (settingId: string, minProposerVotingPower: string, blockNumber = 1000) => {
    await Models.Setting.collection.insertOne({
      id: settingId,
      transactionHash: '0xtx',
      blockNumber,
      network,
      pluginAddress,
      daoAddress,
      minProposerVotingPower,
    } as any)
  }

  const fetchProposal = async (id: string) => Models.Proposal.collection.findOne({ id })

  it('recovers the exact string from the source Setting when settings.id is present', async () => {
    const settingId = uid('setting')
    await seedSetting(settingId, '100000000000000000000000', 900)
    // Seed a proposal with the lossy number that JSON-serializing 1e23 would land at.
    const proposalId = await seedProposal({
      id: settingId,
      blockNumber: 900,
      minProposerVotingPower: 1e23, // becomes 99999999999999991611392 once stored
    })

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.settings.minProposerVotingPower).to.eq('100000000000000000000000')
    expect(typeof result?.settings.minProposerVotingPower).to.eq('string')
  })

  it('falls back to stringifying the numeric value when no matching Setting exists', async () => {
    const proposalId = await seedProposal({
      id: 'missing-setting',
      blockNumber: 900,
      minProposerVotingPower: 12345,
    })

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.settings.minProposerVotingPower).to.eq('12345')
    expect(typeof result?.settings.minProposerVotingPower).to.eq('string')
  })

  it('converts zero to the string "0"', async () => {
    const proposalId = await seedProposal({
      id: 'zero-setting',
      blockNumber: 900,
      minProposerVotingPower: 0,
    })

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.settings.minProposerVotingPower).to.eq('0')
  })

  it('leaves proposals that already store a string untouched', async () => {
    const proposalId = await seedProposal({
      id: 'string-setting',
      blockNumber: 900,
      minProposerVotingPower: '100000000000000000000000',
    })

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.settings.minProposerVotingPower).to.eq('100000000000000000000000')
  })

  it('skips proposals with no settings subdocument', async () => {
    const proposalId = await seedProposal(null)

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.settings).to.be.null
  })

  it('is idempotent: re-running does not change a backfilled doc', async () => {
    const settingId = uid('setting')
    await seedSetting(settingId, '50000000000000000000000', 900)
    const proposalId = await seedProposal({
      id: settingId,
      blockNumber: 900,
      minProposerVotingPower: 5e22,
    })

    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()
    const after1 = await fetchProposal(proposalId)
    await fixProposalSettingsMinProposerVotingPowerTypeMigration.start()
    const after2 = await fetchProposal(proposalId)

    expect(after1?.settings.minProposerVotingPower).to.eq('50000000000000000000000')
    expect(after2?.settings.minProposerVotingPower).to.eq('50000000000000000000000')
  })
})
