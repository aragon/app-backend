import { Models } from '@dbModels'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integ: TokenVoting', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe(`TokenVoting flow`, () => {
    const networks = [
      {
        network: NetworksEnum.polygonMainnet,
        daoAddress: '0xAB98085757BFd1C2718fF3cFa390a3db2e8fd209',
        pluginAddress: '0x234A739dF312879A654F546f25c30F439a2B077E',
        fromBlock: 51697311,
        toBlock: 88655313,
      },
    ]

    for (const { network, daoAddress, pluginAddress, fromBlock, toBlock } of networks) {
      it(`should install + sync tokenVoting dao properly ${network}`, async function () {
        const libUtils = new LibUtils({
          daoAddress,
          network,
          config: {
            sandbox,
            blockLimit: toBlock,
          },
        })
        // Installs the DAO + its plugins from DAO/PSP logs over [fromBlock, toBlock], stopping as soon
        // as the target tokenVoting plugin exists.
        await libUtils.syncCompleteDao(
          fromBlock,
          async () => !!(await Models.Plugin.findOne({ address: pluginAddress, network })),
        )

        const tokenPlugin = await Models.Plugin.findOne({
          daoAddress,
          address: pluginAddress,
          network,
        })
        expect(tokenPlugin).to.exist
        expect(tokenPlugin.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
        expect(tokenPlugin.isSupported).to.be.true

        // Plugin now exists — replay specific transactions (proposals, votes, etc.) through the
        // production handlers. Add your tx hashes here.
        const txHashes: string[] = ['0x5327fa299dc37a138f36a700ad1f1e4f8d0d4742ef79e384b0555b19f6ffc97e']
        if (txHashes.length) {
          await LibUtils.handleEventsFromTxHashes(txHashes, network)
        }

        // The hotfix path: the replayed tx carries ProposalCreated AND an out-of-order VoteCast
        // (emitted before ProposalCreated in the same tx). Assert the proposal is created, the vote
        // was caught up, and both share the same transaction hash.
        const txHash = txHashes[0]

        const proposal = await Models.Proposal.findOne({
          transactionHash: txHash,
          pluginAddress: tokenPlugin.address,
          network,
        })
        expect(proposal, 'proposal should be created from the replayed tx').to.exist
        expect(proposal.metrics.totalVotes).to.be.eq(1)

        // The caught-up VoteCast is reflected in the proposal's per-option metrics
        expect(proposal.metrics.votesByOption).to.have.lengthOf(1)
        expect(proposal.metrics.votesByOption[0].type).to.eq(2)
        expect(proposal.metrics.votesByOption[0].totalVotes).to.eq(1)
        expect(proposal.metrics.votesByOption[0].totalVotingPower).to.eq('2702463796442938243949192')

        const vote = await Models.Vote.findOne({
          transactionHash: txHash,
          pluginAddress: tokenPlugin.address,
          network,
        })
        expect(vote, 'out-of-order vote should be caught up').to.exist

        // Same transaction hash on both proves the same-tx out-of-order catch-up
        expect(vote.transactionHash).to.eq(txHash)
        expect(vote.transactionHash).to.eq(proposal.transactionHash)
        expect(vote.proposalIndex).to.eq(proposal.proposalIndex)
      })
    }
  })
})
