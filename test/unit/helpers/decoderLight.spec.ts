import * as ContractNetspecHelper from '@helpers/contractNetspec'
import DecoderLight from '@helpers/decoderLight'
import ProxyContract from '@helpers/proxyContract'
import logger from '@logger'
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

    it('should return false for invalid value string', async () => {
      const action = { to: '0x', data: '0x', value: 'invalid-value' }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.Unknown)
    })

    it('should handle undefined value', async () => {
      const action = { to: '0x', data: '0x', value: undefined as any }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)
      expect(result.type).to.equal(ProposalActionType.Unknown)
    })
  })

  describe('decodeBatch - additional coverage', () => {
    it('should fetch implementation addresses and add to fetch set', async () => {
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

      const actions = [
        {
          from: '0xDAO',
          to: '0xProxy',
          data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
          value: '0',
        },
        {
          from: '0xDAO',
          to: '0xProxy',
          data: '0xa9059cbb0000000000000000000000009876543210987654321098765432109876543210000000000000000000000000000000000000000000000000000000000000000b',
          value: '0',
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves('0xImplementation')

      const fetchStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode')
      fetchStub.resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)

      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(2)
      expect(fetchStub.callCount).to.equal(2)
    })

    it('should handle JSON parse error in source fetching', async () => {
      const actions = [
        { from: '0xDAO', to: '0xContract1', data: '0x12345678', value: '0' },
        { from: '0xDAO', to: '0xContract2', data: '0x12345678', value: '0' },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: 'invalid-json{',
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)

      const result = await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(2)
      expect(result[0].type).to.equal(ProposalActionType.Unknown)
      expect(result[1].type).to.equal(ProposalActionType.Unknown)
    })

    it('should decode with context using valid ABI source', async () => {
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

      const actions = [
        {
          from: '0xDAO',
          to: '0xContract',
          data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
          value: '0',
        },
        {
          from: '0xDAO',
          to: '0xContract',
          data: '0xa9059cbb0000000000000000000000009876543210987654321098765432109876543210000000000000000000000000000000000000000000000000000000000000000b',
          value: '0',
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

      const result = await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(2)
      expect(result[0].type).to.equal(ProposalActionType.Transfer)
      expect(result[1].type).to.equal(ProposalActionType.Transfer)
    })

    it('should handle proxy contracts in batch with proxyName', async () => {
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

      const actions = [
        {
          from: '0xDAO',
          to: '0xProxy',
          data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
          value: '0',
        },
        {
          from: '0xDAO',
          to: '0xProxy',
          data: '0xa9059cbb0000000000000000000000009876543210987654321098765432109876543210000000000000000000000000000000000000000000000000000000000000000b',
          value: '0',
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves('0xImplementation')

      const fetchStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode')
      fetchStub.withArgs({ address: '0xProxy', network: NetworksEnum.ethereumSepolia }).resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'ProxyContract',
        },
      ] as any)
      fetchStub.withArgs({ address: '0xImplementation', network: NetworksEnum.ethereumSepolia }).resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'ImplementationContract',
        },
      ] as any)

      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decodeBatch(actions, NetworksEnum.ethereumSepolia)

      expect(result).to.have.length(2)
      expect(result[0].inputData?.proxyName).to.equal('ProxyContract')
      expect(result[0].inputData?.implementationAddress).to.equal('0xImplementation')
    })
  })

  describe('_decodeWithSource - error handling', () => {
    it('should return base result when ABI JSON is invalid', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x12345678',
        value: '0',
      }

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: 'not-valid-json{[}',
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(logger, 'warn')

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Unknown)
      expect(result.inputData).to.be.null
    })
  })

  describe('_decodeWithAbi - edge cases', () => {
    it('should return base result when function not found in ABI', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x12345678',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'otherFunction',
          inputs: [{ name: 'param', type: 'uint256' }],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Unknown)
      expect(result.inputData).to.be.null
    })

    it('should skip non-function items in ABI', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'event',
          name: 'Transfer',
          inputs: [],
        },
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
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Transfer)
      expect(result.inputData?.function).to.equal('transfer')
    })

    it('should handle unnamed parameters with fallback name', async () => {
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
          inputs: [{ name: '', type: 'address' }, { type: 'uint256' }],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.inputData?.parameters[0].name).to.equal('param0')
      expect(result.inputData?.parameters[1].name).to.equal('param1')
    })

    it('should handle bytes parameter values', async () => {
      // Selector for multiSend(bytes) = 0x8d80ff0a
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x8d80ff0a0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000212340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005678',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'multiSend',
          inputs: [{ name: 'transactions', type: 'bytes' }],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.inputData?.function).to.equal('multiSend')
      expect(result.inputData?.parameters[0].name).to.equal('transactions')
    })

    it('should handle array type parameter values', async () => {
      // Selector for addAddresses(address[]) = 0x3628731c (MultisigAddMembers)
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x3628731c00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'addAddresses',
          inputs: [{ name: '_members', type: 'address[]' }],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.inputData?.function).to.equal('addAddresses')
      expect(result.type).to.equal(ProposalActionType.MultisigAddMembers)
      expect(Array.isArray(result.inputData?.parameters[0].value)).to.be.true
      expect(result.inputData?.parameters[0].value).to.have.length(2)
    })

    it('should return Unknown type for unrecognized function signature', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0x12345678000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'customFunction',
          inputs: [{ name: 'param', type: 'uint256' }],
        },
      ]

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          ABI: JSON.stringify(mockAbi),
          SourceCode: '',
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Unknown)
    })

    it('should handle decode error and return base result', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0xa9059cbb00',
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
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)
      sandbox.stub(logger, 'warn')

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Unknown)
      expect(result.inputData).to.be.null
    })

    it('should handle selector matching error gracefully', async () => {
      const action = {
        from: '0xDAO',
        to: '0xContract',
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      }

      const mockAbi = [
        {
          type: 'function',
          name: 'badFunction',
          inputs: [{ name: 'bad', type: 'invalid-type-that-will-throw' }],
        },
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
          ContractName: 'TestContract',
        },
      ] as any)
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.type).to.equal(ProposalActionType.Transfer)
    })
  })

  describe('decode - proxy edge cases', () => {
    it('should handle null proxySource when fetching proxy name', async () => {
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
      fetchStub.onCall(1).resolves(null)

      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns(mockAbi)

      const result = await decoder.decode(action, NetworksEnum.ethereumSepolia)

      expect(result.inputData?.proxyName).to.be.null
      expect(result.inputData?.implementationAddress).to.be.null
    })
  })
})
