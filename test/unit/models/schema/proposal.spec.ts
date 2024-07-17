import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, ProposalActionType } from '@types'
import Proposal from '@models/schema/proposal'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'

describe('Model: Proposal', () => {
  let sandbox: SinonSandbox
  let rawProposalMultisig: Partial<Proposal>
  let rawProposalTokenVoting: Partial<Proposal>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawProposalMultisig = {
      transactionHash: '0xf7150dd71a976384fd3d3ef755fbf7487ffb3e8cc67024b53be578e6173f7618',
      blockNumber: 16726919,
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0x563Ebb4972bb6fABb1128c5895A31B6FAC2f6e14',
      proposalId: 0,
      creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
      startDate: 1677591000,
      endDate: 1678023600,
      metadataUri: 'ipfs://QmeyZSVahzCR3WYR5SnvGswhPEBr4S2fZT7E4WPsCMgBCH',
      settings: {
        minApprovals: 1,
        onlyListed: true,
        fromBlockNumber: 16726867,
        toBlockNumber: null as any,
        fromTxHash: '0x8c325e119c9728b60094a13cdc76a06a3821364259596dc968b60c31010e4988',
        toTxHash: null as any,
      } as any,
      actions: [
        {
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          data: '0x',
          value: '0',
          functionName: 'test',
          textSignature: 'test(uint256,uint256)',
          decoded: ['1', 1],
          contractName: null,
          type: ProposalActionType.Unknown,
          metadata: null,
        },
      ],
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      title: "Let's pate pate!",
      description: null as any,
      summary: "Let's pate pate!",
      media: {
        header: null as any,
        logo: null as any,
      },
    }

    rawProposalTokenVoting = {
      transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
      blockNumber: 16733645,
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0xB85380977eC3435aeBc13e29b01AF990393bdED9',
      proposalId: 0,
      creatorAddress: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
      startDate: 1677672720,
      endDate: 1677676920,
      metadataUri: 'ipfs://QmVgY3QEEDypzjW8Udj1LECNDZTDNYkNZ5VNKTPYff1Vwz',
      executed: {
        status: true,
        transactionHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
        blockNumber: 16733707,
        blockTimestamp: 3423423,
      },
      settings: {
        votingMode: 1,
        supportThreshold: 500000,
        minParticipation: 150000,
        minDuration: 3600,
        minProposerVotingPower: '5e+19',
        fromBlockNumber: 16726558,
        toBlockNumber: 16733707,
        fromTxHash: '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
        toTxHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
      } as any,
      actions: [
        {
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          data: '0x',
          value: '0',
        } as any,
      ],
      daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
      title: 'New Look!',
      description:
        '<p>Changing the following metadata on the DAO:<br><strong>Name - Feel the Breeze</strong></p><p><strong>Logo</strong></p>',
      summary: 'Changing DAO metadata',
      media: {
        header: null as any,
        logo: null as any,
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  function checkProperties(rawProposal: Partial<Proposal>, createdProposal: Proposal) {
    for (const key in rawProposal) {
      if (typeof rawProposal[key] === 'object' && rawProposal[key] !== null) {
        checkProperties(rawProposal[key], createdProposal[key])
      } else {
        expect(createdProposal[key]).to.eql(rawProposal[key])
      }
    }
  }

  describe('Create Proposal', async () => {
    it('Should create Proposal multisig', async () => {
      rawProposalMultisig.id = Models.Proposal.getEntityId({
        transactionHash: rawProposalMultisig.transactionHash!,
        pluginAddress: rawProposalMultisig.pluginAddress!,
        proposalId: rawProposalMultisig.proposalId!,
      })
      const createdProposal = await Models.Proposal.create(rawProposalMultisig)

      checkProperties(rawProposalMultisig, createdProposal)
    })

    it('Should create Proposal token-voting', async () => {
      rawProposalTokenVoting.id = Models.Proposal.getEntityId({
        transactionHash: rawProposalTokenVoting.transactionHash!,
        pluginAddress: rawProposalTokenVoting.pluginAddress!,
        proposalId: rawProposalTokenVoting.proposalId!,
      })

      const createdProposal = await Models.Proposal.create(rawProposalTokenVoting)

      checkProperties(rawProposalTokenVoting, createdProposal)
    })

    it('Should create Proposal without entityId', async () => {
      const entityId = Models.Proposal.getEntityId({
        transactionHash: rawProposalMultisig.transactionHash!,
        pluginAddress: rawProposalMultisig.pluginAddress!,
        proposalId: rawProposalMultisig.proposalId!,
      })
      const createdProposal = await Models.Proposal.create(rawProposalMultisig)

      expect(createdProposal.id).to.eq(entityId)
      expect(createdProposal.transactionHash).to.eq(rawProposalMultisig.transactionHash)
      expect(createdProposal.blockNumber).to.eq(rawProposalMultisig.blockNumber)
      expect(createdProposal.network).to.eq(rawProposalMultisig.network)
      expect(createdProposal.pluginAddress).to.eq(rawProposalMultisig.pluginAddress)
      expect(createdProposal.proposalId).to.eq(rawProposalMultisig.proposalId)
      expect(createdProposal.creatorAddress).to.eq(rawProposalMultisig.creatorAddress)
      expect(createdProposal.startDate).to.eq(rawProposalMultisig.startDate)
      expect(createdProposal.endDate).to.eq(rawProposalMultisig.endDate)
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
      const rawPlugins = [
        {
          transactionHash: '0xf7150dd71a976384fd3d3ef755fbf7487ffb3e8cc67024b53be578e6173f7618',
          blockNumber: 16726919,
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x563Ebb4972bb6fABb1128c5895A31B6FAC2f6e14',
          proposalId: 0,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1677591000,
          endDate: 1678023600,
          metadataUri: 'ipfs://QmeyZSVahzCR3WYR5SnvGswhPEBr4S2fZT7E4WPsCMgBCH',
          settings: {
            minApprovals: 1,
            onlyListed: true,
            fromBlockNumber: 16726867,
            toBlockNumber: null,
            fromTxHash: '0x8c325e119c9728b60094a13cdc76a06a3821364259596dc968b60c31010e4988',
            toTxHash: null,
          },
          daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
          title: "Let's pate pate!",
          description: null,
          summary: "Let's pate pate!",
          media: {
            header: null,
            logo: null,
          },
        },
        {
          transactionHash: '0x90a26411d62d1ba9f7b82e3697e94ff1ae9b5cce89e3f594ebe57b897245d39e',
          blockNumber: 16733645,
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0xB85380977eC3435aeBc13e29b01AF990393bdED9',
          proposalId: 0,
          creatorAddress: '0xc1d60f584879f024299DA0F19Cdb47B931E35b53',
          startDate: 1677672720,
          endDate: 1677676920,
          metadataUri: 'ipfs://QmVgY3QEEDypzjW8Udj1LECNDZTDNYkNZ5VNKTPYff1Vwz',
          executed: {
            status: true,
            transactionHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
            blockNumber: 16733707,
          },
          settings: {
            votingMode: 1,
            supportThreshold: 500000,
            minParticipation: 150000,
            minDuration: 3600,
            minProposerVotingPower: '5e+19',
            fromBlockNumber: 16726558,
            toBlockNumber: 16733707,
            fromTxHash: '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
            toTxHash: '0xe49a4a878ed2073e012249ef39960b9c9a21446f223e4e5a6ef0edc97831c37e',
          },
          daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
          title: 'New Look!',
          description:
            '<p>Changing the following metadata on the DAO:<br><strong>Name - Feel the Breeze</strong></p><p><strong>Logo</strong></p>',
          summary: 'Changing DAO metadata',
          media: {
            header: null,
            logo: null,
          },
        },
      ]

      await Promise.all(rawPlugins.map(rawPlugin => Models.Proposal.create(rawPlugin)))
    })

    it('Should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Proposal.findWithPagination({
        extraParams: {},
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
        extraParams: { daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254' },
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
        extraParams: { pluginAddress: '0x563Ebb4972bb6fABb1128c5895A31B6FAC2f6e14' },
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
          daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
          pluginAddress: '0xB85380977eC3435aeBc13e29b01AF990393bdED9',
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
    expect(Object.keys(filterProposal).length).to.eq(20)
  })
})
