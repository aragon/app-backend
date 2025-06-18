import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import config from '@config'
import logger from '@logger'
import { IClockMode, NetworksEnum } from '@types'
import proxyquire from 'proxyquire'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { expect } from 'chai'
import Web3BatchHelper from '@helpers/web3BatchHelper'

describe('Helpers: GovernanceErc20', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getPastVotes', () => {
    it('should get getAverageBlockTime', () => {
      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 10,
        },
      })

      const blockTime = GovernanceErc20Helper.getAverageBlockTime(NetworksEnum.ethereumMainnet, 2)
      expect(blockTime).to.equal(20)
    })

    it('should get getPastVotes with that calls for retries', async () => {
      const _getPastVotesWithRetryStub = sandbox.stub(GovernanceErc20Helper, '_getPastVotesWithRetry').resolves('1000')
      const result = await GovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
      )

      expect(_getPastVotesWithRetryStub.calledOnce).to.be.true
      expect(result).to.equal('1000')
      expect(_getPastVotesWithRetryStub.args[0]).to.deep.equal([
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        { maxRetries: 3, decreasingThreshold: 2 },
      ])
    })

    it('should handle errors in getPastVotes', async () => {
      const expectedResult = new Error('RPC Call Failed')
      sandbox.stub(GovernanceErc20Helper, '_getPastVotesWithRetry').rejects(expectedResult)

      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await GovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getting past votes' as any)).to.be.true
    })

    it('should handle getPastVotesWithRetry', async () => {
      const getMemberVotingPowerStub = sandbox.stub(Web3BatchHelper, 'getMemberVotingPower')
      getMemberVotingPowerStub.onCall(0).resolves({ votingPower: '0', error: true })
      getMemberVotingPowerStub.onCall(1).resolves({ votingPower: '1000', error: false })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 10,
        },
      })

      const result = await GovernanceErc20Helper._getPastVotesWithRetry(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        { maxRetries: 3, decreasingThreshold: 2 },
      )

      expect(getMemberVotingPowerStub.callCount).to.equal(2)
      expect(result).to.equal('1000')
      expect(getMemberVotingPowerStub.args[0]).to.deep.equal([
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
      ])
      expect(getMemberVotingPowerStub.args[1]).to.deep.equal([
        '0x123',
        '0x456',
        12345676,
        1622547800 - 20,
        NetworksEnum.ethereumMainnet,
      ])
    })
  })

  describe('getVotes', () => {
    it('Should make a successful getVotes call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getVotesStub = sandbox.stub().resolves(1)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getVotes: getVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceErc20Helper.getVotes('0x123', '0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1)
    })

    it('should handle errors in getVotes', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getVotesStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getVotes: getVotesStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGovernanceErc20Helper.getVotes('0x123', '0x123', NetworksEnum.ethereumMainnet)
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

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastTotalSupply: getPastTotalSupplyStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceErc20Helper.getPastTotalSupply(1, '0x123', NetworksEnum.ethereumMainnet)
      expect(getChainAdjustedBlockNumberStub.calledWith(1, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.eq(1)
    })

    it('should handle errors in getPastTotalSupply', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getPastTotalSupplyStub = sandbox.stub().rejects(expectedResult)
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(1)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastTotalSupply: getPastTotalSupplyStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGovernanceErc20Helper.getPastTotalSupply(1, '0x123', NetworksEnum.ethereumMainnet)
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

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { delegates: getDelegateStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceErc20Helper.getDelegates('0x123', '0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.eq('0xdeleate')
      expect(getDelegateStub.calledOnce).to.be.true
    })

    it('should return zero address when getDelegate fails', async () => {
      const getDelegateStub = sandbox.stub().rejects(new Error('RPC Call Failed'))

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { delegates: getDelegateStub }
          },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await MockedGovernanceErc20Helper.getDelegates('0x123', '0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWithMatch('Error getting delegate' as any)).to.be.true
    })
  })

  describe('getClockMode', () => {
    it('Should return BlockNumber when CLOCK_MODE returns blockNumber string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const clockModeStub = sandbox.stub().resolves('blocknumber&123')

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { CLOCK_MODE: clockModeStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceErc20Helper.getClockMode('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(IClockMode.BlockNumber)
    })

    it('should return default BlockNumber when CLOCK_MODE fails', async () => {
      const clockModeStub = sandbox.stub().rejects(new Error('RPC Call Failed'))

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { CLOCK_MODE: clockModeStub }
          },
        },
      })

      const result = await MockedGovernanceErc20Helper.getClockMode('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(IClockMode.BlockNumber)
    })

    it('should return Timestamp when CLOCK_MODE returns timestamp string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const clockModeStub = sandbox.stub().resolves('timestamp&123')

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { CLOCK_MODE: clockModeStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceErc20Helper.getClockMode('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(IClockMode.Timestamp)
    })
  })
})
