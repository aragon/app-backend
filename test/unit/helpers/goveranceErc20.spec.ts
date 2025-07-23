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
import utils from '@helpers/utils'
import { NetworkHelper } from '@helpers/network'
import ProviderModule from '@modules/provider'

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

    it('should get getPastVotes successfully with BlockNumber clock mode', async () => {
      const getPastVotesStub = sandbox.stub().resolves(BigInt(1000))
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(12345678)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => ({ getConfigItem: sandbox.stub().returns({}) }) },
        },
      })

      const result = await MockedGovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        false,
      )

      expect(result).to.equal('1000')
      expect(getPastVotesStub.calledOnce).to.be.true
    })

    it('should get getPastVotes successfully with Timestamp clock mode', async () => {
      const getPastVotesStub = sandbox.stub().resolves(BigInt(2000))
      const getClockModeStub = sandbox.stub().resolves(IClockMode.Timestamp)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return {
              getPastVotes: getPastVotesStub,
              CLOCK_MODE: getClockModeStub,
            }
          },
        },
        '@helpers/governanceErc20': {
          default: {
            ...GovernanceErc20Helper,
            getClockMode: getClockModeStub,
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => ({ getConfigItem: sandbox.stub().returns({}) }) },
        },
      })

      const result = await MockedGovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        true,
      )

      expect(result).to.equal('2000')
      expect(getPastVotesStub.calledWith('0x123', 1622547800)).to.be.true
    })

    it('should call fallback when getPastVotes returns 0', async () => {
      const getPastVotesStub = sandbox.stub().resolves(BigInt(0))
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(12345678)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => ({ getConfigItem: sandbox.stub().returns({}) }) },
        },
      })

      const _getPastVotesForFallbackStub = sandbox
        .stub(MockedGovernanceErc20Helper, '_getPastVotesForFallback')
        .resolves('1000')

      const result = await MockedGovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
      )

      expect(_getPastVotesForFallbackStub.calledOnce).to.be.true
      expect(result).to.equal('1000')
      expect(_getPastVotesForFallbackStub.args[0]).to.deep.equal([
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        { maxRetries: 3, decreasingThreshold: 2 },
      ])
    })

    it('should handle errors in getPastVotes and return fallback value', async () => {
      const getPastVotesStub = sandbox.stub().rejects(new Error('RPC Call Failed'))
      sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(12345678)

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return { getPastVotes: getPastVotesStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => ({ getConfigItem: sandbox.stub().returns({}) }) },
        },
      })

      const loggerStub = sandbox.stub(logger, 'warn')

      const _getPastVotesForFallbackStub = sandbox
        .stub(MockedGovernanceErc20Helper, '_getPastVotesForFallback')
        .resolves('0')

      const result = await MockedGovernanceErc20Helper.getPastVotes(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getting past votes' as any)).to.be.true
      expect(_getPastVotesForFallbackStub.calledOnce).to.be.true
    })

    it('should handle getPastVotesForFallback with retries', async () => {
      const getMemberVotingPowerStub = sandbox.stub(Web3BatchHelper, 'getMemberVotingPower')
      getMemberVotingPowerStub.onCall(0).resolves({ votingPower: '0', error: true })
      getMemberVotingPowerStub.onCall(1).resolves({ votingPower: '1000', error: false })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 10,
        },
      })
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')

      const result = await GovernanceErc20Helper._getPastVotesForFallback(
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

    it('should return 0 when all retries fail in getPastVotesForFallback', async () => {
      const getMemberVotingPowerStub = sandbox.stub(Web3BatchHelper, 'getMemberVotingPower')
      getMemberVotingPowerStub.resolves({ votingPower: '0', error: true })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 10,
        },
      })
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')

      const result = await GovernanceErc20Helper._getPastVotesForFallback(
        '0x123',
        '0x456',
        12345678,
        1622547800,
        NetworksEnum.ethereumMainnet,
        { maxRetries: 2, decreasingThreshold: 2 },
      )

      expect(getMemberVotingPowerStub.callCount).to.equal(3) // initial + 2 retries
      expect(result).to.equal('0')
    })
  })

  describe('getVotes', () => {
    it('Should make a successful getVotes call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getVotesStub = sandbox.stub().resolves(1n)

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
      expect(result).to.eq(1n)
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

      const getPastTotalSupplyStub = sandbox.stub().resolves('1000000')
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

      const result = await MockedGovernanceErc20Helper.getPastTotalSupply({
        blockNumber: 10,
        tokenAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
        blockTimestamp: 0,
        hasClockMode: false,
      })
      expect(getChainAdjustedBlockNumberStub.calledWith(9, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.eq('1000000')
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

      const result = await MockedGovernanceErc20Helper.getPastTotalSupply({
        blockNumber: 1,
        tokenAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })
      expect(result).to.eq('0')
      expect(loggerStub.called).to.be.true
      expect(loggerStub.calledWith('Error getting pastTotalSupply' as any)).to.be.true
    })

    it('should get historical total supply when clock mode is passed with timestamp', async () => {
      // Removed unused stubConfigState definition

      const getPastTotalSupplyStub = sandbox.stub().resolves('1000000')

      const { default: MockedGovernanceErc20Helper } = proxyquire.noCallThru()('@helpers/governanceErc20', {
        ethers: {
          Contract: function () {
            return {
              getPastTotalSupply: getPastTotalSupplyStub,
            }
          },
        },
      })

      const result = await MockedGovernanceErc20Helper.getPastTotalSupply({
        tokenAddress: '0x123',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
        blockTimestamp: 1622547800,
        hasClockMode: true,
      })
      expect(getPastTotalSupplyStub.args[0][0]).to.eq(
        1622547800 - NetworkHelper.getAverageBlockTime(NetworksEnum.ethereumMainnet),
      )
      expect(result).to.eq('1000000')
    })
  })

  describe('getDelegates', () => {
    it('should return a delegate when the call is successful', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getDelegateStub = sandbox.stub().resolves('0xdelegatE')

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

      expect(result).to.be.eq('0xdelegatE')
      expect(getDelegateStub.calledOnce).to.be.true
    })

    it('should return null when getDelegates fails', async () => {
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
    it('Should return BlockNumber when CLOCK_MODE returns blocknumber string', async () => {
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

    it('should return BlockNumber when CLOCK_MODE returns null/undefined', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const clockModeStub = sandbox.stub().resolves(null)

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
  })
})
