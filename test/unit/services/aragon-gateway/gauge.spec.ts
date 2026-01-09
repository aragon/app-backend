import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'
import { GaugeInfo } from '@services/aragon-gateway/gauge'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Gateway: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getGaugeInfo', () => {
    it('should return gauge info with member data when memberAddress and tokenAddress exist', async () => {
      const pluginAddress = '0xPlugin111111111111111111111111111111111'
      const memberAddress = '0xMember1111111111111111111111111111111111'
      const tokenAddress = '0xIVotes1111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        tokenAddress,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('5')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('1000000000000000000')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(1234567890)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)
      sandbox.stub(GaugeHelper, 'getUsedVotingPower').resolves('50000000000000000')
      sandbox.stub(GaugeHelper, 'getVotes').resolves('100000000000000000')

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })

      expect(result).to.deep.equal({
        pluginAddress,
        network,
        epochId: '5',
        totalVotingPower: '1000000000000000000',
        enableUpdateVotingPowerHook: true,
        currentEpochStart: 1234567890,
        epochVoteStart: 1234567900,
        epochVoteEnd: 1234567999,
        memberAddress,
        memberUsedVotingPower: '50000000000000000',
        memberVotingPower: '100000000000000000',
      })
    })

    it('should use getPastVotes when enableUpdateVotingPowerHook is false', async () => {
      const pluginAddress = '0xPlugin222222222222222222222222222222222'
      const memberAddress = '0xMember2222222222222222222222222222222222'
      const tokenAddress = '0xIVotes2222222222222222222222222222222222'
      const network = NetworksEnum.ethereumMainnet
      const currentEpochStart = 1234567890

      const mockPlugin = {
        address: pluginAddress,
        network,
        tokenAddress,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('10')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('2000000000000000000')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(currentEpochStart)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)
      sandbox.stub(GaugeHelper, 'getUsedVotingPower').resolves('100000000000000000')
      const getPastVotesStub = sandbox.stub(GaugeHelper, 'getPastVotes').resolves('200000000000000000')

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })

      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.args[0]).to.deep.equal([memberAddress, currentEpochStart, tokenAddress, network])
      expect(result?.memberVotingPower).to.equal('200000000000000000')
    })

    it('should return gauge info without member data when memberAddress not provided', async () => {
      const pluginAddress = '0xPlugin333333333333333333333333333333333'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('3')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('3000000000000000000')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(1234567890)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, network })

      expect(result).to.deep.equal({
        pluginAddress,
        network,
        epochId: '3',
        totalVotingPower: '3000000000000000000',
        enableUpdateVotingPowerHook: true,
        currentEpochStart: 1234567890,
        epochVoteStart: 1234567900,
        epochVoteEnd: 1234567999,
      })
    })

    it('should return gauge info without member data when tokenAddress not found', async () => {
      const pluginAddress = '0xPlugin444444444444444444444444444444444'
      const memberAddress = '0xMember4444444444444444444444444444444444'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        tokenAddress: null,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('7')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('4000000000000000000')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(1234567890)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })

      expect(result).to.deep.equal({
        pluginAddress,
        network,
        epochId: '7',
        totalVotingPower: '4000000000000000000',
        enableUpdateVotingPowerHook: false,
        currentEpochStart: 1234567890,
        epochVoteStart: 1234567900,
        epochVoteEnd: 1234567999,
      })
    })

    it('should return null when plugin not found', async () => {
      const pluginAddress = '0xPluginNotFound111111111111111111111111'
      const memberAddress = '0xMember1111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const loggerWarnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('1')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('0')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(0)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(0)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(0)

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('plugin not found - getGaugeInfo' as any)).to.be.true
    })

    it('should return null when an error occurs', async () => {
      const pluginAddress = '0xPlugin555555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Database error'))

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, network })

      expect(result).to.be.null
    })

    it('should handle different network types', async () => {
      const pluginAddress = '0xPlugin666666666666666666666666666666666'
      const network = NetworksEnum.arbitrumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('15')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('6000000000000000000')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(1234567890)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, network })

      expect(result?.network).to.equal(network)
      expect(result?.epochId).to.equal('15')
    })

    it('should handle null values from gauge helper methods', async () => {
      const pluginAddress = '0xPlugin777777777777777777777777777777777'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(null)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('0')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(null)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(null)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(null)

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, network })

      expect(result).to.deep.equal({
        pluginAddress,
        network,
        epochId: null,
        totalVotingPower: '0',
        enableUpdateVotingPowerHook: false,
        currentEpochStart: null,
        epochVoteStart: null,
        epochVoteEnd: null,
      })
    })

    it('should call all gauge helper methods in parallel', async () => {
      const pluginAddress = '0xPlugin888888888888888888888888888888888'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      const epochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('20')
      const totalVotingPowerStub = sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('8000000000000000000')
      const enableHookStub = sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      const currentEpochStartStub = sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(1234567890)
      const epochVoteStartStub = sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(1234567900)
      const epochVoteEndStub = sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(1234567999)

      await GaugeInfo.getGaugeInfo({ pluginAddress, network })

      expect(findOneStub.calledOnce).to.be.true
      expect(epochIdStub.calledOnce).to.be.true
      expect(totalVotingPowerStub.calledOnce).to.be.true
      expect(enableHookStub.calledOnce).to.be.true
      expect(currentEpochStartStub.calledOnce).to.be.true
      expect(epochVoteStartStub.calledOnce).to.be.true
      expect(epochVoteEndStub.calledOnce).to.be.true
    })

    it('should handle when currentEpochStart is 0', async () => {
      const pluginAddress = '0xPlugin999999999999999999999999999999999'
      const memberAddress = '0xMember9999999999999999999999999999999999'
      const tokenAddress = '0xIVotes9999999999999999999999999999999999'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        tokenAddress,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('1')
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves('0')
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'currentEpochStart').resolves(0)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteStart').resolves(100)
      sandbox.stub(GaugeHelper, 'getGaugeEpochVoteEnd').resolves(200)
      sandbox.stub(GaugeHelper, 'getUsedVotingPower').resolves('0')
      const getPastVotesStub = sandbox.stub(GaugeHelper, 'getPastVotes').resolves('0')

      const result = await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })

      expect(getPastVotesStub.args[0][1]).to.equal(0)
      expect(result?.currentEpochStart).to.equal(0)
    })
  })
})
