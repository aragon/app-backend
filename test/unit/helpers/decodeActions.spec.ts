import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DecodeActions from '@helpers/decodeActionV2'
import { expect } from 'chai'
import { Fragment, FunctionFragment } from 'ethers'
import FourByte from '@helpers/4byte'
import Logger from '@logger'
import { NetworksEnum, ProposalActionType } from '@types'
import { UtilsIndexer } from '@indexer/utils/indexer'
import Web3Helper from '@helpers/web3'
import Covalent from '@helpers/covalent'

describe.only('Helpers: DecodeActions', () => {
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

      const parseContractNetspecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves({
        contractName: 'IERC20MintableUpgradeable',
        inputs: [
          {
            name: 'to',
            type: 'address',
            notice: 'The address to mint tokens to',
          },
          {
            name: 'amount',
            type: 'uint256',
            notice: 'The amount of tokens to mint',
          },
        ],
        notice: 'Mint tokens to a specific address',
      })

      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('0')
      const getTokenInfoWithCovalentStub = sandbox.stub(Covalent, 'getTokenInfo').resolves({
        totalSupply: '1000000000000000000',
        totalHolders: 1,
      })

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

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getTokenInfoWithCovalentStub.calledOnce).to.be
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyDecodeFallback.notCalled).to.be.true
      expect(parseContractNetspecStub.calledOnce).to.be.true
      expect(result?.inputData!.notice).to.be.equal('Mint tokens to a specific address')
      expect(result?.inputData!.parameters[0].notice).to.be.equal('The address to mint tokens to')
    })
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
      daoAddress: 'xxx',
    })

    expect(result).to.deep.eq({
      from: 'xxx',
      data: action.data,
      value: action.value,
      to: action.to,
      inputData: { textSignature: 'mockSig(address,uint256)' },
      type: ProposalActionType.Unknown,
    })
    expect(stubDecodeAbi.calledOnceWith(action)).to.be.true
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

    const result = await decodeActions.decodeData(action, {
      network: NetworksEnum.ethereumMainnet,
    })

    expect(result).to.be.eq(null)
    expect(spyDecodeAbi.calledOnce).to.be.true
    expect(spyDecodeFallback.calledOnce).to.be.true
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

      expect(result?.inputData.function).to.eq('NativeTransfer')
      expect(result?.inputData.textSignature).to.eq('nativeTransfer(address,uint256)')
      expect(result?.sender.address).to.eq(document.daoAddress)
      expect(result?.receiver.address).to.eq(action.to)
      expect(result?.amount).to.eq(action.value)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(result?.inputData.contract).to.be.eq('NativeToken')
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

      const parseContractNetspecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves({
        contractName: 'IERC20MintableUpgradeable',
        inputs: [
          {
            name: 'to',
            type: 'address',
            notice: 'The address to mint tokens to',
          },
          {
            name: 'amount',
            type: 'uint256',
            notice: 'The amount of tokens to mint',
          },
        ],
        notice: 'Mint tokens to a specific address',
      })

      const result = await decodeActions._decodeWithAbi(
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          data: data,
          value: '0',
        },
        {
          network: NetworksEnum.ethereumSepolia,
        } as any,
      )

      expect(parseContractNetspecStub.calledOnce).to.be.true

      expect(result).to.deep.equal({
        contract: 'IERC20MintableUpgradeable',
        function: 'mint',
        textSignature: 'mint(address,uint256)',
        notice: 'Mint tokens to a specific address',
        parameters: [
          {
            name: 'to',
            notice: 'The address to mint tokens to',
            type: 'address',
            value: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          },
          {
            name: 'amount',
            notice: 'The amount of tokens to mint',
            type: 'uint256',
            value: 1000000000000000000n,
          },
        ],
      })
    })

    it('should return null if no matching ABI is found', async () => {
      const decodeActions = new DecodeActions()
      const data =
        '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000'

      // No ABI setup
      decodeActions.allSignatures = []

      const result = await decodeActions._decodeWithAbi(
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          data: data,
          value: '0',
        },
        {
          network: NetworksEnum.ethereumSepolia,
        } as any,
      )

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
      const result = await decodeActions._decodeWithAbi(
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          data: data,
          value: '0',
        },
        {
          network: NetworksEnum.ethereumSepolia,
        } as any,
      )
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
        function: 'setMetadata',
        textSignature: 'setMetadata(bytes)',
        parameters: [
          {
            type: 'bytes',
            value: '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458'
          }
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
})
