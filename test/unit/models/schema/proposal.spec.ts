import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Proposal from '@models/schema/proposal'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'
import { ProposalList } from '@test/mock/fakeProposal'
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
        proposalId: rawProposalMultisig.proposalId!,
      })
      const createdProposal = await Models.Proposal.create(rawProposalMultisig)
      expect(createdProposal.id).to.eq(rawProposalMultisig.id)
      expect(createdProposal.transactionHash).to.eq(rawProposalMultisig.transactionHash)
      expect(createdProposal.blockNumber).to.eq(rawProposalMultisig.blockNumber)
      expect(createdProposal.network).to.eq(rawProposalMultisig.network)
      expect(createdProposal.pluginAddress).to.eq(rawProposalMultisig.pluginAddress)
      expect(createdProposal.proposalId).to.eq(rawProposalMultisig.proposalId)
      expect(createdProposal.creatorAddress).to.eq(rawProposalMultisig.creatorAddress)
      expect(createdProposal.startDate).to.eq(rawProposalMultisig.startDate)
      expect(createdProposal.endDate).to.eq(rawProposalMultisig.endDate)
    })

    it('Should create Proposal token-voting', async () => {
      rawProposalTokenVoting.id = Models.Proposal.getEntityId({
        transactionHash: rawProposalTokenVoting.transactionHash!,
        pluginAddress: rawProposalTokenVoting.pluginAddress!,
        proposalId: rawProposalTokenVoting.proposalId!,
      })

      const createdProposal = await Models.Proposal.create(rawProposalTokenVoting)
      expect(createdProposal.id).to.eq(rawProposalTokenVoting.id)
      expect(createdProposal.transactionHash).to.eq(rawProposalTokenVoting.transactionHash)
      expect(createdProposal.blockNumber).to.eq(rawProposalTokenVoting.blockNumber)
      expect(createdProposal.network).to.eq(rawProposalTokenVoting.network)
      expect(createdProposal.pluginAddress).to.eq(rawProposalTokenVoting.pluginAddress)
      expect(createdProposal.proposalId).to.eq(rawProposalTokenVoting.proposalId)
      expect(createdProposal.creatorAddress).to.eq(rawProposalTokenVoting.creatorAddress)
      expect(createdProposal.startDate).to.eq(rawProposalTokenVoting.startDate)
      expect(createdProposal.endDate).to.eq(rawProposalTokenVoting.endDate)
    })
  })

  it('Should update Proposal', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    expect(createdProposal.proposalId).to.eq(rawProposalMultisig.proposalId)

    await createdProposal.update({
      proposalId: 2,
    })

    expect(createdProposal.proposalId).to.eq(2)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1
    const entityId = Models.Proposal.getEntityId({ transactionHash, pluginAddress, proposalId })
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalId}`)
  })

  it('Should update Proposal', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    expect(createdProposal.proposalId).to.eq(rawProposalMultisig.proposalId)

    await createdProposal.update({
      proposalId: 2,
    })

    expect(createdProposal.proposalId).to.eq(2)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1
    const entityId = Models.Proposal.getEntityId({ transactionHash, pluginAddress, proposalId })
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalId}`)
  })

  it('Should findByTransactionHash', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    const foundProposal = await Models.Proposal.findByTransactionHash(
      createdProposal.transactionHash,
      createdProposal.network,
    )
    expect(foundProposal?.id).to.eq(createdProposal.id)
  })

  it('Should findExistingLog', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    const foundProposal = await Models.Proposal.findExistingLog({
      transactionHash: createdProposal.transactionHash,
      pluginAddress: createdProposal.pluginAddress,
      proposalId: createdProposal.proposalId,
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
    const Proposal = await Models.Proposal.findByProposalId(
      createdProposal.proposalId,
      createdProposal.pluginAddress,
      createdProposal.network,
    )
    expect(Proposal?.daoAddress).to.eq(rawProposalMultisig.daoAddress)
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
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
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

  it('should filter keys', async () => {
    const createdProposal = await Models.Proposal.create(rawProposalMultisig)
    const filterProposal = createdProposal.filterKeys()

    expect(filterProposal.id).to.exist
    expect(filterProposal._id).to.be.undefined
    expect(filterProposal.__v).to.be.undefined
    expect(filterProposal.createdAt).to.be.undefined
    expect(filterProposal.updatedAt).to.be.undefined
    expect(filterProposal.executed.status).to.be.true
    expect(Object.keys(filterProposal).length).to.eq(26)
  })
})
