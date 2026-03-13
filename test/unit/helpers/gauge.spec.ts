import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getLockNftTokenAddress', () => {
    it('should return the lock token address when escrowAddress is found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const escrowAddress = '0xEscrowAddress'
      const tokenAddress = '0xTokenAddress'

      const stubGetVotingEscrowAddress = sandbox.stub(Web3Helper, 'getVotingEscrowAddress').resolves(escrowAddress)
      const stubGetLockTokenAddress = sandbox.stub(Web3Helper, 'getLockTokenAddress').resolves(tokenAddress)

      const result = await GaugeHelper.getLockNftTokenAddress(pluginAddress, network)

      expect(stubGetVotingEscrowAddress.calledOnceWith(pluginAddress, network)).to.be.true
      expect(stubGetLockTokenAddress.calledOnceWith(escrowAddress, network)).to.be.true
      expect(result).to.equal(tokenAddress)
    })

    it('should return null when escrowAddress is not found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGetVotingEscrowAddress = sandbox.stub(Web3Helper, 'getVotingEscrowAddress').resolves(null)
      const stubGetLockTokenAddress = sandbox.stub(Web3Helper, 'getLockTokenAddress')

      const result = await GaugeHelper.getLockNftTokenAddress(pluginAddress, network)

      expect(stubGetVotingEscrowAddress.calledOnceWith(pluginAddress, network)).to.be.true
      expect(stubGetLockTokenAddress.notCalled).to.be.true
      expect(result).to.be.null
    })

    it('should return null and handle errors gracefully', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGetVotingEscrowAddress = sandbox
        .stub(Web3Helper, 'getVotingEscrowAddress')
        .rejects(new Error('Error fetching escrow address'))
      const stubGetLockTokenAddress = sandbox.stub(Web3Helper, 'getLockTokenAddress')

      const result = await GaugeHelper.getLockNftTokenAddress(pluginAddress, network)

      expect(stubGetVotingEscrowAddress.calledOnceWith(pluginAddress, network)).to.be.true
      expect(stubGetLockTokenAddress.notCalled).to.be.true
      expect(result).to.be.null
    })
  })

  describe('getGaugeEpochId', () => {
    it('should return the epochId as a string when successful', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const epochId = 123n

      const stubEpochId = sandbox.stub().resolves(epochId)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochId: stubEpochId }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochId(pluginAddress, network)

      expect(result).to.equal('123')
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEpochId = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochId: stubEpochId }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochId(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getIVotesAdapterAddress', () => {
    it('should return the iVotes adapter address when successful', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const adapterAddress = '0xAdapterAddress'

      const stubIvotesAdapter = sandbox.stub().resolves(adapterAddress)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { ivotesAdapter: stubIvotesAdapter }
          },
          ZeroAddress,
        },
      })

      const result = await MockedGaugeHelper.getIVotesAdapterAddress(pluginAddress, network)

      expect(result).to.equal(adapterAddress)
    })

    it('should return null when adapter address is zero address', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubIvotesAdapter = sandbox.stub().resolves(ZeroAddress)
      const { default: MockedGaugeHelper } = proxyquire('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { ivotesAdapter: stubIvotesAdapter }
          },
          ZeroAddress,
        },
      })

      const result = await MockedGaugeHelper.getIVotesAdapterAddress(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubIvotesAdapter = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { ivotesAdapter: stubIvotesAdapter }
          },
          ZeroAddress,
        },
      })

      const result = await MockedGaugeHelper.getIVotesAdapterAddress(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getEnableUpdateVotingPowerHookFlag', () => {
    it('should return true when hook is enabled', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEnableUpdateVotingPowerHook = sandbox.stub().resolves(true)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { enableUpdateVotingPowerHook: stubEnableUpdateVotingPowerHook }
          },
        },
      })

      const result = await MockedGaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)

      expect(result).to.be.true
    })

    it('should return false when hook is disabled', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEnableUpdateVotingPowerHook = sandbox.stub().resolves(false)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { enableUpdateVotingPowerHook: stubEnableUpdateVotingPowerHook }
          },
        },
      })

      const result = await MockedGaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)

      expect(result).to.be.false
    })

    it('should return false when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEnableUpdateVotingPowerHook = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { enableUpdateVotingPowerHook: stubEnableUpdateVotingPowerHook }
          },
        },
      })

      const result = await MockedGaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)

      expect(result).to.be.false
    })
  })

  describe('currentEpochStart', () => {
    it('should return the current epoch start timestamp as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const epochStart = 1704067200n // 2024-01-01 00:00:00 UTC

      const stubCurrentEpochStart = sandbox.stub().resolves(epochStart)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { currentEpochStart: stubCurrentEpochStart }
          },
        },
      })

      const result = await MockedGaugeHelper.currentEpochStart(pluginAddress, network)

      expect(result).to.equal(1704067200)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubCurrentEpochStart = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { currentEpochStart: stubCurrentEpochStart }
          },
        },
      })

      const result = await MockedGaugeHelper.currentEpochStart(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getGaugeEpochVoteStart', () => {
    it('should return the epoch vote start timestamp as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const voteStart = 1704067200n

      const stubEpochVoteStart = sandbox.stub().resolves(voteStart)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteStart: stubEpochVoteStart }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochVoteStart(pluginAddress, network)

      expect(result).to.equal(1704067200)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEpochVoteStart = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteStart: stubEpochVoteStart }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochVoteStart(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getGaugeEpochVoteEnd', () => {
    it('should return the epoch vote end timestamp as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const voteEnd = 1704672000n

      const stubEpochVoteEnd = sandbox.stub().resolves(voteEnd)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteEnd: stubEpochVoteEnd }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochVoteEnd(pluginAddress, network)

      expect(result).to.equal(1704672000)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEpochVoteEnd = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteEnd: stubEpochVoteEnd }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeEpochVoteEnd(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getUsedVotingPower', () => {
    it('should return the used voting power for a member', async () => {
      const memberAddress = '0xMemberAddress'
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const usedPower = 5000n

      const stubUsedVotingPower = sandbox.stub().resolves(usedPower)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { usedVotingPower: stubUsedVotingPower }
          },
        },
      })

      const result = await MockedGaugeHelper.getUsedVotingPower(memberAddress, pluginAddress, network)

      expect(result).to.equal('5000')
      expect(stubUsedVotingPower.calledOnceWith(memberAddress)).to.be.true
    })

    it('should return 0 when an error occurs', async () => {
      const memberAddress = '0xMemberAddress'
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubUsedVotingPower = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { usedVotingPower: stubUsedVotingPower }
          },
        },
      })

      const result = await MockedGaugeHelper.getUsedVotingPower(memberAddress, pluginAddress, network)

      expect(result).to.equal('0')
      expect(stubUsedVotingPower.calledOnceWith(memberAddress)).to.be.true
    })
  })

  describe('getVotes', () => {
    it('should return the current voting power for a member', async () => {
      const memberAddress = '0xMemberAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const votes = 10000n

      const stubGetVotes = sandbox.stub().resolves(votes)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getVotes: stubGetVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getVotes(memberAddress, tokenAddress, network)

      expect(result).to.equal('10000')
      expect(stubGetVotes.calledOnceWith(memberAddress)).to.be.true
    })

    it('should return 0 when an error occurs', async () => {
      const memberAddress = '0xMemberAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGetVotes = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getVotes: stubGetVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getVotes(memberAddress, tokenAddress, network)

      expect(result).to.equal('0')
      expect(stubGetVotes.calledOnceWith(memberAddress)).to.be.true
    })
  })

  describe('totalVotingPowerCast', () => {
    it('should return the total voting power cast', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const totalPower = 100000n

      const stubTotalVotingPowerCast = sandbox.stub().resolves(totalPower)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { totalVotingPowerCast: stubTotalVotingPowerCast }
          },
        },
      })

      const result = await MockedGaugeHelper.totalVotingPowerCast(pluginAddress, network)

      expect(result).to.equal('100000')
      expect(stubTotalVotingPowerCast.calledOnce).to.be.true
    })

    it('should return 0 when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubTotalVotingPowerCast = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { totalVotingPowerCast: stubTotalVotingPowerCast }
          },
        },
      })

      const result = await MockedGaugeHelper.totalVotingPowerCast(pluginAddress, network)

      expect(result).to.equal('0')
      expect(stubTotalVotingPowerCast.calledOnce).to.be.true
    })
  })

  describe('getGaugeVotes', () => {
    it('should return the gauge votes for a gauge address', async () => {
      const gaugeAddress = '0xGaugeAddress'
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const gaugeVotes = 50000n

      const stubGaugeVotes = sandbox.stub().resolves(gaugeVotes)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { gaugeVotes: stubGaugeVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeVotes(gaugeAddress, pluginAddress, network)

      expect(result).to.equal('50000')
      expect(stubGaugeVotes.calledOnceWith(gaugeAddress)).to.be.true
    })

    it('should return 0 when an error occurs', async () => {
      const gaugeAddress = '0xGaugeAddress'
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGaugeVotes = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { gaugeVotes: stubGaugeVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getGaugeVotes(gaugeAddress, pluginAddress, network)

      expect(result).to.equal('0')
      expect(stubGaugeVotes.calledOnceWith(gaugeAddress)).to.be.true
    })
  })

  describe('getPastVotes', () => {
    it('should return the past voting power for a member at a specific timepoint', async () => {
      const memberAddress = '0xMemberAddress'
      const timePoint = 1704067200
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const votes = 8000n

      const stubGetPastVotes = sandbox.stub().resolves(votes)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getPastVotes: stubGetPastVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getPastVotes(memberAddress, timePoint, tokenAddress, network)

      expect(result).to.equal('8000')
      expect(stubGetPastVotes.calledOnceWith(memberAddress, timePoint)).to.be.true
    })

    it('should return 0 when an error occurs', async () => {
      const memberAddress = '0xMemberAddress'
      const timePoint = 1704067200
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGetPastVotes = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getPastVotes: stubGetPastVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.getPastVotes(memberAddress, timePoint, tokenAddress, network)

      expect(result).to.equal('0')
      expect(stubGetPastVotes.calledOnceWith(memberAddress, timePoint)).to.be.true
    })
  })

  describe('getEpochDuration', () => {
    it('should return the epoch duration as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const epochDuration = 604800n

      const stubEpochDuration = sandbox.stub().resolves(epochDuration)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochDuration: stubEpochDuration }
          },
        },
      })

      const result = await MockedGaugeHelper.getEpochDuration(pluginAddress, network)

      expect(result).to.equal(604800)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEpochDuration = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochDuration: stubEpochDuration }
          },
        },
      })

      const result = await MockedGaugeHelper.getEpochDuration(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getVoteDuration', () => {
    it('should return the vote duration as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const voteDuration = 259200n

      const stubVoteDuration = sandbox.stub().resolves(voteDuration)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { voteDuration: stubVoteDuration }
          },
        },
      })

      const result = await MockedGaugeHelper.getVoteDuration(pluginAddress, network)

      expect(result).to.equal(259200)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubVoteDuration = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { voteDuration: stubVoteDuration }
          },
        },
      })

      const result = await MockedGaugeHelper.getVoteDuration(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getCurrentEpoch', () => {
    it('should return the current epoch as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const currentEpoch = 42n

      const stubCurrentEpoch = sandbox.stub().resolves(currentEpoch)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { currentEpoch: stubCurrentEpoch }
          },
        },
      })

      const result = await MockedGaugeHelper.getCurrentEpoch(pluginAddress, network)

      expect(result).to.equal(42)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubCurrentEpoch = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { currentEpoch: stubCurrentEpoch }
          },
        },
      })

      const result = await MockedGaugeHelper.getCurrentEpoch(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getVoteWindowBuffer', () => {
    it('should return the vote window buffer as a number', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const voteWindowBuffer = 3600n

      const stubVoteWindowBuffer = sandbox.stub().resolves(voteWindowBuffer)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { voteWindowBuffer: stubVoteWindowBuffer }
          },
        },
      })

      const result = await MockedGaugeHelper.getVoteWindowBuffer(pluginAddress, network)

      expect(result).to.equal(3600)
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubVoteWindowBuffer = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { voteWindowBuffer: stubVoteWindowBuffer }
          },
        },
      })

      const result = await MockedGaugeHelper.getVoteWindowBuffer(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getVotingPeriodEnd', () => {
    it('should return voteEnd and epochStart when all sub-calls succeed', async () => {
      const clockAddress = '0xClockAddress'
      const epochId = 5
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(GaugeHelper, 'getEpochDuration').resolves(604800)
      sandbox.stub(GaugeHelper, 'getVoteDuration').resolves(259200)
      sandbox.stub(GaugeHelper, 'getVoteWindowBuffer').resolves(3600)

      const result = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)

      expect(result).to.deep.equal({
        voteEnd: 5 * 604800 + 259200 - 3600,
        epochStart: 5 * 604800,
        epochDuration: 604800,
      })
    })

    it('should return null when getEpochDuration fails', async () => {
      const clockAddress = '0xClockAddress'
      const epochId = 5
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(GaugeHelper, 'getEpochDuration').resolves(null)
      sandbox.stub(GaugeHelper, 'getVoteDuration').resolves(259200)
      sandbox.stub(GaugeHelper, 'getVoteWindowBuffer').resolves(3600)

      const result = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)

      expect(result).to.be.null
    })

    it('should return null when getVoteDuration fails', async () => {
      const clockAddress = '0xClockAddress'
      const epochId = 5
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(GaugeHelper, 'getEpochDuration').resolves(604800)
      sandbox.stub(GaugeHelper, 'getVoteDuration').resolves(null)
      sandbox.stub(GaugeHelper, 'getVoteWindowBuffer').resolves(3600)

      const result = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)

      expect(result).to.be.null
    })

    it('should return null when getVoteWindowBuffer fails', async () => {
      const clockAddress = '0xClockAddress'
      const epochId = 5
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(GaugeHelper, 'getEpochDuration').resolves(604800)
      sandbox.stub(GaugeHelper, 'getVoteDuration').resolves(259200)
      sandbox.stub(GaugeHelper, 'getVoteWindowBuffer').resolves(null)

      const result = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)

      expect(result).to.be.null
    })
  })

  describe('epochTotalVotingPowerCast', () => {
    it('should return the epoch total voting power cast as a bigint', async () => {
      const pluginAddress = '0xPluginAddress'
      const epochId = 3
      const network = NetworksEnum.ethereumMainnet
      const totalPower = 500000n

      const stubEpochTotalVotingPowerCast = sandbox.stub().resolves(totalPower)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochTotalVotingPowerCast: stubEpochTotalVotingPowerCast }
          },
        },
      })

      const result = await MockedGaugeHelper.epochTotalVotingPowerCast(pluginAddress, epochId, network)

      expect(result).to.equal(500000n)
      expect(stubEpochTotalVotingPowerCast.calledOnceWith(epochId)).to.be.true
    })

    it('should return 0n when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const epochId = 3
      const network = NetworksEnum.ethereumMainnet

      const stubEpochTotalVotingPowerCast = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochTotalVotingPowerCast: stubEpochTotalVotingPowerCast }
          },
        },
      })

      const result = await MockedGaugeHelper.epochTotalVotingPowerCast(pluginAddress, epochId, network)

      expect(result).to.equal(0n)
      expect(stubEpochTotalVotingPowerCast.calledOnceWith(epochId)).to.be.true
    })
  })

  describe('epochGaugeVotes', () => {
    it('should return the epoch gauge votes as a bigint', async () => {
      const pluginAddress = '0xPluginAddress'
      const epochId = 3
      const gaugeAddress = '0xGaugeAddress'
      const network = NetworksEnum.ethereumMainnet
      const gaugeVotes = 75000n

      const stubEpochGaugeVotes = sandbox.stub().resolves(gaugeVotes)
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochGaugeVotes: stubEpochGaugeVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.epochGaugeVotes(pluginAddress, epochId, gaugeAddress, network)

      expect(result).to.equal(75000n)
      expect(stubEpochGaugeVotes.calledOnceWith(epochId, gaugeAddress)).to.be.true
    })

    it('should return 0n when an error occurs', async () => {
      const pluginAddress = '0xPluginAddress'
      const epochId = 3
      const gaugeAddress = '0xGaugeAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubEpochGaugeVotes = sandbox.stub().rejects(new Error('Contract call failed'))
      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochGaugeVotes: stubEpochGaugeVotes }
          },
        },
      })

      const result = await MockedGaugeHelper.epochGaugeVotes(pluginAddress, epochId, gaugeAddress, network)

      expect(result).to.equal(0n)
      expect(stubEpochGaugeVotes.calledOnceWith(epochId, gaugeAddress)).to.be.true
    })
  })
})
