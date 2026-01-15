import * as ContractNetspecHelper from '@helpers/contractNetspec'
import DecoderLight from '@helpers/decoderLight'
import ProxyContract from '@helpers/proxyContract'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { NetworksEnum, ProposalActionType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: DecoderLight', () => {
  let sandbox: SinonSandbox
  let decoder: DecoderLight

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    decoder = new DecoderLight()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('decode', () => {
    it('should decode native transfer', async () => {
      const action = {
        from: '0xDAO',
        to: '0xRecipient',
        data: '0x',
        value: '1000000000000000000',
      }

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.TransferNative)
      expect(result.from).to.equal('0xDAO')
      expect(result.to).to.equal('0xRecipient')
      expect(result.inputData?.function).to.equal('NativeTransfer')
      expect(result.inputData?.contract).to.equal('Wallet Address')
    })

    it('should return unknown type when source code not found', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x12345678',
        value: '0',
      }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Unknown)
      expect(result.inputData).to.be.null
    })

    it('should decode with ABI when source code is found', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'transfer',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestToken',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Transfer)
      expect(result.inputData?.function).to.equal('transfer')
      expect(result.inputData?.contract).to.equal('TestToken')
    })

    it('should handle proxy contracts', async () => {
      const action = {
        from: '0xDAO',
        to: '0xProxy',
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'transfer',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves('0xImplementation')

      const fetchStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode')
      fetchStub.onCall(0).resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TokenImpl',
        },
      ] as any)
      fetchStub.onCall(1).resolves([
        {
          ABI: '[]',
          SourceCode: '',
          ContractName: 'TokenProxy',
        },
      ] as any)

      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.inputData?.proxyName).to.equal('TokenProxy')
      expect(result.inputData?.implementationAddress).to.equal('0xImplementation')
    })
  })

  describe('decodeBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await decoder.decodeBatch([], NetworksEnum.ethereumSepolia)
      expect(result).to.deep.equal([])
    })

    it('should decode single action using decode method', async () => {
      const action = {
        from: '0xDAO',
        to: '0xRecipient',
        data: '0x',
        value: '1000',
      }

      const result = await decoder.decodeBatch([action], NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(1)
      expect(result[0].type).to.equal(ProposalActionType.TransferNative)
    })

    it('should decode multiple actions in parallel', async () => {
      const actions = [
        { from: '0xDAO', to: '0xRecipient1', data: '0x', value: '1000' },
        { from: '0xDAO', to: '0xRecipient2', data: '0x', value: '2000' },
        { from: '0xDAO', to: '0xRecipient3', data: '0x', value: '3000' },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(3)
      expect(result[0].type).to.equal(ProposalActionType.TransferNative)
      expect(result[1].type).to.equal(ProposalActionType.TransferNative)
      expect(result[2].type).to.equal(ProposalActionType.TransferNative)
    })

    it('should reuse source code for same contract address', async () => {
      const actions = [
        { from: '0xDAO', to: '0xContract', data: '0x12345678', value: '0' },
        { from: '0xDAO', to: '0xContract', data: '0x87654321', value: '0' },
      ]

      const proxyStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      const fetchStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(proxyStub.callCount).to.equal(1)
      expect(fetchStub.callCount).to.equal(1)
    })
  })

  describe('_isNativeTransfer', () => {
    it('should return true for native transfer with value', async () => {
      const action = { to: '0x', data: '0x', value: '1000' }
      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.TransferNative)
    })

    it('should return false for zero value', async () => {
      const action = { to: '0x', data: '0x', value: '0' }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.Unknown)
    })

    it('should return false for non-empty data', async () => {
      const action = { to: '0x', data: '0x12345678', value: '1000' }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.Unknown)
    })

    it('should handle empty string data as native transfer', async () => {
      const action = { to: '0x', data: '', value: '1000' }
      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.TransferNative)
    })
  })
})
