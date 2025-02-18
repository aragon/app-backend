import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'

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
})
