import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import * as proxyquire from 'proxyquire'
import logger from '@logger'

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
})
