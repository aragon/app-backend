import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import PluginDetector from '@helpers/pluginDetector'
import { ethers } from 'ethers'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import { TOKEN_VOTING_FUNCTIONS, SPP_FUNCTIONS, ADMIN_FUNCTIONS, MULTISIG_FUNCTIONS } from '@helpers/pluginDetector'

describe('Helpers: PluginDetector', () => {
  let sandbox: SinonSandbox
  let providerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    providerStub = {
      getCode: sandbox.stub(),
    }

    // Mock ProviderModule.getProvider to return a mocked provider
    sandbox.stub(require('@modules/provider').default, 'getAnyRpcProvider').returns(providerStub)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('detectPluginType', () => {
    it('should return unknown plugin type if address is ZeroAddress', async () => {
      const result = await PluginDetector.detectPluginType(ethers.ZeroAddress, NetworksEnum.ethereumSepolia)
      expect(result).to.deep.equal({
        type: IPluginInterfaceType.unknown,
        proxy: false,
        implementationAddress: null,
      })
    })

    it('should return unknown plugin type if contract is not a proxy', async () => {
      const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
      providerStub.getCode.resolves('0x')

      const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: IPluginInterfaceType.unknown,
        proxy: false,
        implementationAddress: null,
      })
    })

    it('should return unknown plugin type if contract bytecode is empty', async () => {
      const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
      providerStub.getCode.resolves('0x')

      const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: IPluginInterfaceType.unknown,
        proxy: false,
        implementationAddress: null,
      })
    })

    it('should return unknown plugin type if contract bytecode does not contain any function hash', async () => {
      const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
      providerStub.getCode.resolves('0x1234567890')

      const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: IPluginInterfaceType.unknown,
        proxy: false,
        implementationAddress: null,
      })
    })

    describe('when contract bytecode contains function hash', () => {
      it('should return tokenVoting plugin type if contract bytecode contains token voting functions', async () => {
        const getImplementationAddressStub = sandbox
          .stub(ProxyContractHelper, 'getImplementationAddress')
          .resolves('0xcontractAddress')

        const partialByteCode = TOKEN_VOTING_FUNCTIONS.map((sig: string) => {
          return PluginDetector.functionHashes[sig].replace('0x', '')
        }).join('00')

        providerStub.getCode.resolves('0x1234567890' + partialByteCode)

        const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
        expect(getImplementationAddressStub.calledOnce).to.be.true
        expect(result).to.deep.equal({
          type: IPluginInterfaceType.tokenVoting,
          proxy: true,
          implementationAddress: '0xcontractAddress',
        })
      })

      it('should return spp plugin type if contract bytecode contains spp functions', async () => {
        const getImplementationAddressStub = sandbox
          .stub(ProxyContractHelper, 'getImplementationAddress')
          .resolves('0xcontractAddress')

        const partialByteCode = SPP_FUNCTIONS.map((sig: string) => {
          return PluginDetector.functionHashes[sig].replace('0x', '')
        }).join('00')

        providerStub.getCode.resolves('0x1234567890' + partialByteCode)

        const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
        expect(getImplementationAddressStub.calledOnce).to.be.true
        expect(result).to.deep.equal({
          type: IPluginInterfaceType.spp,
          proxy: true,
          implementationAddress: '0xcontractAddress',
        })
      })

      it('should return multisig plugin type if contract bytecode contains multisig functions', async () => {
        const getImplementationAddressStub = sandbox
          .stub(ProxyContractHelper, 'getImplementationAddress')
          .resolves('0xcontractAddress')

        const partialByteCode = MULTISIG_FUNCTIONS.map((sig: string) => {
          return PluginDetector.functionHashes[sig].replace('0x', '')
        }).join('00')

        providerStub.getCode.resolves('0x1234567890' + partialByteCode)

        const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
        expect(getImplementationAddressStub.calledOnce).to.be.true
        expect(result).to.deep.equal({
          type: IPluginInterfaceType.multisig,
          proxy: true,
          implementationAddress: '0xcontractAddress',
        })
      })

      it('should return admin plugin type if contract bytecode contains admin functions', async () => {
        const getImplementationAddressStub = sandbox
          .stub(ProxyContractHelper, 'getImplementationAddress')
          .resolves('0xcontractAddress')

        const partialByteCode = ADMIN_FUNCTIONS.map((sig: string) => {
          return PluginDetector.functionHashes[sig].replace('0x', '')
        }).join('00')

        providerStub.getCode.resolves('0x1234567890' + partialByteCode)

        const result = await PluginDetector.detectPluginType('0xcontractAddress', NetworksEnum.ethereumSepolia)
        expect(getImplementationAddressStub.calledOnce).to.be.true
        expect(result).to.deep.equal({
          type: IPluginInterfaceType.admin,
          proxy: true,
          implementationAddress: '0xcontractAddress',
        })
      })
    })
  })
})
