import { Multisig } from '@artifacts/Multisig'
import { TokenVoting } from '@artifacts/TokenVoting'
import ProposalHelper from '@helpers/proposal'
import logger from '@logger'
import { IPluginInterfaceType, IReportResultType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: ProposalHelper', () => {
  let sandbox: SinonSandbox
  let providerStub: any
  let contractStub: any
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    providerStub = {
      getProposal: sandbox.stub(),
    }
    loggerStub = sandbox.stub(logger, 'error')

    contractStub = {
      getProposal: sandbox.stub(),
      getBodyProposalId: sandbox.stub(),
      getBodyResult: sandbox.stub(),
    }

    sandbox.stub(require('@modules/provider').default, 'getProvider').returns(providerStub)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProposal', () => {
    it('should call getProposalTokenVoting when proposalType is tokenVoting', async () => {
      const mockParams = {
        plugin: {
          address: '0xpluginAddress',
          interfaceType: IPluginInterfaceType.tokenVoting,
        },
        proposalIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const getProposalTokenVotingStub = sandbox.stub(ProposalHelper, 'getProposalTokenVoting').resolves(true as any)

      await ProposalHelper.getProposal(mockParams as any)
      expect(getProposalTokenVotingStub.calledOnce).to.be.true
    })

    it('should call getProposalMultisig when proposalType is multisig', async () => {
      const mockParams = {
        plugin: {
          address: '0xpluginAddress',
          interfaceType: IPluginInterfaceType.multisig,
        },
        proposalIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const getProposalMultisigStub = sandbox.stub(ProposalHelper, 'getProposalMultisig').resolves(true as any)

      await ProposalHelper.getProposal(mockParams as any)
      expect(getProposalMultisigStub.calledOnce).to.be.true
    })

    it('should call getSppSubPluginProposals when proposalType is spp', async () => {
      const mockParams = {
        plugin: {
          address: '0xpluginAddress',
          interfaceType: IPluginInterfaceType.spp,
        },
        proposalIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const getSppSubPluginProposalsStub = sandbox.stub(ProposalHelper, 'getProposalSpp').resolves(true as any)

      await ProposalHelper.getProposal(mockParams as any)
      expect(getSppSubPluginProposalsStub.calledOnce).to.be.true
    })

    it('should return null when plugin has unknown interface type', async () => {
      const mockParams = {
        plugin: {
          address: '0xpluginAddress',
          interfaceType: 'unknown' as any,
        },
        proposalIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const result = await ProposalHelper.getProposal(mockParams as any)
      expect(result).to.be.null
    })
  })

  describe('getBodyResult', () => {
    it('should return Approval when getBodyResult resolves successfully', async () => {
      const mockParams = {
        proposalIndex: '1',
        stage: 1,
        sppPluginAddress: '0xpluginAddress',
        subPluginAddress: '0xsubPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }

      contractStub.getBodyResult.resolves(IReportResultType.Approval)

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getBodyResult(
        mockParams.proposalIndex,
        mockParams.stage,
        mockParams.sppPluginAddress,
        mockParams.subPluginAddress,
        mockParams.network,
      )

      expect(result).to.eq(IReportResultType.Approval)
      expect(contractStub.getBodyResult.calledOnce).to.be.true
    })

    it('should return null and log an error when getBodyResult fails', async () => {
      const mockParams = {
        proposalIndex: '1',
        stage: 1,
        sppPluginAddress: '0xpluginAddress',
        subPluginAddress: '0xsubPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }

      contractStub.getBodyResult.resolves(IReportResultType.Approval).rejects(new Error('Provider failure'))

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getBodyResult(
        mockParams.proposalIndex,
        mockParams.stage,
        mockParams.sppPluginAddress,
        mockParams.subPluginAddress,
        mockParams.network,
      )

      expect(result).to.be.null
      expect(loggerStub.calledOnceWith('Error getting body result SPP')).to.be.true
    })
  })

  describe('getSppSubPluginProposals', () => {
    it('should return the proposal for spp sub plugin', async () => {
      const mockParams = {
        proposalIndex: 1,
        stage: 1,
        pluginAddress: '0xpluginAddress',
        sppPluginAddress: '0xsppPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const mockProposal = { id: 1, title: 'SPP Proposal' }

      contractStub.getBodyProposalId.resolves(mockProposal)

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getSppSubPluginProposals(mockParams)
      expect(result).to.deep.equal(mockProposal)
    })

    it('should return false if spp sub plugin proposal fetch fails', async () => {
      const mockParams = {
        proposalIndex: 1,
        stage: 1,
        pluginAddress: '0xpluginAddress',
        sppPluginAddress: '0xsppPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }

      contractStub.getBodyProposalId.rejects(new Error('Contract call failed'))

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getSppSubPluginProposals(mockParams)
      expect(result).to.be.false
    })
  })

  describe('getProposalTokenVoting', () => {
    it('should return the proposal for token voting', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const mockProposal = { id: 1, title: 'Test Proposal' }

      contractStub.getProposal.resolves(mockProposal)

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getProposalTokenVoting(mockParams)
      expect(result).to.deep.equal(mockProposal)
    })

    it('should return null and log error if token voting proposal fetch fails', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }

      contractStub.getProposal.rejects(new Error('Contract call failed'))

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getProposalTokenVoting(mockParams)
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('getProposalMultisig', () => {
    it('should return the proposal for multisig', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }
      const mockProposal = { id: 1, title: 'Multisig Proposal' }

      contractStub.getProposal.resolves(mockProposal)

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getProposalMultisig(mockParams)
      expect(result).to.deep.equal(mockProposal)
    })

    it('should return null and log error if multisig proposal fetch fails', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        network: NetworksEnum.ethereumMainnet,
      }

      contractStub.getProposal.rejects(new Error('Contract call failed'))

      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
      })

      const result = await ProposalHelper.getProposalMultisig(mockParams)
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('findOutOfOrderProposalEvents', () => {
    const pluginAddress = '0x1111111111111111111111111111111111111111'
    const otherAddress = '0x3333333333333333333333333333333333333333'
    const voter = '0x2222222222222222222222222222222222222222'
    const proposalIndex = '7'
    const multisigIface = new Interface(Multisig.abi)
    const tokenVotingIface = new Interface(TokenVoting.abi)

    const makeLog = (iface: Interface, name: string, args: any[], index: number, address = pluginAddress) => {
      const encoded = iface.encodeEventLog(iface.getEvent(name)!, args)
      return {
        address,
        topics: encoded.topics,
        data: encoded.data,
        index,
        transactionIndex: 1,
        transactionHash: '0xtx',
        blockNumber: 100,
      }
    }

    const infoWith = (logs: any[]): any => ({
      transactionHash: '0xtx',
      address: pluginAddress,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 100,
      transactionIndex: 1,
      logIndex: 10, // ProposalCreated's logIndex
      context: { getLogsByTxHash: sandbox.stub().resolves(logs) },
    })

    it('returns Approved, VoteCast and ProposalExecuted emitted before ProposalCreated (all plugin types)', async () => {
      const logs = [
        makeLog(multisigIface, 'Approved', [7n, voter], 2),
        makeLog(tokenVotingIface, 'VoteCast', [7n, voter, 1, 1000n], 3),
        makeLog(multisigIface, 'ProposalExecuted', [7n], 4),
      ]
      const events = await ProposalHelper.findOutOfOrderProposalEvents(infoWith(logs), pluginAddress, proposalIndex)
      expect(events.map(e => e.kind)).to.have.members(['approved', 'voteCast', 'proposalExecuted'])
      expect(events.every(e => e.parsed.args.proposalId.toString() === proposalIndex)).to.be.true
    })

    it('ignores logs at or after the ProposalCreated logIndex', async () => {
      const logs = [
        makeLog(multisigIface, 'ProposalExecuted', [7n], 10),
        makeLog(multisigIface, 'Approved', [7n, voter], 11),
      ]
      const events = await ProposalHelper.findOutOfOrderProposalEvents(infoWith(logs), pluginAddress, proposalIndex)
      expect(events).to.have.lengthOf(0)
    })

    it('ignores logs from other contracts and non-matching proposalIds', async () => {
      const logs = [
        makeLog(multisigIface, 'Approved', [7n, voter], 2, otherAddress),
        makeLog(multisigIface, 'ProposalExecuted', [999n], 3),
      ]
      const events = await ProposalHelper.findOutOfOrderProposalEvents(infoWith(logs), pluginAddress, proposalIndex)
      expect(events).to.have.lengthOf(0)
    })

    it('matches the plugin address case-insensitively when the provider lowercases log addresses', async () => {
      const logs = [
        makeLog(multisigIface, 'Approved', [7n, voter], 2, pluginAddress.toLowerCase()),
        makeLog(tokenVotingIface, 'VoteCast', [7n, voter, 1, 1000n], 3, pluginAddress.toLowerCase()),
      ]
      const events = await ProposalHelper.findOutOfOrderProposalEvents(infoWith(logs), pluginAddress, proposalIndex)
      expect(events.map(e => e.kind)).to.have.members(['approved', 'voteCast'])
    })

    it('returns empty when info has no context', async () => {
      const events = await ProposalHelper.findOutOfOrderProposalEvents(
        { transactionHash: '0xtx', address: pluginAddress, logIndex: 10 } as any,
        pluginAddress,
        proposalIndex,
      )
      expect(events).to.deep.equal([])
    })
  })
})
