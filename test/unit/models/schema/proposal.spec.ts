import { Models } from '@dbModels'
import Proposal from '@models/schema/proposal'
import { ProposalList } from '@test/mock/fakeProposal'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Proposal', () => {
  let sandbox: SinonSandbox
  let rawProposalMultisig: Partial<Proposal>
  let rawProposalTokenVoting: Partial<Proposal>

  beforeEach(async () => {
    rawProposalMultisig = {
      ...(ProposalList[1] as any),
    }

    rawProposalTokenVoting = {
      ...(ProposalList[0] as any),
    }

    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Proposal', async () => {
    it('Should create Proposal multisig', async () => {
      rawProposalMultisig.id = Models.Proposal.getEntityId({
        transactionHash: rawProposalMultisig.transactionHash!,
        pluginAddress: rawProposalMultisig.pluginAddress!,
        proposalIndex: rawProposalMultisig.proposalIndex!,
      })
      const createdProposal = await Models.Proposal.create(rawProposalMultisig)
      expect(createdProposal.id).to.eq(rawProposalMultisig.id)
      expect(createdProposal.transactionHash).to.eq(rawProposalMultisig.transactionHash)
      expect(createdProposal.blockNumber).to.eq(rawProposalMultisig.blockNumber)
      expect(createdProposal.network).to.eq(rawProposalMultisig.network)
      expect(createdProposal.pluginAddress).to.eq(rawProposalMultisig.pluginAddress)
      expect(createdProposal.proposalIndex).to.eq(rawProposalMultisig.proposalIndex)
      expect(createdProposal.creatorAddress).to.eq(rawProposalMultisig.creatorAddress)
      expect(createdProposal.startDate).to.eq(rawProposalMultisig.startDate)
      expect(createdProposal.endDate).to.eq(rawProposalMultisig.endDate)
    })

    it('Should create Proposal token-voting', async () => {
      rawProposalTokenVoting.id = Models.Proposal.getEntityId({
        transactionHash: rawProposalTokenVoting.transactionHash!,
        pluginAddress: rawProposalTokenVoting.pluginAddress!,
        proposalIndex: rawProposalTokenVoting.proposalIndex!,
      })

      const createdProposal = await Models.Proposal.create(rawProposalTokenVoting)
      expect(createdProposal.id).to.eq(rawProposalTokenVoting.id)
      expect(createdProposal.transactionHash).to.eq(rawProposalTokenVoting.transactionHash)
      expect(createdProposal.blockNumber).to.eq(rawProposalTokenVoting.blockNumber)
      expect(createdProposal.network).to.eq(rawProposalTokenVoting.network)
      expect(createdProposal.pluginAddress).to.eq(rawProposalTokenVoting.pluginAddress)
      expect(createdProposal.proposalIndex).to.eq(rawProposalTokenVoting.proposalIndex)
      expect(createdProposal.creatorAddress).to.eq(rawProposalTokenVoting.creatorAddress)
      expect(createdProposal.startDate).to.eq(rawProposalTokenVoting.startDate)
      expect(createdProposal.endDate).to.eq(rawProposalTokenVoting.endDate)
    })
  })

  it('Should update Proposal', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    expect(createdProposal.proposalIndex).to.eq(rawProposalMultisig.proposalIndex)

    await createdProposal.update({
      proposalIndex: 2,
    })

    expect(createdProposal.proposalIndex).to.eq('2')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalIndex = 1
    const entityId = Models.Proposal.getEntityId({ transactionHash, pluginAddress, proposalIndex })
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalIndex}`)
  })

  it('Should update Proposal', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    expect(createdProposal.proposalIndex).to.eq(rawProposalMultisig.proposalIndex)

    await createdProposal.update({
      proposalIndex: 2,
    })

    expect(createdProposal.proposalIndex).to.eq('2')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalIndex = 1
    const entityId = Models.Proposal.getEntityId({ transactionHash, pluginAddress, proposalIndex })
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalIndex}`)
  })

  it('Should findExistingLog', async () => {
    const id = Models.Proposal.getEntityId({
      transactionHash: rawProposalMultisig.transactionHash,
      pluginAddress: rawProposalMultisig.pluginAddress,
      proposalIndex: rawProposalMultisig.proposalIndex,
    })

    const createdProposal = await Models.Proposal.create({
      ...rawProposalMultisig,
      id,
    })
    const foundProposal = await Models.Proposal.findExistingLog({
      transactionHash: createdProposal.transactionHash,
      pluginAddress: createdProposal.pluginAddress,
      proposalIndex: createdProposal.proposalIndex,
    })
    expect(foundProposal?.id).to.eq(createdProposal.id)
  })

  it('Should findByEntityId', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    const foundProposal = await Models.Proposal.findByEntityId(createdProposal.id)
    expect(foundProposal?.id).to.eq(createdProposal.id)
  })

  it('Should findByProposalId', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    const Proposal = await Models.Proposal.findByProposalIndex(
      createdProposal.proposalIndex,
      createdProposal.pluginAddress,
      createdProposal.network,
    )
    expect(Proposal?.daoAddress).to.eq(rawProposalMultisig.daoAddress)
  })

  it('Should findByProposalIndex', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)

    const foundProposal = await Models.Proposal.findByProposalIndex(
      createdProposal.proposalIndex!,
      createdProposal.pluginAddress!,
      createdProposal.network!,
    )

    expect(foundProposal).to.exist
    expect(foundProposal?.id).to.eq(createdProposal.id)
    expect(foundProposal?.pluginAddress).to.eq(createdProposal.pluginAddress)
    expect(foundProposal?.network).to.eq(createdProposal.network)
    expect(foundProposal?.proposalIndex).to.eq(createdProposal.proposalIndex)
  })

  it('Should findByProposalIncrementalId', async () => {
    const createdProposal = await Models.Proposal.create({
      ...rawProposalMultisig,
      incrementalId: 1,
    })

    const foundProposal = await Models.Proposal.findByProposalIncrementalId(
      createdProposal.incrementalId!.toString(),
      createdProposal.pluginAddress!,
      createdProposal.network!,
    )

    expect(foundProposal).to.exist
    expect(foundProposal?.id).to.eq(createdProposal.id)
    expect(foundProposal?.pluginAddress).to.eq(createdProposal.pluginAddress)
    expect(foundProposal?.network).to.eq(createdProposal.network)
    expect(foundProposal?.incrementalId).to.eq(createdProposal.incrementalId)
  })

  it('Should reload', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    await createdProposal.reload()
    expect(createdProposal.daoAddress).to.eq(rawProposalMultisig.daoAddress)
  })

  describe('paginate', () => {
    beforeEach(async () => {
      await Promise.all(ProposalList.map(proposalListItem => Models.Proposal.create(proposalListItem)))
    })

    it('Should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: {
          daoInfo: true,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find with pagination with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: { daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521' },
        paginationParams: {},
      })
      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find with pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: { pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3' },
        paginationParams: {},
      })
      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should return the metadata at least if no result found', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: { daoAddress: '0xBeB63a3565942D16C1c1211bD78F1B3Dcfe1A254' },
        paginationParams: {},
      })
      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find with pagination with daoAddress and pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: {
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5522',
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
        },
        paginationParams: {},
      })
      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })
  })

  describe('findWithEntityId', () => {
    beforeEach(async () => {
      await Promise.all(ProposalList.map(proposalListItem => Models.Proposal.create(proposalListItem)))
    })

    it('Should find with entityId', async () => {
      const entityId = Models.Proposal.getEntityId({
        transactionHash: ProposalList[0].transactionHash!,
        pluginAddress: ProposalList[0].pluginAddress!,
        proposalIndex: ProposalList[0].proposalIndex!,
      })

      const proposal = await Models.Proposal.findWithEntityId(entityId)
      expect(proposal.creator).to.be.exist
      expect(proposal.creator.address).to.be.eq(ProposalList[0].creatorAddress)
      expect(proposal?.id).to.eq(entityId)
    })

    it('should find findLatestProposal', async () => {
      const proposal = await Models.Proposal.findLatestProposal(
        ProposalList[0].pluginAddress!,
        ProposalList[0].network!,
      )
      expect(proposal).to.be.not.null
    })
  })

  describe('claimForAudit / releaseAudit', () => {
    const STALE_LOCK_MS = 600_000
    let entityId: string
    let baseProposal: Partial<Proposal>

    beforeEach(async () => {
      baseProposal = { ...(ProposalList[0] as any) }
      entityId = Models.Proposal.getEntityId({
        transactionHash: baseProposal.transactionHash!,
        pluginAddress: baseProposal.pluginAddress!,
        proposalIndex: baseProposal.proposalIndex!,
      })
      await Models.Proposal.create(baseProposal)
    })

    it('should claim an open proposal (no audit, not running)', async () => {
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      expect(claimed).to.not.be.null
      expect(claimed!.auditRunning).to.be.true
      expect(claimed!.auditStartedAt).to.be.a('number')
    })

    it('should refuse to claim when an audit is already in progress', async () => {
      await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      const second = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      expect(second).to.be.null
    })

    it('should reclaim a stale lock past the TTL', async () => {
      await Models.Proposal.updateOne(
        { id: entityId },
        { $set: { auditRunning: true, auditStartedAt: Date.now() - STALE_LOCK_MS - 1000 } },
      )
      const reclaimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      expect(reclaimed).to.not.be.null
      expect(reclaimed!.auditStartedAt).to.be.greaterThan(Date.now() - STALE_LOCK_MS)
    })

    it('should refuse to claim when an audit is already cached', async () => {
      const audit = {
        riskLevel: 'low',
        summary: 'cached',
        findings: [],
        recommendations: [],
        promptVersion: '1',
        tenderlyUrl: null,
        costUsd: null,
        durationMs: null,
        createdAt: Date.now(),
      }
      await Models.Proposal.updateOne({ id: entityId }, { $set: { audit } })
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      expect(claimed).to.be.null
    })

    it('should refuse to claim when the proposal is already executed', async () => {
      await Models.Proposal.updateOne({ id: entityId }, { $set: { 'executed.status': true } })
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      expect(claimed).to.be.null
    })

    it('should release with audit payload — clears flag and persists audit', async () => {
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      const claimToken = claimed!.auditStartedAt as number
      const audit = {
        riskLevel: 'medium',
        summary: 'ok',
        findings: [{ severity: 'medium', category: 'descriptionMismatch', description: 'desc' }],
        recommendations: ['verify off-chain'],
        promptVersion: '2',
        tenderlyUrl: 'https://example.com',
        costUsd: 0.5,
        durationMs: 12345,
        createdAt: Date.now(),
      }

      await Models.Proposal.releaseAudit(entityId, claimToken, audit)
      const fresh = await Models.Proposal.findByEntityId(entityId)
      expect(fresh!.auditRunning).to.be.false
      expect(fresh!.auditStartedAt).to.be.null
      expect(fresh!.audit!.riskLevel).to.eq('medium')
      expect(fresh!.audit!.findings).to.have.lengthOf(1)
      expect(fresh!.audit!.recommendations).to.deep.eq(['verify off-chain'])
    })

    it('should release without audit — clears flag without persisting an audit', async () => {
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      const claimToken = claimed!.auditStartedAt as number
      await Models.Proposal.releaseAudit(entityId, claimToken, null)
      const fresh = await Models.Proposal.findByEntityId(entityId)
      expect(fresh!.auditRunning).to.be.false
      expect(fresh!.auditStartedAt).to.be.null
      expect(fresh!.audit).to.be.null
    })

    it('should still clear the lock when persisting an invalid audit fails validation', async () => {
      const claimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      const claimToken = claimed!.auditStartedAt as number

      // riskLevel is required by the ProposalAudit schema — omitting it
      // makes runValidators reject the write.
      const invalidAudit = {
        summary: 's',
        findings: [],
        recommendations: [],
        promptVersion: '2',
        tenderlyUrl: null,
        costUsd: null,
        durationMs: 0,
        createdAt: Date.now(),
      } as any

      await expect(Models.Proposal.releaseAudit(entityId, claimToken, invalidAudit)).to.be.rejected
      const fresh = await Models.Proposal.findByEntityId(entityId)
      expect(fresh!.auditRunning).to.be.false
      expect(fresh!.auditStartedAt).to.be.null
    })

    it('should not clear an unrelated lock when releasing with a stale token', async () => {
      // Worker A claims, then its lock goes stale.
      await Models.Proposal.updateOne(
        { id: entityId },
        { $set: { auditRunning: true, auditStartedAt: Date.now() - STALE_LOCK_MS - 1000 } },
      )
      const staleToken = Date.now() - STALE_LOCK_MS - 1000
      // Worker B reclaims it.
      const reclaimed = await Models.Proposal.claimForAudit(entityId, STALE_LOCK_MS)
      const newToken = reclaimed!.auditStartedAt as number
      expect(newToken).to.not.eq(staleToken)

      // Worker A finally tries to release with its stale token — must NOT clear B's lock.
      await Models.Proposal.releaseAudit(entityId, staleToken, null)
      const fresh = await Models.Proposal.findByEntityId(entityId)
      expect(fresh!.auditRunning).to.be.true
      expect(fresh!.auditStartedAt).to.eq(newToken)
    })
  })
})
