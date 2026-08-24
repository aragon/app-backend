import '@test/environment'
import config from '@config'
import { Models } from '@dbModels'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { ProposalHandler } from '@handlers/proposalHandler'
import DecodeActions from '@helpers/decodeAction'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import ProposalHelper from '@helpers/proposal'
import RabbitMQHelper from '@helpers/rabbitMQ'
import TelegramNotifier from '@helpers/telegramNotifier'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { MemberGovernanceFactory } from '@src/governance'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import {
  EnumQueueName,
  IClockMode,
  ILogInfo,
  IPluginInterfaceType,
  IProposalMetadata,
  IReportResultType,
  ITransactionSide,
  ITransactionType,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('ProposalHandler', () => {
  let sandbox: SinonSandbox
  let intervalTime: number
  let network: NetworksEnum = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    network = NetworksEnum.ethereumMainnet
    intervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0

    // Stub Models.Plugin.find for updateDaoMetrics to work
    if (!Models.Plugin.find) {
      Models.Plugin.find = sandbox.stub().resolves([])
    }
  })

  afterEach(() => {
    sandbox.restore()
    config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = intervalTime
  })

  describe('proposalCreated', () => {
    it('should handle tokenVoting proposalCreated', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0x0', value: 0n, data: '0xdata' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const proposalMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: {},
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      const pastTotalSupplyStub = sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })
      const incrementalIdStub = sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      const stubPair = sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.decoding).to.be.eq(true)
      expect(savedProposal.daoAddress).to.eq('0xdao-address')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')
      expect(savedProposal.rawActions[0].to).to.eq('0x0')
      expect(savedProposal.rawActions[0].value).to.eq('0')
      expect(savedProposal.rawActions[0].data).to.eq('0xdata')
      expect(savedProposal.snapshot.totalSupply).to.eq('1000')
      expect(incrementalIdStub.calledOnce).to.be.true
      expect(incrementalIdStub.args[0][0]).to.eq('0xplugin-address')
      expect(incrementalIdStub.args[0][1]).to.eq(network)

      expect(pastTotalSupplyStub.args[0][0]).to.be.deep.eq({
        tokenAddress: '0xtoken-address',
        blockNumber: info.blockNumber,
        network,
        blockTimestamp: 1700000000,
        clockMode: IClockMode.BlockNumber,
      })

      // Check that member was created in the database
      const member = await Models.Member.findOne({ address: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1' })
      expect(member).to.exist

      // Check that PluginMetrics was created/updated
      const pluginMetrics = await Models.PluginMetrics.findOne({
        memberAddress: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
        pluginAddress: '0xplugin-address',
        network,
      })
      expect(pluginMetrics).to.exist
      expect(pluginMetrics.daoAddress).to.eq('0xdao-address')
      expect(pluginMetrics.lastActivity).to.eq(100)
      expect(pluginMetrics.proposalCount).to.eq(1)

      expect(stubPair.calledOnce).to.be.true
      expect(rabbitMQStub.called).to.be.true
      expect(verboseLoggerStub.called).to.be.true
    })

    it('should always sync settings on-chain for objection plugins', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xobjection-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xobjection-address',
        daoAddress: '0xdao-address',
        subdomain: 'objection.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
        isObjection: true,
      }

      const staleSettings = { tokenAddress: '0xtoken-address', supportThreshold: 400000 }
      const syncedSettings = { tokenAddress: '0xtoken-address', supportThreshold: 500000 }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(staleSettings)
      const syncStub = sandbox.stub(PluginSettingHandler, 'syncObjectionSetting').resolves(syncedSettings as any)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ title: 'Objection Proposal' } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({ startDate: 0, endDate: 0 })
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')
      const initialTallyStub = sandbox
        .stub(Web3Helper, 'getTokenVotingProposal')
        .resolves({ abstain: '100', yes: '4000', no: '900' })

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(syncStub.calledOnce).to.be.true
      expect(syncStub.args[0][0].address).to.eq('0xobjection-address')

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xobjection-address',
        proposalIndex: '1',
      })
      expect(savedProposal).to.exist
      // the on-chain synced settings must win over the stale persisted ones
      expect(savedProposal.settings.supportThreshold).to.eq(500000)
      // and the objection flag must be frozen onto the proposal settings for the API
      expect(savedProposal.settings.isObjection).to.be.true

      // the objection proposal starts from the first stage's tallies, read at the proposal's block
      expect(initialTallyStub.calledOnceWith('0xobjection-address', '1', network, 100)).to.be.true
      expect(savedProposal.initialTally.abstain).to.eq('100')
      expect(savedProposal.initialTally.yes).to.eq('4000')
      expect(savedProposal.initialTally.no).to.eq('900')
    })

    it('should not fetch an initial tally for regular tokenVoting proposals', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x456',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 2n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves({ tokenAddress: '0xtoken-address' })
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ title: 'Regular Proposal' } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({ startDate: 0, endDate: 0 })
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')
      const initialTallyStub = sandbox.stub(Web3Helper, 'getTokenVotingProposal')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x456',
        pluginAddress: '0xplugin-address',
        proposalIndex: '2',
      })
      expect(savedProposal).to.exist
      expect(initialTallyStub.notCalled).to.be.true
      expect(savedProposal.initialTally).to.be.undefined
    })

    it('should skip governance updates for SPP plugin type', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.spp,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0x0', value: 0n, data: '0xdata' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.spp,
        tokenAddress: '0xtoken-address',
      }

      const proposalMetadata = {
        title: 'SPP Proposal Title',
        description: 'SPP Proposal Description',
        summary: 'SPP Proposal Summary',
        resources: [],
        media: {},
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      // Spy on MemberGovernanceFactory to ensure it's NOT called for SPP
      const governanceFactoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.daoAddress).to.eq('0xdao-address')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')

      // Verify that governance updates were NOT called for SPP plugin
      expect(governanceFactoryStub.called).to.be.false

      // Verify that PluginMetrics was NOT created/updated for SPP
      const pluginMetrics = await Models.PluginMetrics.findOne({
        memberAddress: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
        pluginAddress: '0xplugin-address',
        network,
      })
      expect(pluginMetrics).to.not.exist

      expect(verboseLoggerStub.called).to.be.true
    })

    it('should not notify telegram subscribers for an SPP stage sub-plugin', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xsub-plugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0x0', value: 0n, data: '0xdata' }],
        },
      }

      const plugin = {
        address: '0xsub-plugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
        isSubPlugin: true,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves({ tokenAddress: '0xtoken-address' })
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      const proposalMetadata = {
        title: 'Stage Proposal',
        description: 'Stage Proposal',
        summary: 'Stage Proposal',
        resources: [],
        media: {},
      }

      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({ startDate: 0, endDate: 0 })
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')
      const telegramStub = sandbox.stub(TelegramNotifier, 'publish').resolves()

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xsub-plugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(telegramStub.notCalled).to.be.true
    })

    it('should handle tokenVoting with no actions', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const proposalMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: {},
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })
      const incrementalIdStub = sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      const stubPair = sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
      } as any)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.decoding).to.be.eq(false)
      expect(savedProposal.daoAddress).to.eq('0xdao-address')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')
      expect(savedProposal.rawActions.length).to.eq(0)
      expect(savedProposal.snapshot.totalSupply).to.eq('1000')
      expect(incrementalIdStub.calledOnce).to.be.true
      expect(incrementalIdStub.args[0][0]).to.eq('0xplugin-address')
      expect(incrementalIdStub.args[0][1]).to.eq(network)

      // Check that member was created in the database
      const member = await Models.Member.findOne({ address: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1' })
      expect(member).to.exist

      // Check that PluginMetrics was created/updated
      const pluginMetrics = await Models.PluginMetrics.findOne({
        memberAddress: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
        pluginAddress: '0xplugin-address',
        network,
      })
      expect(pluginMetrics).to.exist
      expect(pluginMetrics.daoAddress).to.eq('0xdao-address')
      expect(pluginMetrics.lastActivity).to.eq(100)
      expect(pluginMetrics.proposalCount).to.eq(1)

      expect(stubPair.calledOnce).to.be.true
      expect(rabbitMQStub.called).to.be.true
      expect(verboseLoggerStub.called).to.be.true
    })

    it('should log error when tokenVoting totalSupply is 0', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: {},
      } as any)

      // Return '0' for totalSupply to trigger the error log (getPastTotalSupply returns string)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves('0')

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)

      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })

      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      // Verify error was logged
      expect(errorLoggerStub.calledWith('Error ProposalHandler.proposalCreated - totalSupply is 0' as any)).to.be.true

      // Verify proposal was still created with totalSupply of 0
      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.snapshot.totalSupply).to.eq('0')
    })

    it('should handle admin proposalCreated', async () => {
      const metadataUri = 'ipfs://metadata-uri'

      const info: ILogInfo = {
        transactionHash: '0xadmin-tx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 2,
        logIndex: 2,
        interfaceType: IPluginInterfaceType.admin,
      }

      const fakeEvent = {
        args: {
          creator: '0x742D35CC6634C0532925a3b844Bc9E7595f0beB2',
          proposalId: 2n,
          startDate: 0n, // Force startDate to be handled dynamically
          endDate: 1800000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0xadmin-target', value: 0n, data: '0x4b3d1223' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-admin',
        subdomain: 'dao.admin',
        interfaceType: IPluginInterfaceType.admin,
        isSupported: true,
        tokenAddress: null,
        network,
      }

      const proposalMetadata = {
        title: 'Admin Proposal Title',
        description: 'Admin Proposal Description',
        summary: 'Admin Proposal Summary',
        resources: [],
        media: {},
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(DecodeActions.prototype, 'parseContractNetspec')
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)

      const stubPair = sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xadmin-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '2',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.daoAddress).to.eq('0xdao-admin')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')
      expect(savedProposal.rawActions[0].to).to.eq('0xadmin-target')
      expect(savedProposal.rawActions[0].value).to.eq('0')
      expect(savedProposal.rawActions[0].data).to.eq('0x4b3d1223')
      expect(savedProposal.snapshot.membersCount).to.eq(0) // Admin plugin has no voting token snapshot

      // Check that member was created in the database
      const member = await Models.Member.findOne({ address: '0x742D35CC6634C0532925a3b844Bc9E7595f0beB2' })
      expect(member).to.exist

      // Check that PluginMetrics was created/updated
      const pluginMetrics = await Models.PluginMetrics.findOne({
        memberAddress: '0x742D35CC6634C0532925a3b844Bc9E7595f0beB2',
        pluginAddress: '0xplugin-address',
        network,
      })
      expect(pluginMetrics).to.exist
      expect(pluginMetrics.daoAddress).to.eq('0xdao-admin')
      expect(pluginMetrics.lastActivity).to.eq(150)
      expect(pluginMetrics.proposalCount).to.eq(1)

      expect(stubPair.calledOnce).to.be.true
      expect(rabbitMQStub.called).to.be.true
      expect(verboseLoggerStub.called).to.be.true
    })

    it('should handle multisig proposalCreated', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0xmultisig-tx',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.multisig,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n, // Non-zero startDate
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.multisig,
        network,
      }

      const proposalMetadata = {
        title: 'Multisig Proposal',
        description: 'Multisig Description',
        summary: 'Multisig Summary',
        resources: [],
        media: {},
      }

      const settings = {
        id: 'settings-id',
        transactionHash: '0xsettings-tx',
        blockNumber: 50,
        blockTimestamp: 1699000000,
        network,
        daoAddress: '0xdao-address',
        pluginAddress: '0xplugin-address',
        pluginSubdomain: 'multisig',
        minApprovals: 2,
      }

      const members = [{ address: '0xmember1' }, { address: '0xmember2' }, { address: '0xmember3' }]

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xmultisig-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.snapshot.membersCount).to.eq(3)
      expect(savedProposal.startDate).to.eq(1700000000) // Non-zero startDate preserved
      expect(savedProposal.endDate).to.eq(1700086400)
      expect(rabbitMQStub.called).to.be.true
    })

    it('should handle when settings is null', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0xno-settings-tx',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const proposalMetadata = {
        title: 'No Settings Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null) // No settings
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const stubWarn = sandbox.stub(logger, 'warn')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xno-settings-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.settings).to.be.null
      expect(savedProposal.snapshot.totalSupply).to.be.eq('0')
      expect(stubWarn.calledOnceWith('Error ProposalHandler.proposalCreated - tokenAddress is missing' as any))
    })

    it('should handle when proposalMetadata is null', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0xno-metadata-tx',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves({})
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(null) // Null metadata
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xno-metadata-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.title).to.be.null
      expect(savedProposal.description).to.be.null
      expect(savedProposal.summary).to.be.null
      expect(savedProposal.resources.length).to.eq(0)
      expect(savedProposal.media).to.be.undefined
    })

    it('should handle when getPastTotalSupply returns 0', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0xnull-supply-tx',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({} as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasClockMode: true } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves('0')
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xnull-supply-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.snapshot.totalSupply).to.eq('0') // Should default to '0'
    })

    it('Plugin not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
    })

    it('should return early when existingLog is found', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0x0', value: 0n, data: '0xdata' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
      }

      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)
      const stubFindExistingLog = sandbox.stub(Models.Proposal, 'findExistingLog').resolves(true)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const result = await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubFindPlugin.calledOnceWith('0xplugin-address', info.network)).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(result?.newProposal).to.be.undefined // Check that function returns nothing (early return)
      expect(stubLogger.called).to.be.false
    })

    it('proposalCreated throw error', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Error Create proposal' as any)).to.be.true
    })

    it('should handle lockToVote proposalCreated with snapshot totalSupply', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.lockToVote,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.lockToVote,
        network,
      }

      const proposalMetadata = {
        title: 'LockToVote Proposal',
        description: 'LockToVote Description',
        summary: 'LockToVote Summary',
        resources: [],
        media: {},
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)

      const getCurrentTotalSupplyStub = sandbox.stub(LockToVoteHelper, 'getCurrentTotalSupply').resolves('5000')

      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.snapshot.totalSupply).to.eq('5000')
      expect(getCurrentTotalSupplyStub.calledOnceWith(network, '0xplugin-address', 100)).to.be.true
    })

    it('should log error when lockToVote totalSupply is 0', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const info: ILogInfo = {
        transactionHash: '0xlockToVote-zero-supply',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.lockToVote,
        network,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({
        title: 'LockToVote Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      } as any)
      sandbox.stub(LockToVoteHelper, 'getCurrentTotalSupply').resolves('0')
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xlockToVote-zero-supply',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.snapshot.totalSupply).to.eq('0')
      expect(errorLoggerStub.calledOnceWith('Error ProposalHandler.proposalCreated - totalSupply is 0' as any)).to.be
        .true
    })

    it('should catch up out-of-order Approved event in same transaction for multisig', async () => {
      const { Interface } = await import('ethers')
      const { Multisig } = await import('@artifacts/Multisig')

      const multisigIface = new Interface(Multisig.abi)
      const approvedTopicHash = multisigIface.getEvent('Approved')?.topicHash!

      const metadataUri = 'ipfs://metadata-uri'
      const pluginAddress = '0xplugin-address'
      const proposalIndex = '1'
      const approverAddress = '0x1111111111111111111111111111111111111111'

      // Encode the Approved event log data
      const approvedEventLog = multisigIface.encodeEventLog(multisigIface.getEvent('Approved')!, [1n, approverAddress])

      // TickContext mock returning the Approved log with a lower logIndex
      const mockContext = {
        getLogsByTxHash: sandbox.stub().resolves([
          {
            address: pluginAddress,
            topics: [approvedTopicHash, ...approvedEventLog.topics.slice(1)],
            data: approvedEventLog.data,
            transactionIndex: 1,
            index: 0, // lower than ProposalCreated's logIndex of 5
            transactionHash: '0xmultisig-approve-tx',
            blockNumber: 100,
          },
        ]),
      }

      const info: ILogInfo = {
        transactionHash: '0xmultisig-approve-tx',
        address: pluginAddress,
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 5, // ProposalCreated has higher logIndex
        context: mockContext as any,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: pluginAddress,
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.multisig,
        network,
        isSupported: true,
      }

      const proposalMetadata = {
        title: 'Multisig Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      const settings = {
        id: 'settings-id',
        transactionHash: '0xsettings-tx',
        blockNumber: 50,
        blockTimestamp: 1699000000,
        network,
        daoAddress: '0xdao-address',
        pluginAddress,
        pluginSubdomain: 'multisig',
        minApprovals: 2,
      }

      const members = [{ address: '0xmember1' }, { address: '0xmember2' }, { address: '0xmember3' }]

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      // Verify the proposal was created
      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xmultisig-approve-tx',
        pluginAddress,
        proposalIndex,
      })
      expect(savedProposal).to.exist

      // Verify the out-of-order Approved vote was caught up
      const savedVote = await Models.Vote.findOne({
        network,
        pluginAddress,
        proposalIndex,
        memberAddress: approverAddress,
      })
      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq(approverAddress)
      expect(savedVote.logIndex).to.eq(0)
      expect(savedVote.blockNumber).to.eq(100)
    })

    it('should catch up out-of-order VoteCast event in same transaction for tokenVoting', async () => {
      const { Interface } = await import('ethers')
      const { TokenVoting } = await import('@artifacts/TokenVoting')

      const tokenVotingIface = new Interface(TokenVoting.abi)
      const voteCastTopicHash = tokenVotingIface.getEvent('VoteCast')?.topicHash!

      const metadataUri = 'ipfs://metadata-uri'
      const pluginAddress = '0xplugin-address'
      const proposalIndex = '1'
      const voterAddress = '0x1111111111111111111111111111111111111111'

      const voteCastEventLog = tokenVotingIface.encodeEventLog(tokenVotingIface.getEvent('VoteCast')!, [
        1n,
        voterAddress,
        2,
        1000n,
      ])

      const mockContext = {
        getLogsByTxHash: sandbox.stub().resolves([
          {
            address: pluginAddress,
            topics: [voteCastTopicHash, ...voteCastEventLog.topics.slice(1)],
            data: voteCastEventLog.data,
            transactionIndex: 1,
            index: 0, // lower than ProposalCreated's logIndex of 5
            transactionHash: '0xtoken-voting-tx',
            blockNumber: 100,
          },
        ]),
      }

      const info: ILogInfo = {
        transactionHash: '0xtoken-voting-tx',
        address: pluginAddress,
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 5,
        context: mockContext as any,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: pluginAddress,
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
        network,
        isSupported: true,
      }

      const proposalMetadata = {
        title: 'Token Voting Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xtoken-address',
        network,
        decimals: 18,
        hasClockMode: true,
        clockMode: IClockMode.BlockNumber,
      } as any)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves(undefined as any)

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(mockContext.getLogsByTxHash.called).to.be.true

      const savedVote = await Models.Vote.findOne({
        network,
        pluginAddress,
        proposalIndex,
        memberAddress: voterAddress,
      })
      expect(savedVote).to.exist
      expect(savedVote.voteOption).to.eq(2)
      expect(savedVote.votingPower).to.eq('1000')
      expect(savedVote.logIndex).to.eq(0)
      expect(savedVote.blockNumber).to.eq(100)
    })

    it('should not create duplicate vote when Approved was already processed normally', async () => {
      const { Interface } = await import('ethers')
      const { Multisig } = await import('@artifacts/Multisig')

      const multisigIface = new Interface(Multisig.abi)
      const approvedTopicHash = multisigIface.getEvent('Approved')?.topicHash!

      const metadataUri = 'ipfs://metadata-uri'
      const pluginAddress = '0xplugin-address'
      const approverAddress = '0x1111111111111111111111111111111111111111'

      const approvedEventLog = multisigIface.encodeEventLog(multisigIface.getEvent('Approved')!, [1n, approverAddress])

      const mockContext = {
        getLogsByTxHash: sandbox.stub().resolves([
          {
            address: pluginAddress,
            topics: [approvedTopicHash, ...approvedEventLog.topics.slice(1)],
            data: approvedEventLog.data,
            transactionIndex: 1,
            index: 0,
            transactionHash: '0xmultisig-dedup-tx',
            blockNumber: 100,
          },
        ]),
      }

      const info: ILogInfo = {
        transactionHash: '0xmultisig-dedup-tx',
        address: pluginAddress,
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 5,
        context: mockContext as any,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: pluginAddress,
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.multisig,
        network,
        isSupported: true,
      }

      const proposalMetadata = {
        title: 'Multisig Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      const settings = {
        id: 'settings-id',
        transactionHash: '0xsettings-tx',
        blockNumber: 50,
        blockTimestamp: 1699000000,
        network,
        daoAddress: '0xdao-address',
        pluginAddress,
        pluginSubdomain: 'multisig',
        minApprovals: 2,
      }

      const members = [{ address: '0xmember1' }, { address: '0xmember2' }]

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      // Simulate that the vote already exists (was processed normally before)
      const findExistingVoteStub = sandbox
        .stub(Models.Vote, 'findExistingLog')
        .resolves({ _id: 'existing-vote' } as any)

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)

      // Insert an existing vote to simulate it was already processed normally
      await Models.Vote.create({
        network,
        transactionHash: '0xmultisig-dedup-tx',
        transactionIndex: 1,
        logIndex: 0,
        blockNumber: 100,
        daoAddress: '0xdao-address',
        pluginAddress,
        memberAddress: approverAddress,
        proposalIndex: '1',
      })

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      // findExistingLog should be called during catch-up but should find existing vote and skip
      expect(findExistingVoteStub.called).to.be.true

      // The existing vote should remain the only vote for this proposal
      const voteCount = await Models.Vote.countDocuments({
        network,
        pluginAddress,
        proposalIndex: '1',
      })
      expect(voteCount).to.eq(1) // No additional vote created on top of the existing one
    })

    it('should log error and continue when catch-up throws', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const pluginAddress = '0xplugin-address'

      // TickContext that throws when getting logs
      const mockContext = {
        getLogsByTxHash: sandbox.stub().rejects(new Error('RPC failure')),
      }

      const info: ILogInfo = {
        transactionHash: '0xmultisig-error-tx',
        address: pluginAddress,
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 5,
        context: mockContext as any,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: pluginAddress,
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.multisig,
        network,
        isSupported: true,
      }

      const proposalMetadata = {
        title: 'Multisig Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      const settings = {
        id: 'settings-id',
        transactionHash: '0xsettings-tx',
        blockNumber: 50,
        blockTimestamp: 1699000000,
        network,
        daoAddress: '0xdao-address',
        pluginAddress,
        pluginSubdomain: 'multisig',
        minApprovals: 2,
      }

      const members = [{ address: '0xmember1' }, { address: '0xmember2' }]

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const errorLoggerStub = sandbox.stub(logger, 'error')

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      // Proposal should still be created despite catch-up error
      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xmultisig-error-tx',
        pluginAddress,
        proposalIndex: '1',
      })
      expect(savedProposal).to.exist

      // Error should be logged for the catch-up failure
      expect(errorLoggerStub.calledOnceWith('Error catching up out-of-order proposal events' as any)).to.be.true
    })

    it('should continue processing when parseLog throws for a malformed log', async () => {
      const { Interface } = await import('ethers')
      const { Multisig } = await import('@artifacts/Multisig')

      const multisigIface = new Interface(Multisig.abi)
      const approvedTopicHash = multisigIface.getEvent('Approved')?.topicHash!

      const metadataUri = 'ipfs://metadata-uri'
      const pluginAddress = '0xplugin-address'

      // TickContext with a malformed log (bad data) that will cause parseLog to throw
      const mockContext = {
        getLogsByTxHash: sandbox.stub().resolves([
          {
            address: pluginAddress,
            topics: [approvedTopicHash],
            data: '0xBADDATA', // malformed data
            transactionIndex: 1,
            index: 0,
            transactionHash: '0xmultisig-malformed-tx',
            blockNumber: 100,
          },
        ]),
      }

      const info: ILogInfo = {
        transactionHash: '0xmultisig-malformed-tx',
        address: pluginAddress,
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 5,
        context: mockContext as any,
      }

      const fakeEvent = {
        args: {
          creator: '0x742d35cC6634c0532925A3b844bc9E7595F0beB1',
          proposalId: 1n,
          startDate: 1700000000n,
          endDate: 1700086400n,
          allowFailureMap: 0n,
          metadata: metadataUri,
          actions: [],
        },
      }

      const plugin = {
        address: pluginAddress,
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.multisig,
        network,
        isSupported: true,
      }

      const proposalMetadata = {
        title: 'Multisig Proposal',
        description: 'Description',
        summary: 'Summary',
        resources: [],
        media: {},
      }

      const settings = {
        id: 'settings-id',
        transactionHash: '0xsettings-tx',
        blockNumber: 50,
        blockTimestamp: 1699000000,
        network,
        daoAddress: '0xdao-address',
        pluginAddress,
        pluginSubdomain: 'multisig',
        minApprovals: 2,
      }

      const members = [{ address: '0xmember1' }, { address: '0xmember2' }]

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members)
      sandbox.stub(Models.Proposal, 'getNextIncrementalId').resolves(1)
      sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)

      // Should not throw - malformed log is silently skipped
      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      // Proposal should still be created
      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xmultisig-malformed-tx',
        pluginAddress,
        proposalIndex: '1',
      })
      expect(savedProposal).to.exist

      // No vote should be created from the malformed log
      const voteCount = await Models.Vote.countDocuments({ network, pluginAddress, proposalIndex: '1' })
      expect(voteCount).to.eq(0)
    })
  })

  describe('proposalResultReport', () => {
    it('skip if proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xTxHash',
        address: '0xplugin-address',
        blockNumber: 100,
        network: NetworksEnum.ethereumSepolia,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          stageId: 2n,
          body: '0xSubPluginAddress',
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.proposalResultReport(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Proposal not found' as any)).to.be.true
    })

    it('getBodyResult returns null', async () => {
      const info: ILogInfo = {
        transactionHash: '0xTxHash',
        address: '0xplugin-address',
        blockNumber: 100,
        network: NetworksEnum.ethereumSepolia,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          stageId: 2n,
          body: '0xSubPluginAddress',
        },
      }

      const proposal = {
        _id: 'proposal-id',
        pluginAddress: '0xplugin-address',
        network: 'ethereumMainnet',
      }

      const errorStub = sandbox.stub(logger, 'error')

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(ProposalHelper, 'getBodyResult').resolves(null)
      const updateOneStub = sandbox.stub(Models.Proposal, 'updateOne')

      await ProposalHandler.proposalResultReport(fakeEvent as any, info)

      expect(errorStub.calledOnceWith('Error reportProposalResult' as any)).to.be.true
      expect(updateOneStub.called).to.be.false
    })

    it('should update proposal with ResultType', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
      })

      const info: ILogInfo = {
        transactionHash: '0xTxHash',
        address: proposal.pluginAddress,
        blockNumber: 100,
        network: proposal.network,
        eventName: 'ProposalResultReported',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
          stageId: 2n,
          body: '0xSubPluginAddress',
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({ interfaceType: IPluginInterfaceType.spp })
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(ProposalHelper, 'getBodyResult').resolves(IReportResultType.Approval)
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalResultReport(fakeEvent as any, info)

      const reloadProposal = await proposal.reload()
      expect(reloadProposal.results[0].resultType).to.be.eq(IReportResultType.Approval)
      expect(reloadProposal.results[0].pluginAddress).to.be.eq(fakeEvent.args.body)
      expect(reloadProposal.results[0].transactionHash).to.be.eq(info.transactionHash)
      expect(reloadProposal.results[0].blockNumber).to.be.eq(info.blockNumber)
      expect(verboseLoggerStub.calledOnceWith('Updated proposal - result report' as any)).to.be.true
    })

    it('should skip if duplicate data is already in externalBodyResults', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        results: [
          {
            pluginAddress: '0xSubPluginAddress',
            resultType: IReportResultType.Approval,
            transactionHash: '0xTxHash',
            stage: 0,
            blockNumber: 100,
          },
        ],
      })

      const info: ILogInfo = {
        transactionHash: '0xTxHash',
        address: proposal.pluginAddress,
        blockNumber: 100,
        network: proposal.network,
        eventName: 'ProposalResultReported',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
          stageId: 0,
          body: '0xSubPluginAddress',
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({ interfaceType: IPluginInterfaceType.spp })
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(ProposalHelper, 'getBodyResult').resolves(IReportResultType.Approval)
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalResultReport(fakeEvent as any, info)

      const reloadProposal = await proposal.reload()

      expect(reloadProposal.results).to.have.lengthOf(1)
      expect(verboseLoggerStub.calledOnceWith('Proposal result already exists, skipping update' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xTxHash',
        address: '0xplugin-address',
        blockNumber: 100,
        network: NetworksEnum.ethereumSepolia,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          stageId: 2n,
          body: '0xSubPluginAddress',
        },
      }

      const error = new Error('Database error')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(error)
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalResultReport(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error reportProposalResult' as any)).to.be.true
    })
  })

  describe('approved', () => {
    it('should return when plugin is not supported', async () => {
      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0x1111111111111111111111111111111111111111',
        },
      }

      const plugin = {
        address: '0xplugin-address',
        network,
        interfaceType: IPluginInterfaceType.admin,
        isSupported: false,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.approved(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('Approved - Plugin not supported' as any)).to.be.true
    })

    it('should handle approved event', async () => {
      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0x1111111111111111111111111111111111111111',
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        network,
        proposalIndex: '1',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)

      const updateActivityStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Stub MemberGovernanceFactory.create to return a governance mock
      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceMock as any)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.approved(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        network,
        transactionHash: info.transactionHash,
        proposalIndex: '1',
      })

      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq('0x1111111111111111111111111111111111111111')
      expect(savedVote.pluginAddress).to.eq('0xplugin-address')
      expect(savedVote.proposalIndex).to.eq('1')
      expect(savedVote.blockNumber).to.eq(10)
      expect(savedVote.blockTimestamp).to.eq(1700000000)

      expect(updateActivityStub.calledOnceWith('0x1111111111111111111111111111111111111111', 10)).to.be.true

      // Check that governance updatePluginMetrics was called
      expect(governanceMock.updatePluginMetrics.calledOnce).to.be.true
      expect(
        governanceMock.updatePluginMetrics.calledWith({
          memberAddress: '0x1111111111111111111111111111111111111111',
          pluginAddress: '0xplugin-address',
          network,
          daoAddress: '0xdao-address',
          lastActivity: 10,
        }),
      ).to.be.true
      expect(governanceMock.updateDaoMetrics.calledOnce).to.be.true

      // 2 calls: existing proposalMultisigMetrics publish + new telegram-notifications publish
      expect(rabbitMQStub.calledTwice).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Created new document - New Vote - Approved' as any)).to.be.true
    })

    it('should return early and log warning when plugin does not exist', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'approved',
        transactionIndex: 1,
        logIndex: 1,
      }

      const fakeEvent = {
        args: {
          approver: '0xapprover',
          proposalId: 1n,
        },
      }

      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(stubFindPlugin.calledOnceWith(info.address, info.network)).to.be.true
      expect(stubLogger.calledOnceWith('Approved - Plugin not found' as any)).to.be.true
    })

    it('should return early when existingLog exists and not call createDocument', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'approved',
        transactionIndex: 1,
        logIndex: 1,
      }

      const fakeEvent = {
        args: {
          approver: '0xapprover',
          proposalId: 1n,
        },
      }

      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves({ isSupported: true } as any)
      const stubFindProposal = sandbox
        .stub(Models.Proposal, 'findByProposalIndex')
        .resolves({ daoAddress: '0xdao-address' } as any)
      const stubFindExistingLog = sandbox.stub(Models.Vote, 'findExistingLog').resolves(true)
      const stubCreateDocument = sandbox.stub(DbOperations, 'createDocument')

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(stubFindPlugin.calledOnceWith(info.address, info.network)).to.be.true
      expect(stubFindProposal.calledOnceWith('1', info.address, info.network)).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubCreateDocument.notCalled).to.be.true // Ensure createDocument is never called
    })

    it('should log a warning if the proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0x1111111111111111111111111111111111111111',
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)

      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.approved(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('Approved - Proposal not found' as any)).to.be.true
    })

    it('should return early when existingLog exists and not call createDocument', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'approved',
        transactionIndex: 1,
        logIndex: 1,
      }

      const fakeEvent = {
        args: {
          approver: '0xapprover',
          proposalId: 1n,
        },
      }

      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves({ isSupported: true } as any)
      const stubFindProposal = sandbox
        .stub(Models.Proposal, 'findByProposalIndex')
        .resolves({ daoAddress: '0xdao-address' } as any)
      const stubFindExistingLog = sandbox.stub(Models.Vote, 'findExistingLog').resolves(true)
      const stubCreateDocument = sandbox.stub(DbOperations, 'createDocument')

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(stubFindPlugin.calledOnceWith(info.address, info.network)).to.be.true
      expect(stubFindProposal.calledOnceWith('1', info.address, info.network)).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubCreateDocument.notCalled).to.be.true // Ensure createDocument is never called
    })

    it('should log a warning if the proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0x1111111111111111111111111111111111111111',
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)

      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.approved(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('Approved - Proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0x1111111111111111111111111111111111111111',
        },
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error Approved Proposal' as any)).to.be.true
    })
  })

  describe('objectionCast', () => {
    const makeInfo = (): ILogInfo => ({
      transactionHash: '0xObjectionTx',
      address: '0xobjection-address',
      blockNumber: 200,
      network,
      eventName: 'objectionCast',
      transactionIndex: 1,
      logIndex: 2,
    })

    const makeEvent = (fromVoteOption: bigint) => ({
      args: {
        proposalId: 1n,
        voter: '0xVoter',
        fromVoteOption,
        votingPower: 400n,
      },
    })

    it('should record the source option on the voter vote row and queue metrics', async () => {
      const existingVote = { id: 'vote-1' }
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(existingVote as any)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves(existingVote as any)
      const rabbitStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.objectionCast(makeEvent(2n) as any, makeInfo())

      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.args[0][0]).to.eq(existingVote)
      expect(updateStub.args[0][1]).to.deep.eq({ objectionFromVoteOption: 2 })
      expect(rabbitStub.calledOnce).to.be.true
    })

    it('should not queue metrics when recording the source option fails', async () => {
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves({ id: 'vote-1' } as any)
      sandbox.stub(DbOperations, 'updateDocument').resolves(null)
      const rabbitStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.objectionCast(makeEvent(2n) as any, makeInfo())

      expect(rabbitStub.notCalled).to.be.true
    })

    it('should log an error and skip when the vote row does not exist', async () => {
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument')
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.objectionCast(makeEvent(1n) as any, makeInfo())

      expect(errorStub.calledOnceWith('ObjectionCast - vote not found' as any)).to.be.true
      expect(updateStub.notCalled).to.be.true
    })
  })

  describe('voteCast', () => {
    it('should defer proposal metrics to ObjectionCast for objection votes', async () => {
      const info: ILogInfo = {
        transactionHash: '0xObjectionVoteTx',
        address: '0xobjection-address',
        blockNumber: 10,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }
      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 3n,
          votingPower: 400n,
        },
      }
      const plugin = {
        address: info.address,
        daoAddress: '0xdao-address',
        network,
        isSupported: true,
        isObjection: true,
      }
      const proposal = {
        daoAddress: plugin.daoAddress,
        settings: {},
        network,
        proposalIndex: '1',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns({
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      } as any)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(TelegramNotifier, 'publish').resolves()
      const rabbitStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(rabbitStub.notCalled).to.be.true
    })

    it('should handle voteCast and save a new vote', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 2n,
          votingPower: 1000n,
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '1',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const updateActivityStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Stub MemberGovernanceFactory.create to return a governance mock
      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceMock as any)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        network,
        transactionHash: info.transactionHash,
        proposalIndex: '1',
      })

      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq('0x2222222222222222222222222222222222222222')
      expect(savedVote.pluginAddress).to.eq('0xplugin-address')
      expect(savedVote.voteOption).to.eq(2)
      expect(savedVote.votingPower).to.eq('1000')
      expect(savedVote.blockTimestamp).to.eq(1700000000)

      expect(proxyTokenStub.calledOnceWith('0xtoken-address', network)).to.be.true
      expect(updateActivityStub.calledOnceWith('0x2222222222222222222222222222222222222222', 10)).to.be.true

      // Check that governance updatePluginMetrics was called
      expect(governanceMock.updatePluginMetrics.calledOnce).to.be.true
      expect(
        governanceMock.updatePluginMetrics.calledWith({
          memberAddress: '0x2222222222222222222222222222222222222222',
          pluginAddress: '0xplugin-address',
          network,
          daoAddress: '0xdao-address',
          lastActivity: 10,
        }),
      ).to.be.true
      expect(governanceMock.updateDaoMetrics.calledOnce).to.be.true

      // 2 calls: existing proposalTokenVotingMetrics publish + new telegram-notifications publish
      expect(rabbitMQStub.calledTwice).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Created new document - New Vote - VoteCast' as any)).to.be.true
    })

    it('should handle replacing an existing vote', async () => {
      const info: ILogInfo = {
        transactionHash: '0xReplaceVoteTx',
        address: '0xplugin-address',
        blockNumber: 15,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 2n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 3n,
          votingPower: 500n,
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '2',
      }

      const existingVote = {
        transactionHash: '0xOldTx',
        proposalIndex: '2',
        deleteOne: sandbox.stub().resolves(),
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken-address',
        isSupported: true,
      }

      // Create governance mock with the methods we need
      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }

      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress')
      findByAddressStub.onFirstCall().resolves(plugin as any) // First call in voteCast main check
      findByAddressStub.onSecondCall().resolves(plugin as any) // Second call for updating metrics

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(existingVote as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const createStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(governanceMock as any)
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        transactionHash: info.transactionHash,
        proposalIndex: '2',
      })

      expect(savedVote).to.exist
      expect(savedVote.replacedTransactionHash).to.eq('0xOldTx')
      expect(existingVote.deleteOne.calledOnce).to.be.true

      expect(proxyTokenStub.calledOnceWith('0xtoken-address', network)).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledWith(fakeEvent.args.voter, info.blockNumber)).to.be.true

      // Check MemberGovernanceFactory.create was called with correct params
      expect(createStub.calledOnce).to.be.true
      expect(createStub.calledWith(plugin)).to.be.true

      // Check that updatePluginMetrics was called with correct params
      expect(governanceMock.updatePluginMetrics.calledOnce).to.be.true
      expect(
        governanceMock.updatePluginMetrics.calledWith({
          memberAddress: fakeEvent.args.voter,
          pluginAddress: '0xplugin-address',
          network,
          daoAddress: '0xdao-address',
          lastActivity: 15,
        }),
      ).to.be.true

      // Check that updateDaoMetrics was called
      expect(governanceMock.updateDaoMetrics.calledOnce).to.be.true

      expect(verboseLoggerStub.calledOnceWith('Created new document - Replace Vote - VoteCast' as any)).to.be.true
    })

    it('should log a warning if the plugin is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xMissingPluginTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 3n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 1n,
          votingPower: 200n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCast - Plugin not found' as any)).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xMissingProposalTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 3n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 1n,
          votingPower: 200n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCast - Proposal not found' as any)).to.be.true
    })

    it('should log a warning if the plugin is not supported with missing token', async () => {
      const info: ILogInfo = {
        transactionHash: '0xMissingProposalTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 3n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 1n,
          votingPower: 200n,
        },
      }

      sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ ...PluginList[0], tokenAddress: null, isSupported: false } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(true)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.voteCast(fakeEvent as any, info)
      expect(warnLoggerStub.calledOnceWith('VoteCast - plugin not supported' as any)).to.be.true
    })

    it('should return early when existingLog exists and not create a new vote', async () => {
      const info: ILogInfo = {
        transactionHash: '0xExistingVoteTx',
        address: '0xplugin-address',
        blockNumber: 25,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 5n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 2n,
          votingPower: 400n,
        },
      }

      const plugin = {
        isSupported: true,
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '5',
      }

      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      const stubFindProposal = sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      const stubFindExistingLog = sandbox.stub(Models.Vote, 'findExistingLog').resolves(true)
      const stubCreateVote = sandbox.stub(Models.Vote, 'create')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(stubFindPlugin.calledOnceWith(info.address, info.network)).to.be.true
      expect(stubFindProposal.calledOnceWith('5', info.address, info.network)).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubCreateVote.notCalled).to.be.true // Ensure createDocument is never called
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xErrorTx',
        address: '0xplugin-address',
        blockNumber: 30,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 4n,
          voter: '0x2222222222222222222222222222222222222222',
          voteOption: 2n,
          votingPower: 300n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error VoteCast Proposal' as any)).to.be.true
    })

    it('should handle voteCast for lockToVote proposal without tokenAddress', async () => {
      const info: ILogInfo = {
        transactionHash: '0xLockToVoteTx',
        address: '0xplugin-address',
        blockNumber: 30,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 10n,
          voter: '0x3333333333333333333333333333333333333333',
          voteOption: 1n,
          votingPower: 750n,
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: {
          // No tokenAddress for lockToVote
          minApprovals: 3,
          votingMode: 1,
        },
        network,
        proposalIndex: '10',
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.lockToVote,
        isSupported: true,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1900000000)

      // ProxyToken.saveAndGetToken should NOT be called for lockToVote
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')

      const updateActivityStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceMock as any)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        network,
        transactionHash: info.transactionHash,
        proposalIndex: '10',
      })

      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq('0x3333333333333333333333333333333333333333')
      expect(savedVote.pluginAddress).to.eq('0xplugin-address')
      expect(savedVote.voteOption).to.eq(1)
      expect(savedVote.votingPower).to.eq('750')
      expect(savedVote.blockTimestamp).to.eq(1900000000)
      expect(savedVote.tokenAddress).to.be.null // No tokenAddress for lockToVote

      // ProxyToken.saveAndGetToken should NOT have been called
      expect(proxyTokenStub.called).to.be.false

      expect(updateActivityStub.calledOnceWith('0x3333333333333333333333333333333333333333', 30)).to.be.true
      expect(governanceMock.updatePluginMetrics.calledOnce).to.be.true
      expect(governanceMock.updateDaoMetrics.calledOnce).to.be.true
      // 2 calls: existing proposalTokenVotingMetrics publish + new telegram-notifications publish
      expect(rabbitMQStub.calledTwice).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Created new document - New Vote - VoteCast' as any)).to.be.true
    })

    it('should call ProxyToken.saveAndGetToken only when tokenAddress exists in proposal settings', async () => {
      const info: ILogInfo = {
        transactionHash: '0xTokenVoteTx',
        address: '0xplugin-address',
        blockNumber: 35,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 11n,
          voter: '0x4444444444444444444444444444444444444444',
          voteOption: 2n,
          votingPower: 1500n,
        },
      }

      const proposalWithToken = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '11',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposalWithToken as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(2000000000)

      // ProxyToken.saveAndGetToken SHOULD be called when tokenAddress exists
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const governanceMock = {
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceMock as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      // ProxyToken.saveAndGetToken SHOULD have been called with the token address
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xtoken-address', network)).to.be.true
    })
  })

  describe('overrideVoteCast', () => {
    const delegateeAddress = '0x3333333333333333333333333333333333333333'

    const makeInfo = (overrides: Partial<ILogInfo> = {}): ILogInfo => ({
      transactionHash: '0xOverrideTx',
      address: '0xplugin-address',
      blockNumber: 20,
      network,
      eventName: 'overrideVoteCast',
      transactionIndex: 1,
      logIndex: 2,
      ...overrides,
    })

    const makeEvent = (delegateeVotingPower: bigint, delegateeVoteOption: bigint) => ({
      args: {
        proposalId: 1n,
        voter: '0x2222222222222222222222222222222222222222',
        delegatee: delegateeAddress,
        reclaimedVotingPower: 0n,
        delegateeVotingPower,
        delegateeVoteOption,
      },
    })

    const createDelegateeVote = async () =>
      Models.Vote.create({
        network,
        transactionHash: '0xDelegateeVoteTx',
        transactionIndex: 0,
        logIndex: 1,
        blockNumber: 10,
        daoAddress: '0xdao-address',
        pluginAddress: '0xplugin-address',
        memberAddress: delegateeAddress,
        proposalIndex: '1',
        voteOption: 3,
        votingPower: '1500',
      })

    const stubPluginAndProposal = () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox
        .stub(Models.Proposal, 'findByProposalIndex')
        .resolves({ daoAddress: '0xdao-address', network, proposalIndex: '1' } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
    }

    it('should leave override metadata unset until an override occurs', async () => {
      const delegateeVote = await createDelegateeVote()

      expect(delegateeVote.voteOverridden).to.be.undefined
    })

    it('should set the delegatee vote to the remaining values on partial override', async () => {
      await createDelegateeVote()
      stubPluginAndProposal()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())

      const delegateeVote = await Models.Vote.findOne({ network, memberAddress: delegateeAddress })
      expect(delegateeVote.votingPower).to.eq('500')
      expect(delegateeVote.voteOption).to.eq(3)
      expect(delegateeVote.voteOverridden.status).to.be.true
      expect(delegateeVote.voteOverridden.transactionHash).to.eq('0xOverrideTx')
      expect(delegateeVote.voteOverridden.blockNumber).to.eq(20)
      expect(delegateeVote.voteOverridden.blockTimestamp).to.eq(1700000000)
      expect(delegateeVote.voteOverridden.transactionIndex).to.eq(1)
      expect(delegateeVote.voteOverridden.logIndex).to.eq(2)

      expect(rabbitMQStub.calledOnce).to.be.true
      expect(
        rabbitMQStub.calledWith(EnumQueueName.proposalTokenVotingMetrics, {
          id: '1-0xplugin-address',
          params: { proposalIndex: '1', pluginAddress: '0xplugin-address', network },
        }),
      ).to.be.true
    })

    it('should keep the delegatee vote record with zero power on full override', async () => {
      await createDelegateeVote()
      stubPluginAndProposal()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.overrideVoteCast(makeEvent(0n, 0n) as any, makeInfo())

      const delegateeVote = await Models.Vote.findOne({ network, memberAddress: delegateeAddress })
      expect(delegateeVote).to.exist
      expect(delegateeVote.votingPower).to.eq('0')
      expect(delegateeVote.voteOption).to.eq(0)
      expect(delegateeVote.voteOverridden.status).to.be.true
    })

    it('should be idempotent when the same override event is applied twice', async () => {
      await createDelegateeVote()
      stubPluginAndProposal()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())
      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())

      const delegateeVotes = await Models.Vote.find({ network, memberAddress: delegateeAddress })
      expect(delegateeVotes).to.have.length(1)
      expect(delegateeVotes[0].votingPower).to.eq('500')
      expect(delegateeVotes[0].voteOption).to.eq(3)
      expect(delegateeVotes[0].voteOverridden.status).to.be.true
    })

    it('should ignore an older override event from the same block', async () => {
      await createDelegateeVote()
      stubPluginAndProposal()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo({ blockNumber: 20, logIndex: 2 }))
      await ProposalHandler.overrideVoteCast(makeEvent(1000n, 1n) as any, makeInfo({ blockNumber: 20, logIndex: 1 }))

      const delegateeVote = await Models.Vote.findOne({ network, memberAddress: delegateeAddress })
      expect(delegateeVote.votingPower).to.eq('500')
      expect(delegateeVote.voteOption).to.eq(3)
      expect(delegateeVote.voteOverridden.blockNumber).to.eq(20)
      expect(delegateeVote.voteOverridden.logIndex).to.eq(2)
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(verboseLoggerStub.calledWith('OverrideVoteCast - Ignoring stale or duplicate event' as any)).to.be.true
    })

    it('should no-op when the delegatee has not voted yet', async () => {
      stubPluginAndProposal()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())

      expect(verboseLoggerStub.calledOnceWith('OverrideVoteCast - No delegatee vote to adjust' as any)).to.be.true
      expect(rabbitMQStub.called).to.be.false
    })

    it('should warn when the plugin is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())

      expect(warnLoggerStub.calledOnceWith('OverrideVoteCast - Plugin not found' as any)).to.be.true
    })

    it('should warn when the proposal is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.overrideVoteCast(makeEvent(500n, 3n) as any, makeInfo())

      expect(warnLoggerStub.calledOnceWith('OverrideVoteCast - Proposal not found' as any)).to.be.true
    })
  })

  describe('proposalExecuted', () => {
    it('should update proposal as executed and send dao metrics', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
      })
      const network = proposal.network
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }
      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      const updatedProposal = await Models.Proposal.findByEntityId(proposal.id)

      expect(updatedProposal).to.exist
      expect(updatedProposal.executed.status).to.be.true
      expect(updatedProposal.executed.blockNumber).to.eq(info.blockNumber)
      expect(updatedProposal.executed.transactionHash).to.eq(info.transactionHash)
      expect(updatedProposal.executed.blockTimestamp).to.eq(1800000000)

      // Assets reconcile per-token from the transfer crawl, so no full daoAssets rescan is queued here.
      expect(rabbitMQStub.calledTwice).to.be.true
      expect(rabbitMQStub.calledWith(EnumQueueName.daoAssets)).to.be.false
      expect(
        rabbitMQStub.calledWith(EnumQueueName.daoTransactions, {
          id: proposal.daoAddress,
          params: { daoAddress: proposal.daoAddress, network },
        }),
      ).to.be.true
      expect(
        rabbitMQStub.calledWith(EnumQueueName.daoMetrics, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network },
        }),
      ).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Updated proposal executed' as any)).to.be.true
    })

    it('self-heals an orphaned execution transaction by linking it to the proposal', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        transactionHash: '0xSelfHealTx',
      })
      const network = proposal.network
      const info: ILogInfo = {
        transactionHash: '0xSelfHealTx',
        address: proposal.pluginAddress, // ProposalExecuted is emitted by the plugin
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      } as any
      const fakeEvent = { args: { proposalId: 5n } }

      // DAO `Executed` recorded before the plugin/proposal were indexed → orphan (no pluginAddress)
      const orphan = await Models.Transaction.create({
        transactionHash: '0xSelfHealTx',
        blockNumber: 20,
        network,
        side: ITransactionSide.execution,
        type: ITransactionType.execution,
        fromAddress: proposal.pluginAddress, // actor == plugin
        toAddress: proposal.daoAddress,
        value: '0',
        daoAddress: proposal.daoAddress,
      })
      expect(orphan.pluginAddress).to.be.null

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      const linked = await Models.Transaction.findByEntityId(orphan.id)
      expect(linked.pluginAddress).to.eq(proposal.pluginAddress)
      expect(linked.proposalIndex).to.eq('5')
    })

    it('does not modify an execution that is already linked', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        transactionHash: '0xAlreadyLinkedTx',
      })
      const network = proposal.network
      const info: ILogInfo = {
        transactionHash: '0xAlreadyLinkedTx',
        address: proposal.pluginAddress,
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      } as any
      const fakeEvent = { args: { proposalId: 9n } }

      const linkedExec = await Models.Transaction.create({
        transactionHash: '0xAlreadyLinkedTx',
        blockNumber: 20,
        network,
        side: ITransactionSide.execution,
        type: ITransactionType.execution,
        fromAddress: proposal.pluginAddress,
        toAddress: proposal.daoAddress,
        value: '0',
        daoAddress: proposal.daoAddress,
        pluginAddress: proposal.pluginAddress, // already linked
        proposalIndex: '3',
      })

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      const after = await Models.Transaction.findByEntityId(linkedExec.id)
      expect(after.proposalIndex).to.eq('3') // unchanged, guard prevents clobbering
    })

    it('should handle proposalExecuted when getBlockTimestamp returns 0', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        transactionHash: '0xExecNullTs',
      })
      const info: ILogInfo = {
        transactionHash: '0xExecNullTs',
        address: '0xplugin-address',
        blockNumber: 20,
        network: proposal.network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }
      const fakeEvent = { args: { proposalId: 1n } }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(0)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      const updatedProposal = await Models.Proposal.findByEntityId(proposal.id)
      expect(updatedProposal.executed.status).to.be.true
      expect(updatedProposal.executed.blockTimestamp).to.be.null
    })

    it('should log a warning if the proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('DB Error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error ProposalExecuted' as any)).to.be.true
    })

    it('should do nothing if proposal is already executed', async () => {
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      const executedProposal = {
        id: 'proposal-id',
        daoAddress: '0xdao-address',
        executed: { status: true },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(executedProposal as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(rabbitMQStub.notCalled).to.be.true
    })

    it('should handle DAO upgrade action when proposal contains upgradeToAndCall', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        rawActions: [
          {
            data: '0x4f1ef286000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000',
            to: ProposalList[0].daoAddress,
          },
        ],
      })
      const network = proposal.network
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      } as any
      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const daoRegistryStub = sandbox.stub(DaoRegistryHandler, 'handleVersionUpgrade').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(daoRegistryStub.calledOnceWith(proposal.daoAddress, info)).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Updated proposal executed' as any)).to.be.true
    })
  })

  describe('fetchProposalMetadata', () => {
    it('should fetch and parse proposal metadata', async () => {
      const metadataUri = 'ipfs://test-metadata-uri'

      const fakeIpfsMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
      }

      const parsedMetadata: IProposalMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: {} as any,
      }

      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeIpfsMetadata)
      const parseMetadataStub = sandbox.stub(Web3Utils, 'parseProposalMetadata').returns(parsedMetadata)

      const result = await ProposalHandler.fetchProposalMetadata(metadataUri)

      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.firstCall.args[0]).to.equal(metadataUri)
      expect(fetchMetadataStub.firstCall.args[1]).to.have.property('retries', 2)
      expect(parseMetadataStub.calledOnceWith(fakeIpfsMetadata)).to.be.true
      expect(result).to.deep.equal(parsedMetadata)
    })

    it('should return null if an error occurs while fetching metadata', async () => {
      const metadataUri = 'ipfs://test-metadata-uri'

      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').rejects(new Error('IPFS Error'))
      const parseMetadataStub = sandbox.stub(Web3Utils, 'parseProposalMetadata')

      const result = await ProposalHandler.fetchProposalMetadata(metadataUri)

      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.firstCall.args[0]).to.equal(metadataUri)
      expect(fetchMetadataStub.firstCall.args[1]).to.have.property('retries', 2)
      expect(parseMetadataStub.notCalled).to.be.true
      expect(result).to.be.null
    })
  })

  describe('proposalAdvanced', async () => {
    it('should update parent and sub-proposals correctly on stage advance', async () => {
      // Pre-populate parent proposal
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [],
        stageExecutions: [],
      })

      // Pre-populate sub-proposal
      const subProposal = await Models.Proposal.create({
        ...ProposalList[1],
        executed: { status: false },
        network,
        parentProposal: {
          proposalIndex: parentProposal.proposalIndex,
          pluginAddress: parentProposal.pluginAddress,
        },
      })

      // Link sub-proposal to the parent proposal
      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: subProposal.proposalIndex,
            pluginAddress: subProposal.pluginAddress,
            stageIndex: 1,
            transactionHash: subProposal.transactionHash,
            blockNumber: subProposal.blockNumber,
          },
        },
      })

      // Create plugin with subPlugins configuration
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: [subProposal.pluginAddress] }],
      })

      // Mock event and info
      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      // Stubs
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(logger, 'verbose')

      // Execute the handler
      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      // Validate parent proposal update
      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal).to.exist

      // Check stageExecutions
      expect(updatedParentProposal.stageExecutions).to.have.length(1)
      expect(updatedParentProposal.stageExecutions[0]).to.include({
        stageIndex: 1,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp: 1800000000,
        status: true,
      })

      // Check lastStageTransition and stageIndex
      expect(updatedParentProposal.stageIndex).to.equal(2)
      expect(updatedParentProposal.lastStageTransition).to.equal(1800000000)

      // Validate subProposal update (executed)
      const updatedSubProposal = await Models.Proposal.findById(subProposal._id)
      expect(updatedSubProposal).to.exist

      expect(updatedSubProposal.executed.status).to.be.true
      expect(updatedSubProposal.executed.blockNumber).to.equal(info.blockNumber)
      expect(updatedSubProposal.executed.transactionHash).to.equal(info.transactionHash)

      // Check subProposal parent reference
      expect(updatedSubProposal.parentProposal).to.deep.include({
        proposalIndex: parentProposal.proposalIndex,
        pluginAddress: parentProposal.pluginAddress,
        stageIndex: 2,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
      })

      // Validate subProposals in parent
      expect(updatedParentProposal.subProposals).to.have.length(2) // Original + New
      expect(updatedParentProposal.subProposals[1]).to.include({
        proposalIndex: subProposal.proposalIndex,
        pluginAddress: subProposal.pluginAddress,
        stageIndex: 2,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
      })
    })

    it('should handle proposalAdvanced when stageExecutions is undefined', async () => {
      // Create proposal WITHOUT stageExecutions to cover the || [] fallback
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [],
        // stageExecutions intentionally omitted
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xsubplugin'] }],
      })

      const info = {
        transactionHash: '0xAdvancedNoStageExec',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(false)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      const updated = await Models.Proposal.findById(parentProposal._id)
      expect(updated.stageExecutions).to.have.length(1)
      expect(updated.stageExecutions[0].stageIndex).to.equal(1)
    })

    it('should log a warning when the proposal is not found', async () => {
      const info = {
        transactionHash: '0xTx',
        address: '0xInvalidPlugin',
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 999n, stageId: 2n } }

      const warnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(warnStub.calledOnceWith('Proposal not found' as any)).to.be.true
    })

    it('should skip sub-proposals already executed', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        subProposals: [],
        stageExecutions: [],
        network,
      })

      const executedSubProposal = await Models.Proposal.create({
        ...ProposalList[1],
        executed: { status: true },
        parentProposal: { proposalIndex: parentProposal.proposalIndex },
        network,
      })

      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: executedSubProposal.proposalIndex,
            pluginAddress: executedSubProposal.pluginAddress,
            stageIndex: 1,
          },
        },
      })

      await Models.Plugin.create({
        ...PluginList[0],
        address: parentProposal.pluginAddress,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: [executedSubProposal.pluginAddress] }],
        network,
      })
      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      const updatedSubProposal = await Models.Proposal.findById(executedSubProposal._id)
      expect(updatedSubProposal.executed.status).to.be.true
      expect(updatedSubProposal.executed.transactionHash).to.be.null
      expect(verboseLoggerStub.calledWith('Updated document - Update subProposal with length: 2' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('Updated document - Proposal Updated - lastStageTransition' as any)).to.be
        .true
    })

    it('should return early when stage execution already exists', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        stageExecutions: [
          {
            stageIndex: 1,
            transactionHash: '0xAdvancedTx',
            blockNumber: 500,
            blockTimestamp: 1800000000,
            status: true,
          },
        ],
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      await Models.Proposal.create({
        ...ProposalList[1],
        executed: { status: true },
        parentProposal: { proposalIndex: parentProposal.proposalIndex },
        network,
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
      })

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({
        lastStageTransition: 1800000000,
      } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(updateDocumentStub.callCount).to.be.equal(1)
      expect(updateDocumentStub.args[0][3]).to.be.eq('Update subProposal with length: 1')
      expect(updateDocumentStub.args[0][3]).to.be.not.eq('Proposal Updated - lastStageTransition')
      expect(warnLoggerStub.calledOnceWith('Stage execution already exists in the array' as any)).to.be.true
    })

    it('should log a warning and return when subProposalDb is not found', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [
          {
            proposalIndex: '999', // Non-existing subProposal
            pluginAddress: '0xNonExistentPlugin',
            stageIndex: 1,
            transactionHash: '0xTxHash',
            blockNumber: 500,
          },
        ],
        stageExecutions: [],
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xNonExistentPlugin'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      // Stubbing to return parentProposal but NOT the subProposal
      sandbox.stub(Models.Proposal, 'findByProposalIndex').callsFake(async (proposalIndex, pluginAddress) => {
        if (pluginAddress === parentProposal.pluginAddress) {
          return parentProposal as any // Return parent proposal correctly
        }
        return null // Simulate missing subProposalDb
      })

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorStub.calledOnceWith('Error Sub Proposal not not found' as any)).to.be.true
      expect(warnLoggerStub.calledOnceWith('Sub proposal not found' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('Updated document - Proposal Updated - lastStageTransition' as any)).to.be
        .true
    })

    it('should log an error and continue execution when subProposalDb is not found', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [],
        stageExecutions: [],
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xMissingSubPlugin'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').callsFake(async (proposalIndex, pluginAddress) => {
        if (pluginAddress === parentProposal.pluginAddress) {
          return parentProposal as any // Return parent proposal correctly
        }
        return null // Simulate missing subProposalDb
      })

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1) // Simulated valid subProposalIndex
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)

      const errorLoggerStub = sandbox.stub(logger, 'error')

      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error Sub Proposal not not found' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('Updated document - Proposal Updated - lastStageTransition' as any)).to.be
        .true
    })

    it('should return early and not update executed subProposal', async () => {
      const executedSubProposal = await Models.Proposal.create({
        ...ProposalList[1],
        proposalIndex: '999',
        pluginAddress: '0xSubPluginAddress',
        network,
        executed: { status: true },
      })

      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [
          {
            proposalIndex: executedSubProposal.proposalIndex,
            pluginAddress: executedSubProposal.pluginAddress,
            stageIndex: 1,
            transactionHash: '0xTxHash',
            blockNumber: 500,
          },
        ],
        stageExecutions: [],
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xSubPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)

      sandbox.stub(Models.Proposal, 'findByProposalIndex').callsFake(async (proposalIndex, pluginAddress) => {
        if (pluginAddress === parentProposal.pluginAddress) {
          return parentProposal as any // Return the parent proposal
        }
        if (pluginAddress === executedSubProposal.pluginAddress) {
          return executedSubProposal as any // Return the already executed sub-proposal
        }
        return null
      })

      sandbox.stub(logger, 'error')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(verboseLoggerStub.calledWith('Updated document - Proposal Executed - Sub Proposal' as any)).to.be.false
      expect(updateDocumentStub.args[0][3]).to.be.not.eq('Proposal Executed - Sub Proposal')
    })

    it('should log an error when subPlugins are missing for the stage', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        subProposals: [],
        stageExecutions: [],
        network,
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: ProposalList[0].proposalIndex, stageId: 2n } }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledWithMatch('Error SPP Proposal index not found' as any)).to.be.false
    })

    it('should log a warning if the sub-proposal already exists', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [],
        stageExecutions: [],
      })
      const subProposal = await Models.Proposal.create({
        ...(ProposalList[1] as any),
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network,
        executed: { status: false },
      })

      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: subProposal.proposalIndex,
            stageIndex: 2,
            pluginAddress: subProposal.pluginAddress,
            transactionHash: '0xAdvancedTx',
            blockNumber: 500,
          },
        },
      })

      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        network,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({
        lastStageTransition: 1800000000,
      } as any)

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Sub-proposal already exists in the array' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('Updated document - Proposal Updated - lastStageTransition' as any)).to.be
        .true

      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal.subProposals).to.have.length(1)
    })

    it('should log an error when ProposalHelper.getSppSubPluginProposals fails', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        subProposals: [],
      })

      await Models.Plugin.create({
        ...PluginList[0],
        isSupported: true,
        network,
        address: parentProposal.pluginAddress,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(0)
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledWithMatch('Error SPP Proposal index not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const info = {
        transactionHash: '0xAdvancedTx',
        address: '0xPluginAddress',
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('Unexpected Error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error ProposalAdvanced' as any)).to.be.true
    })
  })

  describe('handleStartEndDate', () => {
    it('should return startDate and endDate from ProposalHelper response', async () => {
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: {
          startDate: 1000n,
          endDate: 2000n,
        },
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 1000, endDate: 2000 })
      expect(
        stubProposal.calledOnceWith({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if response is undefined', async () => {
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(undefined)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWith({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if parameters are undefined', async () => {
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: undefined,
      }

      // Stub ProposalHelper.getProposal
      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWith({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if startDate and endDate are missing', async () => {
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: {},
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWith({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })
  })

  describe('parseActions', () => {
    it('should return an empty array if rawActions is empty', async () => {
      const proposal = { rawActions: [] } as any
      const updateDocumentSpy = sandbox.spy(DbOperations, 'updateDocument')

      const result = await ProposalHandler.parseActions(proposal)
      expect(result).to.deep.equal([])
      expect(updateDocumentSpy.notCalled).to.be.true
    })

    it('should call decodeData for actions with data length >= 10 and decodeTransfer otherwise', async () => {
      const decodeDataStub = sandbox
        .stub(DecodeActions.prototype, 'decodeData')
        .resolves({ decoded: 'decodedData' } as any)
      const decodeTransferStub = sandbox
        .stub(DecodeActions.prototype, 'decodeTransfer')
        .resolves({ decoded: 'decodedTransfer' } as any)
      const updateDocumentSpy = sandbox.spy(DbOperations, 'updateDocument')
      sandbox.stub(logger, 'verbose')

      const fakeProposal = await Models.Proposal.create({
        ...ProposalList[0],
        ...{
          id: 'proposal-id',
          rawActions: [
            { data: '0x1234567890abcdef', to: '0xAddress1', value: 100 }, // should call decodeData
            { data: '0xshort', to: '0xAddress2', value: 50 }, // should call decodeTransfer
            { data: null, to: '0xAddress3', value: 0 }, // should call decodeTransfer
          ],
        },
      })

      const result = await ProposalHandler.parseActions(fakeProposal as any)

      expect(decodeDataStub.calledOnceWith(fakeProposal?.rawActions[0] as any, fakeProposal as any)).to.be.true

      expect(decodeTransferStub.calledTwice).to.be.true
      expect(decodeTransferStub.firstCall.calledWithExactly(fakeProposal.rawActions[1] as any, fakeProposal as any)).to
        .be.true
      expect(decodeTransferStub.secondCall.calledWithExactly(fakeProposal.rawActions[2] as any, fakeProposal as any)).to
        .be.true

      expect(
        updateDocumentSpy.calledOnceWith(
          fakeProposal,
          {
            decoding: false,
            actions: [
              { decoded: 'decodedData' }, // From decodeData
              { decoded: 'decodedTransfer' }, // From decodeTransfer
              { decoded: 'decodedTransfer' }, // From decodeTransfer
            ],
          },
          { logId: fakeProposal.id },
          'Update proposalAction',
          sandbox.match.any,
        ),
      ).to.be.true

      expect(result).to.exist
    })

    it('should return an empty array when decodeData fails', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const info = {
        transactionHash: '0xProposalEditTx',
        address: proposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
          metadata: 'ipfs://metadata-uri',
          actions: [
            { to: '0xAction1', value: 0n, data: '0xShortData' }, // Should trigger decodeTransfer
            { to: '0xAction2', value: 0n, data: '0xValidLongDataWithNoDecodeResult' }, // Should trigger decodeData
          ],
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://metadata-uri')
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({
        title: 'Updated Title',
        description: 'Updated Description',
        summary: 'Updated Summary',
        resources: [],
        media: {},
      } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)

      const decodeActionsInstance = new DecodeActions()
      sandbox.stub(decodeActionsInstance, 'decodeData').resolves(null) // Simulating decode failure
      sandbox.stub(decodeActionsInstance, 'decodeTransfer').resolves(null) // Simulating decode failure
      sandbox.stub(DecodeActions.prototype, 'decodeData').resolves(null)
      sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves(null)

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      const refreshProposal = await proposal.reload()
      expect(refreshProposal.actions).to.deep.equal([[], []])
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xErrorTx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 2,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          metadata: 'ipfs://metadata-uri',
        },
      }

      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Unexpected Error'))

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error proposalEdited' as any)).to.be.true
    })

    it('should log error when parseActions throws an error', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        id: 'proposal-with-error',
        rawActions: [{ data: '0x1234567890abcdef', to: '0xAddress1', value: 100 }],
      })

      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(DecodeActions.prototype, 'decodeData').throws(new Error('Decode failed'))

      await ProposalHandler.parseActions(proposal as any)

      expect(errorLoggerStub.calledWith('Error parseActions' as any)).to.be.true
    })

    it('should return empty array when decodeData and decodeTransfer return null', async () => {
      const decodeDataStub = sandbox.stub(DecodeActions.prototype, 'decodeData').resolves(null)
      const decodeTransferStub = sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves(null)

      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        id: 'proposal-null-decode',
        rawActions: [
          { data: '0x1234567890abcdef', to: '0xAddress1', value: 100 }, // should call decodeData (returns null)
          { data: '0xshort', to: '0xAddress2', value: 50 }, // should call decodeTransfer (returns null)
        ],
      })

      const result = await ProposalHandler.parseActions(proposal as any)

      expect(decodeDataStub.calledOnce).to.be.true
      expect(decodeTransferStub.calledOnce).to.be.true

      // When decode functions return null, empty arrays should be returned
      expect(result.actions).to.deep.equal([[], []])
    })

    it('should warn when proposal not found in proposalEdited', async () => {
      const info: ILogInfo = {
        transactionHash: '0xNotFoundTx',
        address: '0xplugin-address',
        blockNumber: 200,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 3,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 999n,
          metadata: 'ipfs://metadata-uri',
          actions: [],
        },
      }

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      expect(warnLoggerStub.calledWith('Proposal not found' as any)).to.be.true
    })

    it('should handle proposalEdited with decodeTransfer for short data', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const info = {
        transactionHash: '0xProposalEditTx',
        address: proposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
          metadata: 'ipfs://metadata-uri',
          actions: [
            { to: '0xAction1', value: 0n, data: '0xShort' }, // data.length < 10, should trigger decodeTransfer
          ],
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://metadata-uri')
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({
        title: 'Updated Title',
        description: 'Updated Description',
        summary: 'Updated Summary',
        resources: [],
        media: {},
      } as any)

      const decodeTransferStub = sandbox
        .stub(DecodeActions.prototype, 'decodeTransfer')
        .resolves({ decoded: 'transferData' } as any)

      const decodeDataStub = sandbox.stub(DecodeActions.prototype, 'decodeData')

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      // Verify decodeTransfer was called for short data
      expect(decodeTransferStub.calledOnce).to.be.true
      expect(decodeDataStub.notCalled).to.be.true

      const updatedProposal = await Models.Proposal.findOne({ id: proposal.id })
      expect(updatedProposal.editedTxInfo.transactionHash).to.eq('0xProposalEditTx')
      expect(updatedProposal.actions).to.deep.equal([{ decoded: 'transferData' }])
    })

    it('should return empty array when proposalEdited decode returns null', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const info = {
        transactionHash: '0xProposalEditTx',
        address: proposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
          metadata: 'ipfs://metadata-uri',
          actions: [
            { to: '0xAction1', value: 0n, data: '0x1234567890' }, // Will call decodeData
            { to: '0xAction2', value: 0n, data: '0xShort' }, // Will call decodeTransfer
          ],
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://metadata-uri')
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({
        title: 'Updated Title',
        description: 'Updated Description',
        summary: 'Updated Summary',
        resources: [],
        media: {},
      } as any)

      // Both decode methods return null
      sandbox.stub(DecodeActions.prototype, 'decodeData').resolves(null)
      sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves(null)

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      const updatedProposal = await Models.Proposal.findOne({ id: proposal.id })
      expect(updatedProposal.editedTxInfo.transactionHash).to.eq('0xProposalEditTx')
      // When decode returns null, empty arrays should be stored
      expect(updatedProposal.actions).to.deep.equal([[], []])
    })
  })

  describe('pairSppProposals', () => {
    it('should return early if plugin is not SPP and not a subPlugin', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        isSubPlugin: false,
      }

      const info = { transactionHash: '0xTxHash', blockNumber: 100 }
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(updateDocumentStub.called).to.be.false
    })

    it('should update proposal as subProposal when plugin is a subPlugin', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const plugin = {
        isSubPlugin: true,
        stageIndex: 2,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const info = { transactionHash: '0xTxHash', blockNumber: 100 }
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        isSubProposal: true,
        stageIndex: 2,
      })
      expect(updateDocumentStub.firstCall.args[3]).to.equal('Update proposal - Sub Proposal')
    })

    it('should handle SPP plugin and update parent proposal and sub-proposals', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        proposalIndex: '1',
        network,
        pluginAddress: '0xParentPlugin',
        stageIndex: 0,
      })

      const subProposal = await Models.Proposal.create({
        ...ProposalList[1],
        proposalIndex: '2',
        network,
        pluginAddress: '0xSubPluginAddress',
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0xParentPlugin',
        network,
        subPlugins: [{ stageIndex: 0, addresses: ['0xSubPluginAddress'] }],
        isSubPlugin: false,
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      const proposalInfo = {
        currentStage: 1n,
        lastStageTransition: 1700000000n,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves(proposalInfo as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(2)
      sandbox.stub(logger, 'verbose')
      await ProposalHandler.pairSppProposals(parentProposal, plugin as any, info as any)

      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal.isSubProposal).to.be.false
      expect(updatedParentProposal.totalStages).to.equal(3)
      expect(updatedParentProposal.stageIndex).to.equal(0) // max(1-1, 0)
      expect(updatedParentProposal.lastStageTransition).to.equal(1700000000)
      expect(updatedParentProposal.subProposals.length).to.be.eq(1)
      expect(updatedParentProposal.subProposals[0]).to.deep.include({
        proposalIndex: '2',
        pluginAddress: '0xSubPluginAddress',
        transactionHash: '0xTxHash',
        blockNumber: 100,
      })

      const updatedSubProposal = await Models.Proposal.findById(subProposal._id)
      expect(updatedSubProposal.parentProposal).to.deep.include({
        pluginAddress: '0xParentPlugin',
        proposalIndex: '1',
        stageIndex: 0,
        transactionHash: '0xTxHash',
        blockNumber: 100,
      })
    })

    it('should handle SPP plugin with no valid sub-proposals', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        proposalIndex: '1',
        network,
        pluginAddress: '0xParentPlugin',
        stageIndex: 0,
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0xParentPlugin',
        network,
        subPlugins: [{ stageIndex: 0, addresses: ['0xSubPluginAddress'] }],
        isSubPlugin: false,
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      const proposalInfo = {
        currentStage: 1n,
        lastStageTransition: 1700000000n,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves(proposalInfo as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(false) // No valid sub-proposal found
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.pairSppProposals(parentProposal, plugin as any, info as any)

      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal.isSubProposal).to.be.false
      expect(updatedParentProposal.totalStages).to.equal(3)
      expect(updatedParentProposal.stageIndex).to.equal(0)
      expect(updatedParentProposal.lastStageTransition).to.equal(1700000000)
      expect(updatedParentProposal.subProposals.length).to.equal(0) // No sub-proposals should be added
    })

    it('should handle missing proposalInfo correctly', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        proposalIndex: '1',
        network,
        pluginAddress: '0xParentPlugin',
        stageIndex: 0,
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0xParentPlugin',
        network,
        subPlugins: [{ stageIndex: 0, addresses: ['0xSubPluginAddress'] }],
        isSubPlugin: false,
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves(null) // Missing proposalInfo
      const getSppSubPluginProposalsStub = sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(2)
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.pairSppProposals(parentProposal, plugin as any, info as any)

      expect(getSppSubPluginProposalsStub.calledOnce).to.be.false
      expect(errorStub.calledWith('Error ProposalAdvanced - proposalInfo not found...' as any)).to.be.true
    })

    it('should handle error during DB transaction', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        proposalIndex: '1',
        network,
        pluginAddress: '0xParentPlugin',
        stageIndex: 0,
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0xParentPlugin',
        network,
        subPlugins: [{ stageIndex: 0, addresses: ['0xSubPluginAddress'] }],
        isSubPlugin: false,
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves({
        currentStage: 1n,
        lastStageTransition: 1700000000n,
      } as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(2)

      const saveStub = sandbox.stub(Models.Proposal.prototype, 'save').rejects(new Error('DB Error'))
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.pairSppProposals(parentProposal, plugin as any, info as any)

      expect(errorStub.calledWith('Error pairSppProposals' as any)).to.be.true
      expect(saveStub.calledOnce).to.be.true
    })

    it('should handle missing subPlugins gracefully', async () => {
      const parentProposal = await Models.Proposal.create({
        ...ProposalList[0],
        proposalIndex: '1',
        network,
        pluginAddress: '0xParentPlugin',
        stageIndex: 0,
      })

      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0xParentPlugin',
        network,
        subPlugins: [], // Empty subPlugins array
        isSubPlugin: false,
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves({
        currentStage: 1n,
        lastStageTransition: 1700000000n,
      } as any)

      await ProposalHandler.pairSppProposals(parentProposal, plugin as any, info as any)

      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal.isSubProposal).to.be.false
      expect(updatedParentProposal.totalStages).to.equal(3)
      expect(updatedParentProposal.stageIndex).to.equal(0)
      expect(updatedParentProposal.lastStageTransition).to.equal(1700000000)
      expect(updatedParentProposal.subProposals).to.be.an('array').that.is.empty
    })
  })

  describe('proposalCanceled', () => {
    it('should update proposal with cancel transaction info', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
      })

      const info: ILogInfo = {
        transactionHash: '0xCanceledTx',
        address: proposal.pluginAddress,
        blockNumber: 200,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1900000000)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[0]).to.equal(proposal)
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        cancelTxInfo: {
          blockNumber: info.blockNumber,
          transactionHash: info.transactionHash,
          blockTimestamp: 1900000000,
        },
      })
      expect(updateDocumentStub.firstCall.args[2]).to.deep.equal({ logId: proposal.id, info })
      expect(updateDocumentStub.firstCall.args[3]).to.equal('Update proposalCanceled')
    })

    it('should handle proposalCanceled when getBlockTimestamp returns 0', async () => {
      const proposal = await Models.Proposal.create({
        ...ProposalList[0],
        network,
        transactionHash: '0xCanceledNullTs',
      })

      const info: ILogInfo = {
        transactionHash: '0xCanceledNullTs',
        address: proposal.pluginAddress,
        blockNumber: 200,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: proposal.proposalIndex,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(0)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        cancelTxInfo: {
          blockNumber: 200,
          transactionHash: '0xCanceledNullTs',
          blockTimestamp: null,
        },
      })
    })

    it('should log a warning if the proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xCanceledTx',
        address: '0xplugin-address',
        blockNumber: 200,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Proposal not found' as any)).to.be.true
      expect(updateDocumentStub.called).to.be.false
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xCanceledTx',
        address: '0xplugin-address',
        blockNumber: 200,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error proposalCanceled' as any)).to.be.true
    })
  })

  describe('voteCleared', () => {
    it('should clear a vote successfully', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      const mockPlugin = { address: '0xplugin-address', network, isSupported: true }
      const mockProposal = {
        id: 'proposal-id',
        daoAddress: '0xdao-address',
        network,
        proposalIndex: '1',
      }
      const mockVote = {
        id: 'vote-id',
        memberAddress: '0x2222222222222222222222222222222222222222',
        proposalIndex: '1',
      }

      sandbox.stub(Models.Vote, 'exists').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(mockProposal as any)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(mockVote as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1640995200)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        voteCleared: {
          status: true,
          transactionHash: '0xVoteClearedTx',
          blockNumber: 10,
          blockTimestamp: 1640995200,
        },
      })
      // 3 calls: telegram-notifications + proposalTokenVotingMetrics + daoMetrics
      expect(rabbitMQStub.calledThrice).to.be.true
      expect(verboseLoggerStub.calledOnceWith('Vote cleared successfully' as any)).to.be.true
    })

    it('should handle voteCleared when getBlockTimestamp returns 0', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedNullTs',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      const mockPlugin = { address: '0xplugin-address', network, isSupported: true }
      const mockProposal = {
        id: 'proposal-id',
        daoAddress: '0xdao-address',
        network,
        proposalIndex: '1',
      }
      const mockVote = {
        id: 'vote-id',
        memberAddress: '0x2222222222222222222222222222222222222222',
        proposalIndex: '1',
      }

      sandbox.stub(Models.Vote, 'exists').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(mockProposal as any)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(mockVote as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(0)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(logger, 'verbose')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        voteCleared: {
          status: true,
          transactionHash: '0xVoteClearedNullTs',
          blockNumber: 10,
          blockTimestamp: 0,
        },
      })
    })

    it('should return early if log already exists', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      sandbox.stub(Models.Vote, 'exists').resolves({ _id: 'existing-id' } as any)
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(pluginStub.called).to.be.false
      expect(updateDocumentStub.called).to.be.false
    })

    it('should return early if plugin is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      sandbox.stub(Models.Vote, 'exists').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCleared - Plugin not found' as any)).to.be.true
      expect(updateDocumentStub.called).to.be.false
    })

    it('should return early if proposal is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      const mockPlugin = { address: '0xplugin-address', network, isSupported: true }

      sandbox.stub(Models.Vote, 'exists').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCleared - Proposal not found' as any)).to.be.true
      expect(updateDocumentStub.called).to.be.false
    })

    it('should return early if existing vote is not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      const mockPlugin = { address: '0xplugin-address', network, isSupported: true }
      const mockProposal = {
        id: 'proposal-id',
        daoAddress: '0xdao-address',
        network,
        proposalIndex: '1',
      }

      sandbox.stub(Models.Vote, 'exists').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(mockProposal as any)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCleared - Vote not found' as any)).to.be.true
      expect(updateDocumentStub.called).to.be.false
    })

    it('should log an error if an exception occurs', async () => {
      const info: ILogInfo = {
        transactionHash: '0xVoteClearedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'VoteCleared',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0x2222222222222222222222222222222222222222',
        },
      }

      sandbox.stub(Models.Vote, 'exists').rejects(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.voteCleared(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error VoteCleared' as any)).to.be.true
    })
  })
})
