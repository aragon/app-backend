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

  describe('lastSavedProposal', () => {
    it('Should find lastSavedProposal', async () => {
      await Promise.all(ProposalList.map(proposalListItem => Models.Proposal.create(proposalListItem)))

      await Models.Proposal.create({
        ...ProposalList[0],
        id: '0x00123123-0x00123123-123213',
        proposalIndex: 123213,
        blockNumber: ProposalList[0].blockNumber + 10,
        transactionHash: '0x00',
        incrementalId: 3,
      })

      const proposal = await Models.Proposal.findLastSavedProposal(
        ProposalList[0].pluginAddress!,
        ProposalList[0].network!,
        ProposalList[0].blockNumber + 10,
      )
      expect(proposal).to.be.not.null
    })
  })
})
