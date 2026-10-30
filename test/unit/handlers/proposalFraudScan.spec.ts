import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import ProposalHelper from '@helpers/proposal'
import RabbitMQHelper from '@helpers/rabbitMQ'
import TelegramSubscribedDaoCache from '@helpers/telegramSubscribedDaoCache'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { MemberGovernanceFactory } from '@src/governance'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import { EnumQueueName, IPluginInterfaceType, NetworksEnum, TestNetworks } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('ProposalHandler: fraud scans by network', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1_700_000_000)
    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
    sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves('1000')
    sandbox.stub(LockToVoteHelper, 'getCurrentTotalSupply').resolves('1000')
    sandbox.stub(TelegramSubscribedDaoCache, 'refresh').resolves()
    sandbox.stub(TelegramSubscribedDaoCache, 'has').returns(false)
    sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({ title: 'Transfer' } as any)
    sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
    sandbox.stub(ProposalHelper, 'findOutOfOrderProposalEvents').resolves([])
    sandbox.stub(Web3Utils, 'extractMetadataUri').returns(ProposalList[0].metadataUri)
    sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(ProposalList[0].settings as any)
    sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
    sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns({
      updatePluginMetrics: sandbox.stub().resolves(),
      updateDaoMetrics: sandbox.stub().resolves(),
    } as any)
  })

  afterEach(() => sandbox.restore())

  for (const interfaceType of [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.lockToVote]) {
    for (const network of [NetworksEnum.ethereumMainnet, ...TestNetworks]) {
      const shouldScan = network === NetworksEnum.ethereumMainnet

      it(`indexes ${interfaceType} proposals and votes on ${network} ${shouldScan ? 'with' : 'without'} fraud scans`, async () => {
        const plugin = await Models.Plugin.create({ ...structuredClone(PluginList[0]), network, interfaceType })
        const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
        const info = {
          transactionHash: ProposalList[0].transactionHash,
          address: plugin.address,
          network,
          blockNumber: 100,
          transactionIndex: 0,
          logIndex: 0,
          eventName: 'ProposalCreated',
        }

        await ProposalHandler.proposalCreated(
          {
            args: {
              creator: ProposalList[0].creatorAddress,
              proposalId: 1n,
              startDate: 1_700_000_000n,
              endDate: 1_700_100_000n,
              allowFailureMap: 0n,
              metadata: '0x',
              actions: [{ to: plugin.daoAddress, value: 1n, data: '0x' }],
            },
          } as any,
          info,
        )

        const proposal = await Models.Proposal.findByProposalIndex('1', plugin.address, network)
        expect(proposal).to.exist
        expect(sendStub.calledWith(EnumQueueName.proposalActions)).to.be.true
        expect(sendStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.equal(
          interfaceType === IPluginInterfaceType.tokenVoting,
        )
        expect(sendStub.calledWith(EnumQueueName.proposalFraudScan)).to.equal(shouldScan)

        await Models.ProposalFinding.create({
          id: proposal.id,
          network,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          proposalIndex: proposal.proposalIndex,
          creatorAddress: proposal.creatorAddress,
          blockTimestamp: proposal.blockTimestamp,
          score: 60,
          creationScore: 60,
          level: 'high',
          creationLevel: 'high',
        })
        sendStub.resetHistory()

        await ProposalHandler.voteCast(
          {
            args: { proposalId: 1n, voter: proposal.creatorAddress, voteOption: 2n, votingPower: 1000n },
          } as any,
          { ...info, logIndex: 1, eventName: 'VoteCast' },
        )

        expect(await Models.Vote.countDocuments({ network, pluginAddress: plugin.address })).to.equal(1)
        expect(sendStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.be.true
        expect(sendStub.calledWith(EnumQueueName.proposalFraudScan)).to.equal(shouldScan)
      })
    }
  }
})
