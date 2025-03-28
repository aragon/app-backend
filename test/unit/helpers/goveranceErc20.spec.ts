import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'
import Web3Helper from '@helpers/web3'

describe('Helpers: GovernanceErc20', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getPastVotes', () => {
    it('Should make a successful getPastVotes call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getPastVotesStub = sandbox.stub().resolves(1)
      const getChainAdjustedBlockNumberStub = sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getPastVotes('0x123', '0x123', 1, 2, NetworksEnum.ethereumMainnet)

      expect(getChainAdjustedBlockNumberStub.calledWith(1, NetworksEnum.ethereumMainnet)).to.be.true
      expect(getPastVotesStub.calledWith('0x123', 1)).to.be.true
      expect(result).to.eq('1')
    })

    it('should handle errors in getPastVotes', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getPastVotesStub = sandbox.stub().rejects(expectedResult)
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await MockedGoveranceErc20Helper.getPastVotes('0x123', '0x123', 1, 1, NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0')
      expect(loggerStub.calledTwice).to.be.true
      expect(loggerStub.calledWith('Error getting past votes - blockNumber' as any)).to.be.true
      expect(loggerStub.calledWith('Error getting past votes - blockTimestamp' as any)).to.be.true
    })

    it('should return past votes as a string when call is successful', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const pastVotesStub = sandbox.stub().resolves(10n)
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: pastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getPastVotes('0x123', '0x123', 1, 1, NetworksEnum.ethereumMainnet)

      expect(result).to.eq('10')
      expect(pastVotesStub.calledOnce).to.be.true
    })

    it('should return "0" when getPastVotes fails', async () => {
      const pastVotesStub = sandbox.stub().rejects(new Error('RPC Call Failed'))

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: pastVotesStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await MockedGoveranceErc20Helper.getPastVotes('0x123', '0x123', 1, 1, NetworksEnum.ethereumMainnet)

      expect(result).to.eq('0')
      expect(loggerStub.calledTwice).to.be.true
      expect(loggerStub.calledWithMatch('Error getting past votes - blockNumber' as any)).to.be.true
      expect(loggerStub.calledWithMatch('Error getting past votes - blockTimestamp' as any)).to.be.true
    })

    it('Should getPastVotes using blockTimestamp', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getPastVotesStub = sandbox.stub()
      getPastVotesStub.onFirstCall().resolves(0)
      getPastVotesStub.onSecondCall().resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getPastVotes(
        '0x123',
        '0x123',
        1, // blockNumber
        2, // blockTimestamp
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.eq('1')
    })
  })

  describe('getVotes', () => {
    it('Should make a successful getVotes call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getVotesStub = sandbox.stub().resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getVotes: getVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getVotes('0x123', '0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1)
    })

    it('should handle errors in getVotes', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getVotesStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getVotes: getVotesStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGoveranceErc20Helper.getVotes('0x123', '0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getting votes' as any)).to.be.true
    })
  })

  describe('getPastTotalSupply', () => {
    it('Should make a successful getPastTotalSupply call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getPastTotalSupplyStub = sandbox.stub().resolves(1)
      const getChainAdjustedBlockNumberStub = sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastTotalSupply: getPastTotalSupplyStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getPastTotalSupply(1, '0x123', NetworksEnum.ethereumMainnet)
      expect(getChainAdjustedBlockNumberStub.calledWith(1, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.eq(1)
    })

    it('should handle errors in getPastTotalSupply', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getPastTotalSupplyStub = sandbox.stub().rejects(expectedResult)
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastTotalSupply: getPastTotalSupplyStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGoveranceErc20Helper.getPastTotalSupply(1, '0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getting pastTotalSupply' as any)).to.be.true
    })
  })

  describe('getDelegate', () => {
    it('should return a delegate when the call is successful', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getDelegateStub = sandbox.stub().resolves('0xdeleate')

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { delegates: getDelegateStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGoveranceErc20Helper.getDelegates('0x123', '0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.eq('0xdeleate')
      expect(getDelegateStub.calledOnce).to.be.true
    })

    it('should return zero address when getDelegate fails', async () => {
      const getDelegateStub = sandbox.stub().rejects(new Error('RPC Call Failed'))

      const { default: MockedGoveranceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { delegates: getDelegateStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGoveranceErc20Helper.getDelegates('0x123', '0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWithMatch('Error getting delegate' as any)).to.be.true
    })
  })
})
