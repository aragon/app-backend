import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import { NetworksEnum, IPluginInterfaceType, IReportResultType } from '@types'
import logger from '@logger'
import ProposalHelper from '@helpers/proposal'

describe.only('Helpers: ProposalHelper', () => {
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
})
