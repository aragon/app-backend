import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DecodeActions from '@helpers/decodeActions'
import { expect } from 'chai'
import { Fragment, FunctionFragment } from 'ethers'
import FourByte from '@helpers/4byte'
import Logger from '@logger'
import { NetworksEnum, ProposalActionType } from '@types'
import { UtilsIndexer } from '@indexer/utils/indexer'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'

describe('Helpers: DecodeActions', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('decodeData', () => {
    it('Should decodeData', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const spyDecodeAbi = sandbox.spy(decodeActions, '_decodeWithAbi')
      const spyDecodeFallback = sandbox.spy(decodeActions, '_decodeFallback')
      const spyGetMintMetadata = sandbox.spy(decodeActions, '_getMedataIfMint')

      const saveAndGetTokenStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const result = await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(saveAndGetTokenStub.calledOnce).to.be.true
      const toAddress = result?.decoded[0].toLowerCase()
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyGetMintMetadata.calledOnce).to.be.true
      expect(spyDecodeFallback.notCalled).to.be.true
      expect(toAddress).to.be.equal('0x284803c34a3f049f787e2562e6f8c084bdbc3197')
    })

    it('Should decodeData with fallback', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        value: '0',
        data: '0x3628731c00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000ef32dc2b02bfa082f11aa6f57154f4079ffe9bbc',
      }

      const stubDecodeAbi = sandbox.stub(decodeActions, '_decodeWithAbi').resolves(null)
      const stubDecodeFallback = sandbox.stub(decodeActions, '_decodeFallback').resolves({
        textSignature: 'mockSig(address,uint256)',
      } as any)

      const result = await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.eq({
        textSignature: 'mockSig(address,uint256)',
        type: ProposalActionType.Unknown,
        metadata: null,
      })
      expect(stubDecodeAbi.calledOnceWith(action.data)).to.be.true
      expect(stubDecodeFallback.calledOnceWith(action.data)).to.be.true
    })

    it('should decodeData of a transfer action', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        value: '0',
        data: '0xa9059cbb00000000000000000000000042c9a3f034592c39028aea70a6e69fbc6ccf6c3100000000000000000000000000000000000000000000000000000000000186a0',
      }

      const getMetadataStub = sandbox.stub(decodeActions, '_getMetadataIfTransfer').resolves({
        type: ProposalActionType.Transfer,
        metadata: {
          token: {
            address: '0x42c9a3f034592c39028aea70a6e69fbc6ccf6c31',
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            logo: 'https://mock.com/logo.png',
            type: 'ERC20',
          },
          to: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
        },
      })

      const result = await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result?.type).to.eq('Transfer')
      expect(getMetadataStub.calledOnce).to.be.true
      expect(getMetadataStub.args[0][0].decoded[0]).to.be.eq('0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31')
    })

    it('Should fail decodeData', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x00e10f10000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const spyDecodeAbi = sandbox.spy(decodeActions, '_decodeWithAbi')
      const spyDecodeFallback = sandbox.spy(decodeActions, '_decodeFallback')

      const result = await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result?.decoded).to.be.undefined
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyDecodeFallback.calledOnce).to.be.true
    })
  })

  describe('decodeTransfer', () => {
    it('Should decodeTransfer', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 10n,
        data: '0x',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result?.functionName).to.eq('NativeTransfer')
      expect(result?.textSignature).to.eq('nativeTransfer(address,address,uint256)')
      expect(result?.decoded[0]).to.eq(document.daoAddress)
      expect(result?.decoded[1]).to.eq(action.to)
      expect(result?.decoded[2]).to.eq(action.value)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(result?.contractName).to.be.undefined
    })

    it('Should not decodeData if not native', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result).to.be.null
    })

    it('Should fail decodeData', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x00e10f10000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const spyDecodeAbi = sandbox.spy(decodeActions, '_decodeWithAbi')
      const spyDecodeFallback = sandbox.spy(decodeActions, '_decodeFallback')

      const result = await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result?.decoded).to.be.undefined
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyDecodeFallback.calledOnce).to.be.true
    })
  })

  describe('_decodeWithAbi', () => {
    it('should decode data using the provided ABI', async () => {
      const decodeActions = new DecodeActions()
      const data =
        '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000'

      const abi = [
        {
          name: 'mint',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ]
      const functionFragment = Fragment.from(abi[0])

      decodeActions.allSignatures = [
        {
          contractName: 'IERC20MintableUpgradeable',
          signatures: [{ method: 'mint', sig: '0x40c10f19', fragment: functionFragment as any }],
          abi: abi,
        },
      ]

      const result = await decodeActions._decodeWithAbi(data)

      expect(result).to.deep.equal({
        contractName: 'IERC20MintableUpgradeable',
        functionName: 'mint',
        textSignature: 'mint(address,uint256)',
        decoded: ['0x284803C34A3F049f787E2562e6F8C084bdBC3197', 1000000000000000000n],
      })
    })

    it('should return null if no matching ABI is found', async () => {
      const decodeActions = new DecodeActions()
      const data =
        '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000'

      // No ABI setup
      decodeActions.allSignatures = []

      const result = await decodeActions._decodeWithAbi(data)
      expect(result).to.be.null
    })

    it('should return null if decoding fails', async () => {
      const decodeActions = new DecodeActions()
      const data = '0x40c10f19000000000000000000000000' // Invalid data

      const abi = [
        {
          name: 'mint',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ]
      const functionFragment = Fragment.from(abi[0])

      decodeActions.allSignatures = [
        {
          contractName: 'IERC20MintableUpgradeable',
          signatures: [{ method: 'mint', sig: '0x40c10f19', fragment: functionFragment as any }],
          abi: abi,
        },
      ]

      const stubLogger = sandbox.stub(Logger, 'error')
      const result = await decodeActions._decodeWithAbi(data)
      expect(result).to.be.null
      expect(stubLogger.calledWith('Error decoding action data with abi' as any)).to.be.true
    })
  })

  describe('_decodeFallback', () => {
    it('should decode data using FourByte fallback', async () => {
      const decodeActions = new DecodeActions()
      const data =
        '0xee57e36f00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d47786674580000000000000000000000'

      const stubFourByte = sandbox.stub(FourByte, 'getSignatures').resolves({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 513956,
            created_at: '2022-03-03T07:59:06.062305Z',
            text_signature: 'setMetadata(bytes)',
            hex_signature: '0xee57e36f',
            bytes_signature: 'îWão',
          },
        ],
      })

      const result = await decodeActions._decodeFallback(data)
      expect(result).to.deep.equal({
        functionName: 'setMetadata',
        textSignature: 'setMetadata(bytes)',
        type: ProposalActionType.Unknown,
        metadata: null,
        decoded: [
          '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
        ],
      })
      expect(stubFourByte.calledOnce).to.be.true
    })

    it('should return null if fail to decode', async () => {
      const decodeActions = new DecodeActions()
      const data = '0xee57e36f0000000000000000000000000000000000000000000000000000000000000001'

      const stubFourByte = sandbox.stub(FourByte, 'getSignatures').resolves({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 513956,
            created_at: '2022-03-03T07:59:06.062305Z',
            text_signature: 'setMetadata(bytes)',
            hex_signature: '0xee57e36f',
            bytes_signature: 'îWão',
          },
        ],
      })

      const loggerStub = sandbox.stub(Logger, 'error')
      const result = await decodeActions._decodeFallback(data)
      expect(loggerStub.calledOnceWith('Error decoding action data' as any)).to.be.true
      expect(result).to.be.null
      expect(stubFourByte.calledOnce).to.be.true
    })

    it('should return null if no signatures are found', async () => {
      const decodeActions = new DecodeActions()
      const data = '0x1234567800000000000000000000000000000000000000000000000000000000'

      const stubFourByte = sandbox.stub(FourByte, 'getSignatures').resolves({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })

      const result = await decodeActions._decodeFallback(data)
      expect(result).to.be.null
      expect(stubFourByte.calledOnce).to.be.true
    })

    it('should return null if fail to getSignatures', async () => {
      const decodeActions = new DecodeActions()
      const data = '0xee57e36f0000000000000000000000000000000000000000000000000000000000000001'

      const stubLogger = sandbox.stub(Logger, 'error')
      const stubFourByte = sandbox.stub(FourByte, 'getSignatures').rejects(new Error('fake-error'))

      const result = await decodeActions._decodeFallback(data)
      expect(result).to.be.null
      expect(stubFourByte.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error decoding action data' as any)).to.be.true
    })
  })

  describe('_getSignaturesFromAbi', () => {
    it('should correctly extract signatures from ABI', () => {
      const decodeActions = new DecodeActions()
      const abi = [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            {
              name: 'recipient',
              type: 'address',
            },
            {
              name: 'amount',
              type: 'uint256',
            },
          ],
        },
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            {
              name: 'spender',
              type: 'address',
            },
            {
              name: 'amount',
              type: 'uint256',
            },
          ],
        },
      ]

      const name = 'ERC20'
      const signatures = decodeActions._getSignaturesFromAbi(abi, name)

      expect(signatures.length).to.eq(2)
      expect(signatures[0].method).to.eq('transfer')
      expect(signatures[1].method).to.eq('approve')
    })

    it('should skip view and pure functions', () => {
      const decodeActions = new DecodeActions()
      const abi = [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            {
              name: 'account',
              type: 'address',
            },
          ],
        },
        {
          name: 'totalSupply',
          type: 'function',
          stateMutability: 'pure',
          inputs: [],
        },
      ]

      const name = 'ERC20'

      const signatures = decodeActions._getSignaturesFromAbi(abi, name)

      expect(signatures.length).to.eq(0)
    })

    it('should handle invalid type', () => {
      const decodeActions = new DecodeActions()
      const abi = [
        {
          name: 'invalidFunction',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            {
              name: 'param',
              type: 'invalidType',
            },
          ],
        },
      ]

      const name = 'InvalidContract'
      const loggerStub = sandbox.stub(Logger, 'warn')
      const signatures = decodeActions._getSignaturesFromAbi(abi, name)
      expect(loggerStub.calledOnceWith('Error creating FunctionFragment' as any)).to.be.true
      expect(signatures.length).to.eq(0)
    })

    it('should handle error', () => {
      const decodeActions = new DecodeActions()
      const abi = [
        {
          name: 'invalidFunction',
          type: 'function',
          stateMutability: 'nonpayable',
        },
      ]

      const name = 'InvalidContract'
      sandbox.stub(FunctionFragment, 'getSelector').throws(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'warn')
      const signatures = decodeActions._getSignaturesFromAbi(abi, name)

      expect(signatures.length).to.eq(0)
      expect(stubLogger.calledWith('Error creating FunctionFragment' as any)).to.be.true
    })
  })

  describe('_setupSignatures', () => {
    it('should set up signatures correctly', () => {
      const decodeActions = new DecodeActions()

      const allSignatures = decodeActions.allSignatures.map(({ contractName, abi }) => ({ contractName, abi }))
      expect(allSignatures.length).to.eq(8)
      expect(allSignatures[0].contractName).to.eq('DaoFactory')
      expect(allSignatures[1].contractName).to.eq('Multisig')
      expect(allSignatures[2].contractName).to.eq('MajorityVotingBase')
      expect(allSignatures[3].contractName).to.eq('IERC20MintableUpgradeable')
      expect(allSignatures[4].contractName).to.eq('ERC20')
      expect(allSignatures[5].contractName).to.eq('ERC721')
      expect(allSignatures[6].contractName).to.eq('ERC1155')
      expect(allSignatures[7].contractName).to.eq('GovernanceERC20')
    })
  })

  describe('_getFunctionFragment', () => {
    it('should return the correct function fragment for a valid function selector', () => {
      const decodeActions = new DecodeActions()
      const dataHex = '0x095ea7b3000000000000000000000000' // Example function selector with data

      const availableSignatures = { method: 'approve', sig: '0x095ea7b3', fragment: 'test' as any }

      const fragment = decodeActions._getFunctionFragment(dataHex, [availableSignatures])
      expect(fragment).to.deep.equal('test')
    })

    it('should return undefined for an invalid function selector', () => {
      const decodeActions = new DecodeActions()
      const dataHex = '0x12345678000000000000000000000000' // Invalid function selector
      const availableSignatures = { method: 'approve', sig: '0x095ea7b3', fragment: 'test' as any }

      const fragment = decodeActions._getFunctionFragment(dataHex, [availableSignatures])
      expect(fragment).to.be.undefined
    })
  })

  describe('parse action metadata', () => {
    it('should return metadata for a transfer action with sig transfer(address,uint256)', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        data: '0xa9059cbb00000000000000000000000042c9a3f034592c39028aea70a6e69fbc6ccf6c3100000000000000000000000000000000000000000000000000000000000186a0',
        value: '0x',
      }

      const saveAndGetTokenStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x42c9a3f034592c39028aea70a6e69fbc6ccf6c31',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const result = await decodeActions._getMetadataIfTransfer(
        {
          decoded: ['0x72423fe5168185afb26390b5b9709ab58d20e3d8', 1000000000000000000n],
          textSignature: 'transfer(address,uint256)',
        } as any,
        action,
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        },
      )

      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledWith(action.to, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.deep.eq({
        metadata: {
          token: {
            address: '0x42c9a3f034592c39028aea70a6e69fbc6ccf6c31',
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            logo: 'https://mock.com/logo.png',
            type: 'ERC20',
          },
          from: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
          to: '0x72423fe5168185afb26390b5b9709ab58d20e3d8',
          value: 1000000000000000000n,
        },
        type: ProposalActionType.Transfer,
      })
    })

    it('should decode metadata for a transfer action with sig transferFrom(address,address,uint256)', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        data: '0x23b872dd000000000000000000000000460eec6155b7b810edb83809d34f9f41f3fbb29a00000000000000000000000072423fe5168185afb26390b5b9709ab58d20e3d8000000000000000000000000000000000000000000000000000000000000001f',
        value: '0x',
      }

      const saveAndGetTokenStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x460eec6155b7b810edb83809d34f9f41f3fbb29a',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const result = await decodeActions._getMetadataIfTransfer(
        {
          decoded: ['0x460eec6155b7b810edb83809d34f9f41f3fbb29a', '0x72423fe5168185afb26390b5b9709ab58d20e3d8', 31n],
          textSignature: 'transferFrom(address,address,uint256)',
        } as any,
        action,
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0x8e1e51BdeA4Ea2C42FF2d0f7D3303D417603298F',
        },
      )

      expect(saveAndGetTokenStub.calledOnce).to.be.true

      expect(saveAndGetTokenStub.calledWith(action.to, NetworksEnum.ethereumMainnet)).to.be.true

      expect(result).to.deep.eq({
        metadata: {
          token: {
            address: '0x460eec6155b7b810edb83809d34f9f41f3fbb29a',
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            logo: 'https://mock.com/logo.png',
            type: 'ERC20',
          },
          from: '0x460eec6155b7b810edb83809d34f9f41f3fbb29a',
          to: '0x72423fe5168185afb26390b5b9709ab58d20e3d8',
          value: 31n,
        },
        type: ProposalActionType.Transfer,
      })
    })

    it('should handle mint action with sig mint(address,uint256)', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const saveAndGetTokenStub = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x384803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const result = await decodeActions._getMedataIfMint(
        {
          decoded: ['0x284803C34A3F049f787E2562e6F8C084bdBC3197', 1000000000000000000n],
          textSignature: 'mint(address,uint256)',
        } as any,
        action,
        {
          network: NetworksEnum.ethereumMainnet,
        },
      )

      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledWith(action.to, NetworksEnum.ethereumMainnet)).to.be.true

      expect(result).to.deep.eq({
        metadata: {
          token: {
            address: '0x384803C34A3F049f787E2562e6F8C084bdBC3197',
            name: 'MockToken',
            symbol: 'MOCK',
            decimals: 18,
            logo: 'https://mock.com/logo.png',
            type: 'ERC20',
          },
          to: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          value: 1000000000000000000n,
        },
        type: ProposalActionType.Mint,
      })
    })

    it('should handle multisig add members action with sig addAddresses(address[])', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'addAddresses(address[])',
        decoded: [['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F']],
      }

      const result = await decodeActions._getMetadataOfAddMultiSigMember(decoded as any)

      expect(result).to.deep.eq({
        metadata: {
          addresses: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
        },
        type: ProposalActionType.MultisigAddMembers,
      })
    })

    it('should handle multisig remove members action with sig removeAddresses(address[])', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'removeAddresses(address[])',
        decoded: [['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F']],
      }

      const result = await decodeActions._getMetadataOfRemoveMultiSigMember(decoded as any)

      expect(result).to.deep.eq({
        metadata: {
          addresses: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
        },
        type: ProposalActionType.MultisigRemoveMembers,
      })
    })

    it('should handle metadata update action with sig setMetadata(bytes)', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'setMetadata(bytes)',
        decoded: [
          '0x697066733a2f2f6261666b726569656a697572753268366b7463616f37336c6d71656b6a37377469716536706a747235626b7876746d37777137613235326a783779',
        ],
      }

      const extractMetadataUriSpy = sandbox.spy(Web3Helper, 'extractMetadataUri')
      const ipfsGetStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        title: 'Test Title',
      } as any)

      const result: any = await decodeActions._getMetadataForMetadataUpdate(decoded as any)

      expect(extractMetadataUriSpy.calledOnce).to.be.true
      expect(ipfsGetStub.calledOnce).to.be.true

      expect(result?.type).to.be.eq(ProposalActionType.MetadataUpdate)
      expect(result?.metadata.title).to.be.eq('Test Title')
    })

    it('should return null if the extracted metadata uri is invalid', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'setMetadata(bytes)',
        decoded: [
          '0x697066733a2f2f6261666b726569656a697572753268366b7463616f37336c6d71656b6a37377469716536706a747235626b7876746d37777137613235326a783779',
        ],
      }

      const extractMetadataUriStub = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(null)

      const result = await decodeActions._getMetadataForMetadataUpdate(decoded as any)

      expect(extractMetadataUriStub.calledOnce).to.be.true

      expect(result).to.be.null
    })

    it('should fail if the metadata has bad content', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'setMetadata(bytes)',
        decoded: [
          '0x697066733a2f2f6261666b726569656a697572753268366b7463616f37336c6d71656b6a37377469716536706a747235626b7876746d37777137613235326a783779',
        ],
      }

      const extractMetadataUriSpy = sandbox.spy(Web3Helper, 'extractMetadataUri')
      const ipfsGetStub = sandbox.stub(IPFSModule, 'fetchMetadata').rejects(new Error('fake-error'))

      const result = await decodeActions._getMetadataForMetadataUpdate(decoded as any)

      expect(extractMetadataUriSpy.calledOnce).to.be.true
      expect(ipfsGetStub.calledOnce).to.be.true

      expect(result).to.deep.eq({
        type: ProposalActionType.MetadataUpdate,
        metadata: {
          ipfsUrl: 'ipfs://bafkreiejiuru2h6ktcao73lmqekj77tiqe6pjtr5bkxvtm7wq7a252jx7y',
        },
      })
    })

    it('should handle multisig setting update action with sig updateMultisigSettings(tuple)', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'updateMultisigSettings(tuple)',
        decoded: [[true, 3]],
      }

      const result = await decodeActions._getMetdataOfMultiSigSetting(decoded as any)

      expect(result).to.deep.eq({
        metadata: {
          onlyListed: true,
          minApprovals: 3,
        },
        type: ProposalActionType.UpdateMultiSigSettings,
      })
    })

    it('should handle vote setting update action with sig updateVoteSettings(tuple)', async () => {
      const decodeActions = new DecodeActions()

      const decoded = {
        textSignature: 'updateVotingSettings(tuple)',
        decoded: [[0, 500000, 150000, 1209600, 1000000000000000000]],
      }

      const result = await decodeActions._getMetdataOfVoteSetting(decoded as any)

      expect(result).to.deep.eq({
        metadata: {
          votingMode: 0,
          supportThreshold: 500000,
          minParticipation: 150000,
          minDuration: 1209600,
          minProposerVotingPower: 1000000000000000000,
        },
        type: ProposalActionType.UpdateVoteSettings,
      })
    })
  })
})
