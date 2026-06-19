import { Models } from '@dbModels'
import normalizeCancelTxInfoMigration from '@src/migrations/20260610114709-normalizeCancelTxInfo'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: normalizeCancelTxInfo', () => {
  const network = NetworksEnum.ethereumMainnet
  const pluginAddress = '0xA000000000000000000000000000000000000001'
  const daoAddress = '0xD000000000000000000000000000000000000003'

  let counter = 0
  const uid = (prefix: string) => `${prefix}-${++counter}`

  const seedProposal = async (cancelTxInfo: unknown) => {
    const id = uid('proposal')
    await Models.Proposal.collection.insertOne({
      id,
      transactionHash: '0xtx',
      blockNumber: 1000,
      network,
      pluginAddress,
      daoAddress,
      proposalIndex: '1',
      creatorAddress: '0xC000000000000000000000000000000000000002',
      startDate: 1000,
      endDate: 2000,
      cancelTxInfo,
    } as any)
    return id
  }

  const fetchProposal = async (id: string) => Models.Proposal.collection.findOne({ id })

  it('normalizes the legacy boolean default `false` to null', async () => {
    const proposalId = await seedProposal(false)

    await normalizeCancelTxInfoMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.cancelTxInfo).to.be.null
  })

  it('normalizes a boolean `true` to null', async () => {
    const proposalId = await seedProposal(true)

    await normalizeCancelTxInfoMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.cancelTxInfo).to.be.null
  })

  it('leaves a valid TxInfo object untouched', async () => {
    const txInfo = {
      transactionHash: '0xe685ec790e8f50c43e994046571913acc50de29ca5767952c11d1dc0ae361dd9',
      blockNumber: 11024898,
      blockTimestamp: 1781037468,
    }
    const proposalId = await seedProposal(txInfo)

    await normalizeCancelTxInfoMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.cancelTxInfo).to.deep.eq(txInfo)
  })

  it('leaves a null cancelTxInfo untouched', async () => {
    const proposalId = await seedProposal(null)

    await normalizeCancelTxInfoMigration.start()

    const result = await fetchProposal(proposalId)
    expect(result?.cancelTxInfo).to.be.null
  })

  it('makes a broken document hydratable and savable again', async () => {
    const proposalId = await seedProposal(false)

    await normalizeCancelTxInfoMigration.start()

    const proposal = await Models.Proposal.findOne({ id: proposalId })
    expect(proposal).to.not.be.null
    expect(proposal!.cancelTxInfo).to.be.null
    await proposal!.save()
  })

  it('is idempotent: re-running does not change already-normalized docs', async () => {
    const proposalId = await seedProposal(false)

    await normalizeCancelTxInfoMigration.start()
    const after1 = await fetchProposal(proposalId)
    await normalizeCancelTxInfoMigration.start()
    const after2 = await fetchProposal(proposalId)

    expect(after1?.cancelTxInfo).to.be.null
    expect(after2?.cancelTxInfo).to.be.null
  })
})
