import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import MultisigHelper from '@helpers/multisig'

describe('Helpers: Multisig', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('findSettings', () => {
    const pluginAddress = '0x1234567890123456789012345678901234567890'
    const network = NetworksEnum.arbitrumMainnet

    it('should return settings when minApprovals is present', async () => {
      const stubSettings: any = { minApprovals: '3', onlyListed: true }
      stubSettings.toObject = () => stubSettings
      sandbox.stub(Web3Helper, 'getMultisigSettings').resolves(stubSettings as any)

      const result = await MultisigHelper.findSettings(pluginAddress, network)
      expect(result).to.deep.equal({ minApprovals: 3, onlyListed: true })
    })

    it('should default onlyListed to false if not provided', async () => {
      const stubSettings: any = { minApprovals: '2' }
      stubSettings.toObject = () => stubSettings

      sandbox.stub(Web3Helper, 'getMultisigSettings').resolves(stubSettings as any)

      const result = await MultisigHelper.findSettings(pluginAddress, network)
      expect(result).to.deep.equal({ minApprovals: 2, onlyListed: false })
    })

    it('should log error and return undefined if minApprovals is missing', async () => {
      const stubSettings: any = { onlyListed: true }
      stubSettings.toObject = () => stubSettings
      sandbox.stub(Web3Helper, 'getMultisigSettings').resolves(stubSettings as any)
      const stubLogger = sandbox.stub(logger, 'error')

      const result = await MultisigHelper.findSettings(pluginAddress, network)
      expect(result).to.be.undefined
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.args[0][0]).to.equal('MinApprovals not found')
    })
  })
})
