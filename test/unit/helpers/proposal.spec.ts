import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import { NetworksEnum, IProposalType } from '@types'
import logger from '@logger'

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
    }

    // Mock ProviderModule.getProvider to return a mocked provider
    sandbox.stub(require('@modules/provider').default, 'getProvider').returns(providerStub)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProposal', () => {
    it('should call getProposalTokenVoting when proposalType is tokenVoting', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        proposalType: IProposalType.tokenVoting,
        network: NetworksEnum.ethereumMainnet,
      }

      const getProposalTokenVotingStub = sandbox.stub().resolves({})
      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return { getProposal: getProposalTokenVotingStub }
          },
        },
      })

      await ProposalHelper.getProposal(mockParams)
      expect(getProposalTokenVotingStub.calledOnce).to.be.true
    })

    it('should call getProposalMultisig when proposalType is multisig', async () => {
      const mockParams = {
        proposalIndex: 1,
        pluginAddress: '0xpluginAddress',
        proposalType: IProposalType.multisig,
        network: NetworksEnum.ethereumMainnet,
      }

      const getProposalMultisigStub = sandbox.stub().resolves({})
      const { default: ProposalHelper } = proxyquire.noCallThru()('@helpers/proposal', {
        '@helpers/retryRequest': {
          retryRequest: (fn: any) => fn(),
        },
        ethers: {
          Contract: function () {
            return { getProposal: getProposalMultisigStub }
          },
        },
      })

      await ProposalHelper.getProposal(mockParams)
      expect(getProposalMultisigStub.calledOnce).to.be.true
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
