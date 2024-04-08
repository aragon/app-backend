import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Utils from '@helpers/web3'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { ConfigState } from '@state/configState'
import Logger from '@logger'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('parseAddress', function () {
    it('should parseAddress', function () {
      const address = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
      const expectedChecksumAddress = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
      const stubLogger = sandbox.stub(logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.equal(expectedChecksumAddress)
      expect(stubLogger.notCalled).to.be.true
    })

    it('error parseAddress', function () {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.be.null
      expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
    })
  })

  describe('getAddressFromEns', function () {
    it('should get address from ens', async () => {
      const resolveName = sandbox.stub().resolves('0x000001')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        resolveName,
      })

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq('0x000001')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(resolveName.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error resolving ENS name' as any)).to.be.true
    })
  })

  describe('getEnsFromAddress', function () {
    it('should get address from ens', async () => {
      const lookupAddress = sandbox.stub().resolves('aavegotchi.dao.eth')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        lookupAddress,
      })

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq('aavegotchi.dao.eth')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(lookupAddress.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error looking up address' as any)).to.be.true
    })
  })
})
