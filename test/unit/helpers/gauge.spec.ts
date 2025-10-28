import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import * as proxyquire from 'proxyquire'

describe('Helpers: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenAddress', () => {
    it('should return the lock token address when escrowAddress is found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet
      const escrowAddress = '0xEscrowAddress'
      const tokenAddress = '0xTokenAddress'

      const stubGetVotingEscrowAddress = sandbox.stub(Web3Helper, 'getVotingEscrowAddress').resolves(escrowAddress)
      const stubGetLockTokenAddress = sandbox.stub(Web3Helper, 'getLockTokenAddress').resolves(tokenAddress)

      const result = await GaugeHelper.getTokenAddress(pluginAddress, network)

      expect(stubGetVotingEscrowAddress.calledOnceWith(pluginAddress, network)).to.be.true
      expect(stubGetLockTokenAddress.calledOnceWith(escrowAddress, network)).to.be.true
      expect(result).to.equal(tokenAddress)
    })

    it('should return null when escrowAddress is not found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const stubGetVotingEscrowAddress = sandbox.stub(Web3Helper, 'getVotingEscrowAddress').resolves(null)
      const stubGetLockTokenAddress = sandbox.stub(Web3Helper, 'getLockTokenAddress')

      const result = await GaugeHelper.getTokenAddress(pluginAddress, network)

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

      const result = await GaugeHelper.getTokenAddress(pluginAddress, network)

      expect(stubGetVotingEscrowAddress.calledOnceWith(pluginAddress, network)).to.be.true
      expect(stubGetLockTokenAddress.notCalled).to.be.true
      expect(result).to.be.null
    })
  })

  describe('getGaugeEpochId', () => {
    it('should return the epochId as a string when successful', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubEpochId = sandbox.stub().resolves(123n)

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochId: stubEpochId }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getGaugeEpochId(pluginAddress, network)

      expect(result).to.equal('123')
      expect(stubEpochId.calledOnce).to.be.true
    })

    it('should return null when an error occurs', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubEpochId = sandbox.stub().rejects(new Error('Contract call failed'))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochId: stubEpochId }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getGaugeEpochId(pluginAddress, network)

      expect(result).to.be.null
      expect(stubEpochId.calledOnce).to.be.true
    })
  })

  describe('getIVotesAdapterAddress', () => {
    it('should return the iVotes adapter address when it is not the zero address', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubIvotesAdapter = sandbox.stub().resolves('0xIVotesAdapterAddress')

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { ivotesAdapter: stubIvotesAdapter }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getIVotesAdapterAddress(pluginAddress, network)

      expect(result).to.equal('0xIVotesAdapterAddress')
      expect(stubIvotesAdapter.calledOnce).to.be.true
    })
  })

  describe('getEnableUpdateVotingPowerHookFlag', () => {
    it('should return true when flag is enabled', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubEnableHook = sandbox.stub().resolves(true)

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { enableUpdateVotingPowerHook: stubEnableHook }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)

      expect(result).to.be.true
      expect(stubEnableHook.calledOnce).to.be.true
    })
  })

  describe('currentEpochStart', () => {
    it('should return epoch start timestamp', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubCurrentEpochStart = sandbox.stub().resolves(BigInt(1234567890))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { currentEpochStart: stubCurrentEpochStart }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.currentEpochStart(pluginAddress, network)

      expect(result).to.equal(1234567890)
      expect(stubCurrentEpochStart.calledOnce).to.be.true
    })
  })

  describe('getGaugeEpochVoteStart', () => {
    it('should return epoch vote start timestamp', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubEpochVoteStart = sandbox.stub().resolves(BigInt(1234567890))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteStart: stubEpochVoteStart }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getGaugeEpochVoteStart(pluginAddress, network)

      expect(result).to.equal(1234567890)
      expect(stubEpochVoteStart.calledOnce).to.be.true
    })
  })

  describe('getGaugeEpochVoteEnd', () => {
    it('should return epoch vote end timestamp', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubEpochVoteEnd = sandbox.stub().resolves(BigInt(1234567890))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { epochVoteEnd: stubEpochVoteEnd }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getGaugeEpochVoteEnd(pluginAddress, network)

      expect(result).to.equal(1234567890)
      expect(stubEpochVoteEnd.calledOnce).to.be.true
    })
  })

  describe('getUsedVotingPower', () => {
    it('should return used voting power as string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubUsedVotingPower = sandbox.stub().resolves(BigInt('1000000000000000000'))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { usedVotingPower: stubUsedVotingPower }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const memberAddress = '0xMemberAddress'
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getUsedVotingPower(memberAddress, pluginAddress, network)

      expect(result).to.equal('1000000000000000000')
      expect(stubUsedVotingPower.calledOnce).to.be.true
    })
  })

  describe('totalVotingPowerCast', () => {
    it('should return total voting power cast as string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubTotalVotingPowerCast = sandbox.stub().resolves(BigInt('5000000000000000000'))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { totalVotingPowerCast: stubTotalVotingPowerCast }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.totalVotingPowerCast(pluginAddress, network)

      expect(result).to.equal('5000000000000000000')
      expect(stubTotalVotingPowerCast.calledOnce).to.be.true
    })
  })

  describe('getVotes', () => {
    it('should return votes as string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubGetVotes = sandbox.stub().resolves(BigInt('2000000000000000000'))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getVotes: stubGetVotes }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const memberAddress = '0xMemberAddress'
      const iVotesAddress = '0xIVotesAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getVotes(memberAddress, iVotesAddress, network)

      expect(result).to.equal('2000000000000000000')
      expect(stubGetVotes.calledOnce).to.be.true
    })
  })

  describe('getPastVotes', () => {
    it('should return past votes as string', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubGetPastVotes = sandbox.stub().resolves(BigInt('3000000000000000000'))

      const { default: MockedGaugeHelper } = proxyquire.noCallThru()('@helpers/gauge', {
        ethers: {
          Contract: function () {
            return { getPastVotes: stubGetPastVotes }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const memberAddress = '0xMemberAddress'
      const timePoint = 123456
      const iVotesAddress = '0xIVotesAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedGaugeHelper.getPastVotes(memberAddress, timePoint, iVotesAddress, network)

      expect(result).to.equal('3000000000000000000')
      expect(stubGetPastVotes.calledOnce).to.be.true
    })
  })
})
