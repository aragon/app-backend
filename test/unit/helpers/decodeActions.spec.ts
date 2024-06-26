import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DecodeActions from '@helpers/decodeActions'
import { expect } from 'chai'
import { Fragment, FunctionFragment } from 'ethers'
import FourByte from '@helpers/4byte'
import Logger from '@logger'

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

      const result = await decodeActions.decodeData(action.data)

      const toAddress = result?.decoded[0].toLowerCase()
      expect(spyDecodeAbi.calledOnce).to.be.true
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

      const stubDecodeAbi = sandbox.stub(decodeActions, '_decodeWithAbi').returns(null)
      const stubDecodeFallback = sandbox.stub(decodeActions, '_decodeFallback').resolves(true as any)

      const result = await decodeActions.decodeData(action.data)

      expect(result).to.be.true
      expect(stubDecodeAbi.calledOnceWith(action.data)).to.be.true
      expect(stubDecodeFallback.calledOnceWith(action.data)).to.be.true
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

      const result = await decodeActions.decodeData(action.data)
      expect(result?.decoded).to.be.undefined
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyDecodeFallback.calledOnce).to.be.true
    })
  })

  describe('_decodeWithAbi', () => {
    it('should decode data using the provided ABI', () => {
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

      const result = decodeActions._decodeWithAbi(data)

      expect(result).to.deep.equal({
        contractName: 'IERC20MintableUpgradeable',
        functionName: 'mint',
        textSignature: 'mint(address,uint256)',
        decoded: ['0x284803C34A3F049f787E2562e6F8C084bdBC3197', 1000000000000000000n],
      })
    })

    it('should return null if no matching ABI is found', () => {
      const decodeActions = new DecodeActions()
      const data =
        '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000'

      // No ABI setup
      decodeActions.allSignatures = []

      const result = decodeActions._decodeWithAbi(data)
      expect(result).to.be.null
    })

    it('should return null if decoding fails', () => {
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
      const result = decodeActions._decodeWithAbi(data)
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

      const result = await decodeActions._decodeFallback(data)
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
      const signatures = decodeActions._getSignaturesFromAbi(abi, name)

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
})
