import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogProposal, { Vote } from '@models/schema/logProposal'
import { Models } from '@dbModels'

describe('Model: LogProposal', () => {
  let sandbox: SinonSandbox
  let rawLogProposal: Partial<LogProposal>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1

    rawLogProposal = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      pluginAddress,
      proposalId,
      allowFailureMap: 0,
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
      startDate: 234234223,
      endDate: 334234223,
      metadataUri: 'some-uri',
      actions: [],
      voteEvents: [],
      executed: {
        status: true,
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogProposal', async () => {
    it('Should create LogProposal', async () => {
      const entityId = Models.LogProposal.getEntityId(
        rawLogProposal.transactionHash,
        rawLogProposal.pluginAddress,
        rawLogProposal.proposalId,
      )
      rawLogProposal.entityId = entityId
      const createdLogProposal = await Models.LogProposal.create(rawLogProposal)

      expect(createdLogProposal.id).to.exist
      expect(createdLogProposal.entityId).to.eq(rawLogProposal.entityId)
      expect(createdLogProposal.transactionHash).to.eq(rawLogProposal.transactionHash)
      expect(createdLogProposal.blockNumber).to.eq(rawLogProposal.blockNumber)
      expect(createdLogProposal.network).to.eq(rawLogProposal.network)
      expect(createdLogProposal.pluginAddress).to.eq(rawLogProposal.pluginAddress)
      expect(createdLogProposal.proposalId).to.eq(rawLogProposal.proposalId)
      expect(createdLogProposal.creatorAddress).to.eq(rawLogProposal.creatorAddress)
      expect(createdLogProposal.startDate).to.eq(rawLogProposal.startDate)
      expect(createdLogProposal.endDate).to.eq(rawLogProposal.endDate)
      expect(createdLogProposal.allowFailureMap).to.eq(rawLogProposal.allowFailureMap)
      expect(createdLogProposal.metadataUri).to.eq(rawLogProposal.metadataUri)
      expect(createdLogProposal.actions.length).to.eq(rawLogProposal.actions?.length)
      expect(createdLogProposal.voteEvents.length).to.eq(rawLogProposal.voteEvents?.length)
      expect(createdLogProposal.executed.status).to.eq(rawLogProposal.executed?.status)
      expect(createdLogProposal.executed.transactionHash).to.eq(rawLogProposal.executed?.transactionHash)
      expect(createdLogProposal.executed.blockNumber).to.eq(rawLogProposal.executed?.blockNumber)
    })

    it('Should create LogProposal without entityId', async () => {
      const entityId = Models.LogProposal.getEntityId(
        rawLogProposal.transactionHash,
        rawLogProposal.pluginAddress,
        rawLogProposal.proposalId,
      )
      const createdLogProposal = await Models.LogProposal.create(rawLogProposal)

      expect(createdLogProposal.id).to.exist
      expect(createdLogProposal.entityId).to.eq(entityId)
      expect(createdLogProposal.transactionHash).to.eq(rawLogProposal.transactionHash)
      expect(createdLogProposal.blockNumber).to.eq(rawLogProposal.blockNumber)
      expect(createdLogProposal.network).to.eq(rawLogProposal.network)
      expect(createdLogProposal.pluginAddress).to.eq(rawLogProposal.pluginAddress)
      expect(createdLogProposal.proposalId).to.eq(rawLogProposal.proposalId)
      expect(createdLogProposal.creatorAddress).to.eq(rawLogProposal.creatorAddress)
      expect(createdLogProposal.startDate).to.eq(rawLogProposal.startDate)
      expect(createdLogProposal.endDate).to.eq(rawLogProposal.endDate)
      expect(createdLogProposal.allowFailureMap).to.eq(rawLogProposal.allowFailureMap)
      expect(createdLogProposal.metadataUri).to.eq(rawLogProposal.metadataUri)
      expect(createdLogProposal.actions.length).to.eq(rawLogProposal.actions?.length)
      expect(createdLogProposal.voteEvents.length).to.eq(rawLogProposal.voteEvents?.length)
      expect(createdLogProposal.executed.status).to.eq(rawLogProposal.executed?.status)
      expect(createdLogProposal.executed.transactionHash).to.eq(rawLogProposal.executed?.transactionHash)
      expect(createdLogProposal.executed.blockNumber).to.eq(rawLogProposal.executed?.blockNumber)
    })
  })

  it('Should update LogProposal', async () => {
    const createdLogProposal = await Models.LogProposal.create(rawLogProposal)
    expect(createdLogProposal.proposalId).to.eq(rawLogProposal.proposalId)

    await createdLogProposal.update({
      proposalId: 2,
    })

    expect(createdLogProposal.proposalId).to.eq(2)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1
    const entityId = Models.LogProposal.getEntityId(transactionHash, pluginAddress, proposalId)
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalId}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogProposal = await Models.LogProposal.create(rawLogProposal)
    const foundLogProposal = await Models.LogProposal.findExistingLog(
      createdLogProposal.transactionHash,
      createdLogProposal.pluginAddress,
      createdLogProposal.proposalId,
    )
    expect(foundLogProposal?.entityId).to.eq(createdLogProposal.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogProposal = await Models.LogProposal.create(rawLogProposal)
    const foundLogProposal = await Models.LogProposal.findByEntityId(createdLogProposal.entityId)
    expect(foundLogProposal?.entityId).to.eq(createdLogProposal.entityId)
  })

  it('Should addVoteEvent when empty', async () => {
    const proposal = await Models.LogProposal.create(rawLogProposal)
    proposal.voteEvents = undefined

    const vote: Vote = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      proposalId: 1,
      memberAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      voteOption: 2,
      votingPower: '322',
    }
    const proposalDb = await proposal.addVoteEvent(vote)
    const voteDb = await proposalDb.findVote(vote.transactionHash)

    expect(proposalDb?.transactionHash).to.eq(rawLogProposal.transactionHash)

    expect(voteDb?.transactionHash).to.eq(vote.transactionHash)
    expect(voteDb?.blockNumber).to.eq(vote.blockNumber)
    expect(voteDb?.proposalId).to.eq(vote.proposalId)
    expect(voteDb?.memberAddress).to.eq(vote.memberAddress)
    expect(voteDb?.voteOption).to.eq(vote.voteOption)
    expect(voteDb?.votingPower).to.eq(vote.votingPower)
  })

  it('Should addVoteEvent/findVote', async () => {
    const proposal = await Models.LogProposal.create(rawLogProposal)

    const vote: Vote = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      proposalId: 1,
      memberAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      voteOption: 2,
      votingPower: '322',
    }
    const proposalDb = await proposal.addVoteEvent(vote)
    const voteDb = await proposalDb.findVote(vote.transactionHash)

    expect(proposalDb?.transactionHash).to.eq(rawLogProposal.transactionHash)

    expect(voteDb?.transactionHash).to.eq(vote.transactionHash)
    expect(voteDb?.blockNumber).to.eq(vote.blockNumber)
    expect(voteDb?.proposalId).to.eq(vote.proposalId)
    expect(voteDb?.memberAddress).to.eq(vote.memberAddress)
    expect(voteDb?.voteOption).to.eq(vote.voteOption)
    expect(voteDb?.votingPower).to.eq(vote.votingPower)
  })

  it('Should findByProposalId', async () => {
    const createdLogProposal = await Models.LogProposal.create(rawLogProposal)
    const LogProposal = await Models.LogProposal.findByProposalId(
      createdLogProposal.proposalId,
      createdLogProposal.pluginAddress,
      createdLogProposal.network,
    )
    expect(LogProposal?.daoAddress).to.eq(rawLogProposal.daoAddress)
  })

  it('Should reload', async () => {
    const createdLogProposal = await Models.LogProposal.create(rawLogProposal)
    await createdLogProposal.reload()

    expect(createdLogProposal.daoAddress).to.eq(rawLogProposal.daoAddress)
  })
})
