import { Models } from '@dbModels'
import FourByte from '@helpers/4byte'
import CoinGeckoHelper from '@helpers/coinGecko'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import DecodeActions from '@helpers/decodeAction'
import ProxyContract from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import Ipfs from '@modules/ipfs'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import { MemberGovernanceFactory } from '@src/governance'
import { IPluginInterfaceType, ITokenType, KnownActionSignature, NetworksEnum, ProposalActionType } from '@types'
import { expect } from 'chai'
import { Fragment, FunctionFragment } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: DecodeActions', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Stub the expensive _setupSignatures method globally to speed up all tests
    sandbox.stub(DecodeActions.prototype, '_setupSignatures').returns()

    // Stub external services to prevent any HTTP calls
    sandbox.stub(FourByte, 'getSignatures').resolves({
      count: 0,
      results: [],
      next: null,
      previous: null,
    })
    sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)
    sandbox.stub(Ipfs, 'fetchMetadata').resolves(null)
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('decodeData', () => {
    it('Should decodeData', async () => {
      // Restore _setupSignatures for this test to work properly
      const setupSignaturesStub = DecodeActions.prototype._setupSignatures as sinon.SinonStub
      setupSignaturesStub.restore()

      const decodeActions = new DecodeActions()

      // Re-stub it after instantiation
      sandbox.stub(decodeActions, '_setupSignatures').returns()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const spyDecodeAbi = sandbox.spy(decodeActions, '_decodeWithAbi')
      const spyDecodeFallback = sandbox.spy(decodeActions, '_decodeFallback')

      const stubParseContractNetspec = sandbox.stub(decodeActions, 'parseContractNetspec').resolves()
      const stubMint = sandbox.stub(decodeActions, '_parseMintAction').resolves({
        type: ProposalActionType.Mint,
        inputData: {},
      } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(0n)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumSepolia,
      })

      // Now that _setupSignatures is restored, the flow works properly
      expect(stubMint.calledOnce).to.be.true
      expect(stubParseContractNetspec.calledOnce).to.be.true
      expect(getERC20BalanceStub.notCalled).to.be.true
      expect(saveAndGetTokenStub.notCalled).to.be.true
      expect(spyDecodeAbi.calledOnce).to.be.true
      expect(spyDecodeFallback.notCalled).to.be.true
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
    const stubNetspec = sandbox.stub(decodeActions, 'parseContractNetspec').resolves(null as any)

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
    expect(stubDecodeAbi.calledOnceWith(action)).to.be.true
    expect(stubDecodeFallback.calledOnceWith(action)).to.be.true
    expect(stubNetspec.calledOnce).to.be.true
  })

  it('Should fail decodeData', async () => {
    const decodeActions = new DecodeActions()
    // Set minimal signatures for the test
    decodeActions.allSignatures = []

    const action = {
      to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      value: '0',
      data: '0x00e10f10000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
    }

    // Stub methods to avoid actual processing and external calls
    sandbox.stub(decodeActions, '_decodeWithAbi').resolves(null)
    sandbox.stub(decodeActions, '_decodeFallback').resolves(null)
    sandbox.stub(decodeActions, 'parseContractNetspec').resolves(null as any)

    const result = await decodeActions.decodeData(action, {
      network: NetworksEnum.ethereumMainnet,
      daoAddress: 'xxx',
    })

    expect(result).to.deep.eq({
      from: 'xxx',
      data: action.data,
      value: action.value,
      to: action.to,
      type: ProposalActionType.Unknown,
      inputData: null,
    })
  })

  it('should partially decode from fallback and not with base contract netspec', async () => {
    const decodeActions = new DecodeActions()

    const action = {
      to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      value: '0',
      data: '0x0900e10f10000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
    }

    const spyDecodeAbi = sandbox.spy(decodeActions, '_decodeWithAbi')
    const spyDecodeFallback = sandbox.spy(decodeActions, '_decodeFallback')
    const parseContractNetspecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves({
      inputs: [
        { name: 'to', type: 'address', notice: 'The address to mint tokens to', value: 1 },
        { name: 'amount', type: 'uint256', notice: 'The amount of tokens to mint', value: 1 },
      ],
    } as any)

    const result = await decodeActions.decodeData(action, {
      network: NetworksEnum.ethereumMainnet,
      daoAddress: 'xxx',
    })

    expect(result?.type).to.be.eq(ProposalActionType.Unknown)
    expect(result?.from).to.be.eq('xxx')
    expect(result?.to).to.be.eq(action.to)
    expect(result?.value).to.be.eq(action.value)

    expect(result?.inputData).to.be.not.null
    expect(result?.inputData?.parameters).to.deep.eq([
      { name: 'to', type: 'address', notice: 'The address to mint tokens to', value: 1, components: undefined },
      { name: 'amount', type: 'uint256', notice: 'The amount of tokens to mint', value: 1, components: undefined },
    ])

    expect(parseContractNetspecStub.calledTwice).to.be.true
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
        network: NetworksEnum.ethereumSepolia,
      }

      const token = {
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      }
      const pickFieldsStub = sandbox.stub().returns(token)
      // findByTokenAddressAndNetwork
      const findTokenStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        pickFields: pickFieldsStub,
        ...token,
      } as any)

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'userEns.eth',
        avatar: 'ERC20',
      } as any)

      const findAddressDetailsStub = sandbox.stub(ProxyWeb3Provider, 'searchDetailsOfContract').resolves({
        name: 'Recipient Contract',
      } as any)

      const findByAddressDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        ens: 'daoEns.eth',
      } as any)

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result?.inputData.function).to.eq('NativeTransfer')
      expect(result?.inputData.textSignature).to.eq('Transfer (Native)')
      expect(result?.sender.address).to.eq(document.daoAddress)
      expect(result?.receiver.address).to.eq(action.to)
      expect(result?.amount).to.eq(action.value)
      expect(result?.type).to.be.eq(ProposalActionType.TransferNative)
      expect(result?.inputData.contract).to.be.eq('Recipient Contract')
      expect(findTokenStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(findByAddressDaoStub.calledOnce).to.be.true
      expect(findAddressDetailsStub.calledOnceWith({ address: action.to, network: NetworksEnum.ethereumSepolia })).to.be
        .true
      expect(pickFieldsStub.calledOnce).to.be.true
      expect(result.token.address).to.be.eq(token.address)
    })

    it('Should decodeTransfer when the reciever is wallet', async () => {
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
        network: NetworksEnum.ethereumSepolia,
      }

      const pickFieldsStub = sandbox.stub()
      // findByTokenAddressAndNetwork
      const findTokenStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
        pickFields: pickFieldsStub,
      } as any)

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'userEns.eth',
        avatar: 'ERC20',
      } as any)

      const findAddressDetailsStub = sandbox.stub(ProxyWeb3Provider, 'searchDetailsOfContract').resolves({
        name: undefined,
      } as any)

      const findByAddressDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        ens: 'daoEns.eth',
      } as any)

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result?.inputData.function).to.eq('NativeTransfer')
      expect(result?.inputData.textSignature).to.eq('Transfer (Native)')
      expect(result?.sender.address).to.eq(document.daoAddress)
      expect(result?.receiver.address).to.eq(action.to)
      expect(result?.amount).to.eq(action.value)
      expect(result?.type).to.be.eq(ProposalActionType.TransferNative)
      expect(result?.inputData.contract).to.be.eq('Wallet Address')
      expect(findTokenStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(findByAddressDaoStub.calledOnce).to.be.true
      expect(findAddressDetailsStub.calledOnceWith({ address: action.to, network: NetworksEnum.ethereumSepolia })).to.be
        .true
      expect(pickFieldsStub.calledOnce).to.be.true
    })

    it('Should not decodeData if not native', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result).to.deep.eq({
        from: document.daoAddress,
        to: action.to,
        value: action.value,
        data: '0x',
        type: ProposalActionType.Unknown,
        inputData: null,
      })
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
          signatures: [
            {
              method: 'mint',
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
              sig: '0x40c10f19',
              fragment: functionFragment as any,
            },
          ],
          abi: abi,
        },
      ]

      const netsepecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves(null as any)

      const result = await decodeActions._decodeWithAbi(
        {
          to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          data: data,
          value: '0',
        },
        NetworksEnum.ethereumSepolia,
      )

      expect(result).to.deep.equal({
        contract: 'IERC20MintableUpgradeable',
        function: 'mint',
        proxyName: undefined,
        implementationAddress: undefined,
        textSignature: 'mint(address,uint256)',
        notice: 'Mint tokens to a specific address',
        parameters: [
          {
            components: undefined,
            name: 'to',
            notice: 'The address to mint tokens to',
            type: 'address',
            value: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          },
          {
            components: undefined,
            name: 'amount',
            notice: 'The amount of tokens to mint',
            type: 'uint256',
            value: '1000000000000000000',
          },
        ],
      })

      expect(netsepecStub.calledOnce).to.be.true
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
        NetworksEnum.ethereumSepolia,
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
          signatures: [
            { notice: 'xx', inputs: [], method: 'mint', sig: '0x40c10f19', fragment: functionFragment as any },
          ],
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
        NetworksEnum.ethereumSepolia,
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

      // Re-configure the existing stub instead of creating a new one
      const stubFourByte = FourByte.getSignatures as sinon.SinonStub
      stubFourByte.resolves({
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

      const result = await decodeActions._decodeFallback({ data, value: 123, to: '0xx' }, NetworksEnum.ethereumSepolia)
      expect(result).to.deep.equal({
        function: 'setMetadata',
        textSignature: 'setMetadata(bytes)',
        parameters: [
          {
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      })
      expect(stubFourByte.calledOnce).to.be.true
    })

    it('should return null if fail to decode', async () => {
      const decodeActions = new DecodeActions()
      const data = '0xee57e36f0000000000000000000000000000000000000000000000000000000000000001'

      // Re-configure the existing stub instead of creating a new one
      const stubFourByte = FourByte.getSignatures as sinon.SinonStub
      stubFourByte.resolves({
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
      const result = await decodeActions._decodeFallback({ data, to: '0x12', value: 123 }, NetworksEnum.ethereumSepolia)
      expect(loggerStub.calledOnceWith('Error decoding action data' as any)).to.be.true
      expect(result).to.be.null
      expect(stubFourByte.calledOnce).to.be.true
    })

    it('should return null if no signatures are found', async () => {
      const decodeActions = new DecodeActions()
      const data = '0x1234567800000000000000000000000000000000000000000000000000000000'

      // Re-configure the existing stub instead of creating a new one
      const stubFourByte = FourByte.getSignatures as sinon.SinonStub
      stubFourByte.resolves({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })

      const parseContractNetspecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves(null as any)

      const result = await decodeActions._decodeFallback(
        {
          data,
          to: '0x12',
          value: 123,
        },
        NetworksEnum.ethereumSepolia,
      )
      expect(result).to.be.null
      expect(stubFourByte.calledOnce).to.be.true
      expect(parseContractNetspecStub.calledOnce).to.be.true
    })

    it('should return null if fail to getSignatures', async () => {
      const decodeActions = new DecodeActions()
      const data = '0xee57e36f0000000000000000000000000000000000000000000000000000000000000001'

      const stubLogger = sandbox.stub(Logger, 'error')
      // Re-configure the existing stub instead of creating a new one
      const stubFourByte = FourByte.getSignatures as sinon.SinonStub
      stubFourByte.rejects(new Error('fake-error'))
      const parseContractNetspecStub = sandbox.stub(decodeActions, 'parseContractNetspec').resolves(null as any)
      const result = await decodeActions._decodeFallback(
        {
          data,
          to: '0x12',
          value: 123,
        },
        NetworksEnum.ethereumSepolia,
      )

      expect(parseContractNetspecStub.notCalled).to.be.true
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
      // For this specific test, we need to restore only the _setupSignatures stub
      const setupSignaturesStub = DecodeActions.prototype._setupSignatures as sinon.SinonStub
      setupSignaturesStub.restore()

      // Re-stub external services to keep them stubbed
      // All stubs already configured in global beforeEach

      const decodeActions = new DecodeActions()

      const allSignatures = decodeActions.allSignatures.map(({ contractName, abi }) => ({ contractName, abi }))
      expect(allSignatures.length).to.eq(17)
      expect(allSignatures[0].contractName).to.eq('TokenVoting')
      expect(allSignatures[1].contractName).to.eq('MajorityVotingBase')
      expect(allSignatures[2].contractName).to.eq('DaoFactory')
      expect(allSignatures[3].contractName).to.eq('Multisig')
      expect(allSignatures[4].contractName).to.eq('ERC20')
      expect(allSignatures[5].contractName).to.eq('ERC721')
      expect(allSignatures[6].contractName).to.eq('ERC1155')
      expect(allSignatures[7].contractName).to.eq('GovernanceERC20')
      expect(allSignatures[8].contractName).to.eq('DAO')
      expect(allSignatures[9].contractName).to.eq('PluginRepo')
      expect(allSignatures[10].contractName).to.eq('PluginRepoFactory')
      expect(allSignatures[11].contractName).to.eq('PluginRepoRegistry')
      expect(allSignatures[12].contractName).to.eq('DAORegistry')
      expect(allSignatures[13].contractName).to.eq('MultiSigSetup')
      expect(allSignatures[14].contractName).to.eq('AddresslistVoting')
      expect(allSignatures[15].contractName).to.eq('StagedProposalProcessor')
      expect(allSignatures[16].contractName).to.eq('IERC20MintableUpgradeable')

      // Re-stub _setupSignatures for subsequent tests
      sandbox.stub(DecodeActions.prototype, '_setupSignatures').returns()
    })
  })

  describe('_getFunctionFragment', () => {
    it('should return the correct function fragment for a valid function selector', () => {
      const decodeActions = new DecodeActions()
      const dataHex = '0x095ea7b3000000000000000000000000'

      const availableSignatures = {
        method: 'approve',
        sig: '0x095ea7b3',
        fragment: 'test' as any,
        notice: 'xx',
        inputs: [],
      }

      const fragment = decodeActions._getFunctionFragment(dataHex, [availableSignatures])
      expect(fragment?.fragment).to.deep.equal('test')
    })

    it('should return undefined for an invalid function selector', () => {
      const decodeActions = new DecodeActions()
      const dataHex = '0x12345678000000000000000000000000' // Invalid function selector
      const availableSignatures = {
        notice: 'xx',
        inputs: [],
        method: 'approve',
        sig: '0x095ea7b3',
        fragment: 'test' as any,
      }

      const fragment = decodeActions._getFunctionFragment(dataHex, [availableSignatures])
      expect(fragment).to.be.undefined
    })
  })

  describe('parseContractNetspec', () => {
    it('should return the correct contract netspec', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves([
        {
          SourceCode: 'contract IERC20MintableUpgradeable { function mint(address to, uint256 amount) public { } }',
          ContractName: 'IERC20MintableUpgradeable',
          ABI: '[]',
        },
      ])
      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          inputs: [
            { name: 'to', type: 'address', notice: 'The address to mint tokens to' },
            { name: 'amount', type: 'uint256', notice: 'The amount of tokens to mint' },
          ],
          notice: 'Mint tokens to a specific address',
          name: 'mint',
          type: 'function',
        },
      ])

      const result = await decodeActions.parseContractNetspec(
        'mint(address,uint256)',
        {
          to: contractAddress,
          data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
          value: '0x',
        },
        network,
      )
      expect(result).to.deep.equal({
        functionName: 'mint',
        contractName: 'IERC20MintableUpgradeable',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          {
            name: 'to',
            type: 'address',
            components: undefined,
            notice: 'The address to mint tokens to',
            value: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          },
          {
            name: 'amount',
            type: 'uint256',
            components: undefined,
            notice: 'The amount of tokens to mint',
            value: '1000000000000000000',
          },
        ],
        notice: 'Mint tokens to a specific address',
      })
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
    })

    it('should return null if no contract netspec is found', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves(null)
      const result = await decodeActions.parseContractNetspec(
        'mint',
        {
          to: contractAddress,
          data: '0x',
          value: '0x',
        },
        network,
      )
      expect(result).to.be.null
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
    })

    it('should handle when rawAction.data is 0x (empty data)', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves([
        {
          SourceCode: 'contract IERC20MintableUpgradeable { function mint(address to, uint256 amount) public { } }',
          ContractName: 'IERC20MintableUpgradeable',
          ABI: JSON.stringify([
            {
              name: 'mint',
              type: 'function',
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
            },
          ]),
        },
      ])
      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          inputs: [
            { name: 'to', type: 'address', notice: 'The address to mint tokens to' },
            { name: 'amount', type: 'uint256', notice: 'The amount of tokens to mint' },
          ],
          notice: 'Mint tokens to a specific address',
          name: 'mint',
          type: 'function',
        },
      ])

      const result = await decodeActions.parseContractNetspec(
        'mint(address,uint256)',
        {
          to: contractAddress,
          data: '0x', // Empty data
          value: '0x',
        },
        network,
      )

      expect(result).to.deep.equal({
        functionName: 'mint',
        contractName: 'IERC20MintableUpgradeable',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          {
            name: 'to',
            type: 'address',
            components: undefined,
            notice: 'The address to mint tokens to',
            value: undefined, // No decoded value since data is empty
          },
          {
            name: 'amount',
            type: 'uint256',
            components: undefined,
            notice: 'The amount of tokens to mint',
            value: undefined, // No decoded value since data is empty
          },
        ],
        notice: 'Mint tokens to a specific address',
      })

      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
    })

    it('should handle when rawAction.data is null/undefined', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves([
        {
          SourceCode: 'contract Test { function test() public { } }',
          ContractName: 'Test',
          ABI: JSON.stringify([
            {
              name: 'test',
              type: 'function',
              inputs: [],
            },
          ]),
        },
      ])
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          inputs: [],
          notice: 'Test function',
          name: 'test',
          type: 'function',
        },
      ])

      const result = await decodeActions.parseContractNetspec(
        'test()',
        {
          to: contractAddress,
          data: null as any, // null data
          value: '0x',
        },
        network,
      )

      expect(result).to.deep.equal({
        functionName: 'test',
        contractName: 'Test',
        proxyName: null,
        implementationAddress: null,
        inputs: [],
        notice: 'Test function',
      })
    })

    it('should handle function with no inputs', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves([
        {
          SourceCode: 'contract Test { function pause() public { } }',
          ContractName: 'Test',
          ABI: JSON.stringify([
            {
              name: 'pause',
              type: 'function',
              inputs: [], // No inputs
            },
          ]),
        },
      ])
      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          inputs: [], // No inputs
          notice: 'Pause the contract',
          name: 'pause',
          type: 'function',
        },
      ])

      const result = await decodeActions.parseContractNetspec(
        'pause()',
        {
          to: contractAddress,
          data: '0x8456cb59', // pause() selector
          value: '0x',
        },
        network,
      )

      expect(result).to.deep.equal({
        functionName: 'pause',
        contractName: 'Test',
        proxyName: null,
        implementationAddress: null,
        inputs: [], // Empty inputs array
        notice: 'Pause the contract',
      })

      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
    })

    it('should handle when abiWithNetSpec is not found but still return parsed netspec', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet
      const functionSelector = '0x12345678'

      sandbox.stub(DecodeActions.prototype, '_getSignaturesFromAbi').returns([
        {
          method: 'someOtherFunction',
          sig: '0x87654321', // Different selector
          fragment: {} as any,
          notice: 'Some other function',
          inputs: [],
        },
      ])

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      // Re-configure the existing stub instead of creating a new one
      const getContractSourceCode = ProxyWeb3Provider.fetchContractSourceCode as sinon.SinonStub
      getContractSourceCode.resolves([
        {
          SourceCode: 'contract Test { }',
          ContractName: 'Test',
          ABI: '[]',
        },
      ])
      sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([])

      const result = await decodeActions.parseContractNetspec(
        functionSelector,
        {
          to: contractAddress,
          data: functionSelector,
          value: '0x',
        },
        network,
      )

      expect(result).to.be.null // Should return null when abiWithNetSpec is not found
    })
  })

  describe('decodeAction', () => {
    it('should _parseVotingSettingUpdateAction for TokenVoting plugin', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'updateVotingSettings(tuple)',
        function: 'updateVotingSettings',
        contract: 'TokenVoting',
        parameters: [
          {
            name: 'setting',
            type: 'uint256',
            value: [1, 2, 3, 4, 5],
          },
          {
            name: 'value',
            type: 'uint256',
            value: 2n,
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        network: NetworksEnum.ethereumSepolia,
      }

      const getPluginDetails = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        network: NetworksEnum.ethereumSepolia,
        tokenAddress: '0xAddress',
        address: action.to,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })
      const getExistingSettingStub = sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null)

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xAddress',
        name: 'Plugin 1',
        symbol: 'P1',
        decimals: 18,
        logo: 'https://plugin1.com/logo.png',
        type: 'ERC20',
        pickFields: sandbox.stub(),
      } as any)

      const result = await decodeActions._parseVotingSettingUpdateAction(baseAction, action, {
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 123,
      })
      expect(result?.type).to.be.eq(ProposalActionType.UpdateTokenVoteSettings)
      expect(getExistingSettingStub.calledOnce).to.be.true
      expect(getExistingSettingStub.args[0][0]).to.be.eq(action.to)
      expect(getExistingSettingStub.args[0][1]).to.be.eq(123)
      expect(getPluginDetails.calledOnce).to.be.true
      expect(getPluginDetails.args[0][0]).to.be.eq(action.to)
      expect(getPluginDetails.args[0][1]).to.be.eq(NetworksEnum.ethereumSepolia)
      expect(result?.proposedSettings).to.deep.eq({
        votingMode: 1,
        supportThreshold: 2,
        minParticipation: 3,
        minDuration: 4,
        minProposerVotingPower: 5,
      })
    })

    it('should _parseVotingSettingUpdateAction for LockToVote plugin', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'updateVotingSettings(tuple)',
        function: 'updateVotingSettings',
        contract: 'LockToVote',
        parameters: [
          {
            name: 'setting',
            type: 'uint256',
            value: [1, 2, 3, 4, 5, 6],
          },
          {
            name: 'value',
            type: 'uint256',
            value: 2n,
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        network: NetworksEnum.ethereumSepolia,
      }

      const getPluginDetails = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        network: NetworksEnum.ethereumSepolia,
        tokenAddress: '0xAddress',
        address: action.to,
        interfaceType: IPluginInterfaceType.lockToVote,
      })
      const getExistingSettingStub = sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null)

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0xAddress',
        name: 'Plugin 1',
        symbol: 'P1',
        decimals: 18,
        logo: 'https://plugin1.com/logo.png',
        type: 'ERC20',
        pickFields: sandbox.stub(),
      } as any)

      const result = await decodeActions._parseVotingSettingUpdateAction(baseAction, action, {
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 123,
      })
      expect(result?.type).to.be.eq(ProposalActionType.UpdateLockToVoteVoteSettings)
      expect(getExistingSettingStub.calledOnce).to.be.true
      expect(getExistingSettingStub.args[0][0]).to.be.eq(action.to)
      expect(getExistingSettingStub.args[0][1]).to.be.eq(123)
      expect(getPluginDetails.calledOnce).to.be.true
      expect(getPluginDetails.args[0][0]).to.be.eq(action.to)
      expect(getPluginDetails.args[0][1]).to.be.eq(NetworksEnum.ethereumSepolia)
      expect(result?.proposedSettings).to.deep.eq({
        votingMode: 1,
        supportThreshold: 2,
        minParticipation: 3,
        minApprovalRatio: 4,
        minDuration: 5,
        minProposerVotingPower: 6,
      })
    })

    it('should fails when the signature is not matched for _parseVotingSettingUpdateAction', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(tuple)',
        function: 'mock',
        contract: 'TokenVoting',
        parameters: [
          {
            name: 'setting',
            type: 'uint256',
            value: 1n,
          },
          {
            name: 'value',
            type: 'uint256',
            value: 2n,
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      }

      const result = await decodeActions._parseVotingSettingUpdateAction(baseAction, action, {} as any)
      expect(result).to.be.null
    })

    it('should return null when plugin has no tokenAddress', async () => {
      const decodeActions = new DecodeActions()
      const mockPlugin = {
        address: '0x2222222222222222222222222222222222222222',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        tokenAddress: null,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)

      const baseAction = {
        textSignature: KnownActionSignature.UpdateVoteSettings,
        parameters: [],
      }

      const action = {
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: '0x',
      }

      const document = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const result = await decodeActions._parseVotingSettingUpdateAction(baseAction as any, action, document as any)

      expect(result).to.be.null
    })

    it('should return null and log warning for unsupported plugin type', async () => {
      const decodeActions = new DecodeActions()
      const mockPlugin = {
        address: '0x3333333333333333333333333333333333333333',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        tokenAddress: '0xtoken',
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({} as any)
      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      const baseAction = {
        textSignature: KnownActionSignature.UpdateVoteSettings,
        parameters: [],
      }

      const action = {
        to: '0x3333333333333333333333333333333333333333',
        value: 0n,
        data: '0x',
      }

      const document = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const result = await decodeActions._parseVotingSettingUpdateAction(baseAction as any, action, document as any)

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
    })

    it('should return undefined when plugin not found in multisig settings', async () => {
      const decodeActions = new DecodeActions()
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      const baseAction = {
        textSignature: KnownActionSignature.UpdateMultiSigSettings,
        parameters: [],
      }

      const action = {
        to: '0x1111111111111111111111111111111111111111',
        value: 0n,
        data: '0x',
      }

      const document = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const result = await decodeActions._parseMultiSigSettingUpdateAction(baseAction as any, action, document as any)

      expect(result).to.be.undefined
    })

    it('should parse the multisign settings', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'updateMultisigSettings(tuple)',
        function: 'updateMultisigSettings',
        contract: 'Multisig',
        parameters: [
          {
            name: 'setting',
            type: 'uint256',
            value: 1n,
          },
          {
            name: 'value',
            type: 'uint256',
            value: 2n,
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        network: NetworksEnum.ethereumSepolia,
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      }

      const getPluginDetailsStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: action.to,
      })
      const getPluginSettingsStub = sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(null)
      const result = await decodeActions._parseMultiSigSettingUpdateAction(baseAction, action, {
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 123,
      })
      expect(getPluginDetailsStub.calledOnce).to.be.true
      expect(getPluginDetailsStub.args[0][0]).to.be.eq(action.to)
      expect(getPluginDetailsStub.args[0][1]).to.be.eq(NetworksEnum.ethereumSepolia)
      expect(result?.type).to.be.eq(ProposalActionType.UpdateMultiSigSettings)
      expect(getPluginSettingsStub.calledOnce).to.be.true
      expect(getPluginSettingsStub.args[0][0]).to.be.eq(action.to)
      expect(getPluginSettingsStub.args[0][1]).to.be.eq(123)
    })

    it('should fails when the signature is not matched for multisign settings', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(tuple)',
        function: 'mock',
        contract: 'Multisig',
        parameters: [
          {
            name: 'setting',
            type: 'uint256',
            value: 1n,
          },
          {
            name: 'value',
            type: 'uint256',
            value: 2n,
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      }

      const result = await decodeActions._parseMultiSigSettingUpdateAction(baseAction, action, {})
      expect(result).to.be.null
    })

    it('_parseTransferAction', async () => {
      const decodeActions = new DecodeActions()

      const baseAction = {
        textSignature: 'transfer(address,uint256)',
        function: 'transfer',
        contract: 'IERC20',
        parameters: [
          {
            name: 'recipient',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }
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
      const pickFields = sandbox.stub()
      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
        pickFields,
      } as any)
      const result = await decodeActions._parseTransferAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(pickFields.calledOnce).to.be.true
    })

    it('should return null when the signature is not correct for transfer', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(address,uint256)',
        function: 'mock',
        contract: 'IERC20',
        parameters: [
          {
            name: 'recipient',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 10n,
        data: '0x',
      }

      const result = await decodeActions._parseTransferAction(baseAction, action, {} as any)

      expect(result).to.be.null
    })

    it('should parse the transfer when the action is transferFrom', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'transferFrom(address,address,uint256)',
        function: 'transferFrom',
        contract: 'IERC20',
        parameters: [
          {
            name: 'sender',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'recipient',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

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

      const pickKeys = sandbox.stub()

      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
        pickFields: pickKeys,
      } as any)

      const result = await decodeActions._parseTransferAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(pickKeys.calledOnce).to.be.true
    })

    it('should parse the transfer when the action is safeTransfer From', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'safeTransferFrom(address,address,uint256)',
        function: 'safeTransferFrom',
        contract: 'IERC20',
        parameters: [
          {
            name: 'sender',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'recipient',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

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

      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
        pickFields: sandbox.stub(),
      } as any)

      const result = await decodeActions._parseTransferAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(saveAndGetStub.calledOnce).to.be.true
    })

    it('should return null when the signature is not correct for add multisig', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(address[])',
        function: 'addAddresses',
        contract: 'Multisig',
        parameters: [
          {
            name: 'multisig',
            type: 'address[]',
            value: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x',
      }
      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }
      const result = await decodeActions._parseAddMemberAction(baseAction, action, document as any)
      expect(result).to.be.null
    })

    it('_parse add multisig action', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'addAddresses(address[])',
        function: 'addAddresses',
        contract: 'Multisig',
        parameters: [
          {
            name: 'multisig',
            type: 'address[]',
            value: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x',
      }
      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const getMultiSigMemberAtBlockNumberStub = sandbox
        .stub(Models.PluginMember, 'findAllMembersOfPlugin')
        .resolves([{ memberAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9E' }])

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'abc.eth',
      } as any)

      const result = await decodeActions._parseAddMemberAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MultisigAddMembers)

      expect(getMultiSigMemberAtBlockNumberStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
    })

    it('should return null when the signature is not correct for remove multisig', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(address[])',
        function: 'removeAddresses',
        contract: 'Multisig',
        parameters: [
          {
            name: 'multisig',
            type: 'address[]',
            value: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x',
      }
      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions._parseRemoveMemberAction(baseAction, action, document as any)
      expect(result).to.be.null
    })

    it('should parse _removeMemberAction', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'removeAddresses(address[])',
        function: 'removeAddresses',
        contract: 'Multisig',
        parameters: [
          {
            name: 'multisig',
            type: 'address[]',
            value: ['0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'],
          },
        ],
      }
      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x',
      }
      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const getMultiSigMemberAtBlockNumberStub = sandbox
        .stub(Models.PluginMember, 'findAllMembersOfPlugin')
        .resolves([{ memberAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9E' }])

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'abc.eth',
      } as any)

      const result = await decodeActions._parseRemoveMemberAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MultisigRemoveMembers)
      expect(getMultiSigMemberAtBlockNumberStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
    })

    it('should return null when the signature is not correct for mint', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mock(address,uint256)',
        function: 'mint',
        contract: 'IERC20Mint',
        parameters: [
          {
            name: 'to',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc319700',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions._parseMintAction(baseAction, action, document as any)
      expect(result).to.be.null
    })

    it('should parse _mintAction', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mint(address,uint256)',
        function: 'mint',
        contract: 'IERC20Mint',
        parameters: [
          {
            name: 'to',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc319700',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
        network: NetworksEnum.ethereumSepolia,
      }

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: ITokenType.ERC20,
      } as any)

      const coinGeckoTokenInfo = sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
        totalSupply: '1000000000000000000',
        holders: 1,
      } as any)

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'abc.eth',
      } as any)

      const tokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock').resolves('1000000000000000000')

      const result = await decodeActions._parseMintAction(baseAction, action, document as any)

      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(result?.type).to.be.eq(ProposalActionType.Mint)
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(coinGeckoTokenInfo.calledOnce).to.be.true
      expect(result!.totalSupply).to.be.eq('1000000000000000000')
      expect(result!.holdersCount).to.be.eq(1)
      expect(tokenBalanceAtBlockStub.calledOnce).to.be.true
    })

    it('should return not proper info when the token is not exist on-chain', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mint(address,uint256)',
        function: 'mint',
        contract: 'IERC20Mint',
        parameters: [
          {
            name: 'to',
            type: 'address',
            value: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
          },
          {
            name: 'amount',
            type: 'uint256',
            value: 10n,
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc319700',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
        network: NetworksEnum.ethereumSepolia,
      }

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')

      const coinGeckoTokenInfo = sandbox.stub(CoinGeckoHelper, 'getToken')

      const loggerStub = sandbox.stub(Logger, 'error')

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Member, 'findByAddress').resolves(null)

      const tokenBalanceAtBlockStub = sandbox.stub(Web3Helper, 'getTokenBalanceAtBlock')
      const result = await decodeActions._parseMintAction(baseAction, action, document as any)
      expect(loggerStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(result?.type).to.be.eq(ProposalActionType.Mint)
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(coinGeckoTokenInfo.calledOnce).to.be.false
      expect(tokenBalanceAtBlockStub.calledOnce).to.be.false
      expect(result!.totalSupply).to.be.eq('0')
      expect(result!.holdersCount).to.be.eq(0)
    })

    it('should retunr null if the signature is not correct for updateDaoMetadata', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'mockSig(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result).to.be.null
    })

    it('should parse _parseUpdateDaoMetadata', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const getMetadataAtBlockNumberStub = sandbox.stub(Models.LogMetadata, 'getMetadataAtBlockNumber').resolves({
        name: 'MockDao',
      })
      const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
      // Re-configure the existing stub instead of creating a new one
      const ipfsFetchStubb = Ipfs.fetchMetadata as sinon.SinonStub
      ipfsFetchStubb.resolves({
        name: 'Updated Dao',
      })

      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MetadataUpdate)
      expect(stubExtractMetadataUri.calledOnce).to.be.true
      expect(ipfsFetchStubb.calledOnce).to.be.true
      expect(getMetadataAtBlockNumberStub.calledOnce).to.be.true
    })

    it('should return null if the hash is not correct when updating medatadata in dao', async () => {
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns(null)
      const decodeActions = new DecodeActions()
      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result).to.be.null
      expect(stubExtractMetadataUri.calledOnce).to.be.true
    })

    it('should return null if the ipfs content is not valid', async () => {
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
      // Re-configure the existing stub instead of creating a new one
      const ipfsFetchStubb = Ipfs.fetchMetadata as sinon.SinonStub
      ipfsFetchStubb.resolves(null)
      const decodeActions = new DecodeActions()

      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)

      expect(result).to.be.null
      expect(stubExtractMetadataUri.calledOnce).to.be.true
      expect(ipfsFetchStubb.calledOnce).to.be.true
    })

    it('should return null if the metadata is not valid', async () => {
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
      // Re-configure the existing stub instead of creating a new one
      const ipfsFetchStubb = Ipfs.fetchMetadata as sinon.SinonStub
      ipfsFetchStubb.rejects(new Error('fake-error'))

      const decodeActions = new DecodeActions()
      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)

      expect(result).to.be.null
      expect(stubExtractMetadataUri.calledOnce).to.be.true
      expect(ipfsFetchStubb.calledOnce).to.be.true
    })

    it('should return null when parsing if the metadata is not for existing plugin and doo', async () => {
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0x40c10f19',
      }

      const actionDecode = new DecodeActions()

      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)

      const result = await actionDecode._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result).to.be.null
    })

    it('should return null when parsing if the metadata is not for existing plugin and doo', async () => {
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          {
            name: 'metadata',
            type: 'bytes',
            value:
              '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
          },
        ],
      }

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x4949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        pluginAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        blockNumber: 123,
        network: NetworksEnum.ethereumSepolia,
      }

      const mockMetadata = {
        name: 'MockDao',
        description: 'Mock Description',
        logo: 'https://mock.com/logo.png',
        avatar: 'https://mock.com/avatar.png',
        links: [
          {
            name: 'twitter',
            url: 'https://twitter.com',
          },
          {
            name: 'discord',
            url: 'https://discord.com',
          },
        ],
        processKey: 'abc',
        stageNames: [],
      }

      const actionDecode = new DecodeActions()

      sandbox.stub(Models.Dao, 'findByAddress').resolves(false)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      sandbox.stub(Models.LogMetadata, 'getMetadataAtBlockNumber').resolves({
        ...mockMetadata,
        name: 'old',
      })
      // IPFSModule and Ipfs are the same, use the existing stub
      const ipfsStub = Ipfs.fetchMetadata as sinon.SinonStub
      ipfsStub.resolves(mockMetadata)
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
      const parseContractNetspecStub = sandbox.stub(actionDecode, 'parseContractNetspec').resolves({
        functionName: 'setMetadata(bytes)',
        notice: 'notice',
        contractName: 'contractName',
        proxyName: 'proxyName',
        implementationAddress: 'implementationAddress',
        inputs: [
          {
            name: 'name',
            type: 'bytes',
            components: undefined,
            notice: 'notice',
            value: 'value',
          },
        ],
      })

      const result = await actionDecode._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result?.type).to.be.eq('MetadataPluginUpdate')
      expect(parseContractNetspecStub.calledOnce).to.be.true
    })
  })

  describe('_parseStageUpdatedOnSppAction', () => {
    it('should return parsed stages and existing stages when decodedData matches KnownActionSignature.StagesUpdated', async () => {
      const decodedData = {
        textSignature: KnownActionSignature.StagesUpdated,
        parameters: [
          {
            value: [
              [
                [
                  ['0xplugin1', true, false, 'resultType1'],
                  ['0xplugin2', false, true, 'resultType2'],
                ],
                10, // maxAdvance
                5, // minAdvance
                100, // voteDuration
                75, // approvalThreshold
                25, // vetoThreshold
                true, // cancelable
                false, // editable
              ],
            ],
          },
        ],
      } as any

      const action = {
        id: 'action-id',
        type: 'test-action',
      } as any

      const document = {
        daoAddress: '0xdao-address',
        network: 'ethereumMainnet',
        pluginAddress: '0xplugin-address',
      } as any

      const activeSettings = [
        {
          stageIndex: 0,
          maxAdvance: 15,
          minAdvance: 7,
          voteDuration: 120,
          approvalThreshold: 80,
          vetoThreshold: 20,
          cancelable: true,
          editable: true,
          plugins: [
            {
              address: '0xplugin1',
              isManual: true,
              allowedBody: false,
              proposalType: 'resultType1',
            },
          ],
        },
      ]

      sandbox.stub(Models.Setting, 'findActive').resolves(activeSettings)

      const decodeAction = new DecodeActions()

      const result = await decodeAction._parseStageUpdatedOnSppAction(decodedData, action, document)

      expect(result).to.deep.equal({
        ...action,
        inputData: decodedData,
        type: ProposalActionType.StagesUpdated,
        proposedSettings: [
          {
            bodies: [
              {
                addr: '0xplugin1',
                isManual: true,
                tryAdvance: false,
                resultType: 'resultType1',
              },
              {
                addr: '0xplugin2',
                isManual: false,
                tryAdvance: true,
                resultType: 'resultType2',
              },
            ],
            stageIndex: 0,
            maxAdvance: 10,
            minAdvance: 5,
            voteDuration: 100,
            approvalThreshold: 75,
            vetoThreshold: 25,
            cancelable: true,
            editable: false,
          },
        ],
        existingSettings: [
          {
            stageIndex: 0,
            maxAdvance: 15,
            minAdvance: 7,
            voteDuration: 120,
            approvalThreshold: 80,
            vetoThreshold: 20,
            cancelable: true,
            editable: true,
            plugins: [
              {
                addr: '0xplugin1',
                isManual: true,
                tryAdvance: false,
                resultType: 'resultType1',
              },
            ],
          },
        ],
      })
    })

    it('should return null if decodedData does not match KnownActionSignature.StagesUpdated', async () => {
      const decodedData = {
        textSignature: 'InvalidSignature',
      } as any

      const action = {
        id: 'action-id',
        type: 'test-action',
      } as any

      const document = {
        daoAddress: '0xdao-address',
        network: 'ethereumMainnet',
        pluginAddress: '0xplugin-address',
      } as any

      const decodeAction = new DecodeActions()
      const result = await decodeAction._parseStageUpdatedOnSppAction(decodedData, action, document)

      expect(result).to.be.null
    })

    it('should handle errors and return an empty stages array', async () => {
      const decodedData = {
        textSignature: KnownActionSignature.StagesUpdated,
        parameters: [
          {
            value: 'InvalidData',
          },
        ],
      } as any

      const action = {
        id: 'action-id',
        type: 'test-action',
      } as any

      const document = {
        daoAddress: '0xdao-address',
        network: 'ethereumMainnet',
        pluginAddress: '0xplugin-address',
      } as any

      sandbox.stub(Models.Setting, 'findActive').throws(new Error('Test Error'))

      const decodeAction = new DecodeActions()
      const result = await decodeAction._parseStageUpdatedOnSppAction(decodedData, action, document)

      expect(result).to.deep.equal({
        ...action,
        inputData: decodedData,
        type: ProposalActionType.StagesUpdated,
        proposedSettings: [],
        existingSettings: [],
      })
    })
  })

  it('should parse _parseRegisterGauge', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'registerGauge(address,uint8,address,string)',
      function: 'registerGauge',
      contract: 'GaugeRegistrar',
      parameters: [
        { name: '_qiToken', type: 'address', value: '0xQiToken' },
        { name: '_incentive', type: 'uint8', value: 0 },
        { name: '_rewardController', type: 'address', value: '0xRewardController' },
        {
          name: '_metadataURI',
          type: 'bytes',
          value:
            '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
        },
      ],
    }

    const action = {
      to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      value: 0n,
      data: '0x00',
    }

    const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
    // Re-configure the existing stub instead of creating a new one
    const ipfsFetchStub = Ipfs.fetchMetadata as sinon.SinonStub
    ipfsFetchStub.resolves({
      name: 'Gauge info',
    })

    const result = await decodeActions._parseRegisterGauge(baseAction, action)
    expect(result?.type).to.be.eq(ProposalActionType.RegisterGauge)
    expect(result?.gaugeMetadata).to.deep.equal({ name: 'Gauge info' })
    expect(stubExtractMetadataUri.calledOnce).to.be.true
    expect(ipfsFetchStub.calledOnce).to.be.true
  })

  it('should return null when _parseRegisterGauge signature does not match', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'wrongSignature',
      parameters: [],
    }

    const action = {
      to: '0x4444444444444444444444444444444444444444',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseRegisterGauge(baseAction as any, action)

    expect(result).to.be.null
  })

  it('should return null when ipfsUrl is not found in _parseRegisterGauge', async () => {
    const decodeActions = new DecodeActions()
    sandbox.stub(Web3Utils, 'extractMetadataUri').returns(null)

    const baseAction = {
      textSignature: KnownActionSignature.RegisterGauge,
      parameters: [{}, {}, {}, { value: 'no-ipfs' }],
    }

    const action = {
      to: '0x5555555555555555555555555555555555555555',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseRegisterGauge(baseAction as any, action)

    expect(result).to.be.null
  })

  it('should return null when gaugeMetadata is null in _parseRegisterGauge', async () => {
    const decodeActions = new DecodeActions()
    sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://test')
    const ipfsFetchStub = Ipfs.fetchMetadata as sinon.SinonStub
    ipfsFetchStub.resolves(null)

    const baseAction = {
      textSignature: KnownActionSignature.RegisterGauge,
      parameters: [{}, {}, {}, { value: 'metadata' }],
    }

    const action = {
      to: '0x6666666666666666666666666666666666666666',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseRegisterGauge(baseAction as any, action)

    expect(result).to.be.null
  })

  it('should return null when fetchMetadata throws error in _parseRegisterGauge', async () => {
    const decodeActions = new DecodeActions()
    sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://test')
    const ipfsFetchStub = Ipfs.fetchMetadata as sinon.SinonStub
    ipfsFetchStub.rejects(new Error('IPFS error'))

    const baseAction = {
      textSignature: KnownActionSignature.RegisterGauge,
      parameters: [{}, {}, {}, { value: 'metadata' }],
    }

    const action = {
      to: '0x7777777777777777777777777777777777777777',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseRegisterGauge(baseAction as any, action)

    expect(result).to.be.null
  })

  it('should parse _parseCreateGauge', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'createGauge(address,string)',
      function: 'createGauge',
      contract: 'GaugeVoter',
      parameters: [
        { name: '_gauge', type: 'address', value: '0xGaugeAddress' },
        {
          name: '_metadataURI',
          type: 'bytes',
          value:
            '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
        },
      ],
    }

    const action = {
      to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      value: 0n,
      data: '0x00',
    }

    const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
    // Re-configure the existing stub instead of creating a new one
    const ipfsFetchStub = Ipfs.fetchMetadata as sinon.SinonStub
    ipfsFetchStub.resolves({
      name: 'Gauge info',
    })

    const result = await decodeActions._parseCreateGauge(baseAction, action)
    expect(result?.type).to.be.eq(ProposalActionType.CreateGauge)
    expect(result?.gaugeMetadata).to.deep.equal({ name: 'Gauge info' })
    expect(stubExtractMetadataUri.calledOnce).to.be.true
    expect(ipfsFetchStub.calledOnce).to.be.true
  })

  it('should return null when _parseCreateGauge signature does not match', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'wrongSignature',
      parameters: [],
    }

    const action = {
      to: '0x4444444444444444444444444444444444444444',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseCreateGauge(baseAction as any, action)

    expect(result).to.be.null
  })

  it('should parse _parseUpdateGaugeMetadata', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'updateGaugeMetadata(address,string)',
      function: 'updateGaugeMetadata',
      contract: 'GaugeVoter',
      parameters: [
        { name: '_gauge', type: 'address', value: '0xGaugeAddress' },
        {
          name: '_metadataURI',
          type: 'bytes',
          value:
            '0x697066733a2f2f516d4e753239435378354276596a506a786d716e6a6a6d5a68326e6a4e4b6e68346a7a566b5a6d476d4778667458',
        },
      ],
    }

    const action = {
      to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      value: 0n,
      data: '0x00',
    }

    const stubExtractMetadataUri = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://link')
    // Re-configure the existing stub instead of creating a new one
    const ipfsFetchStub = Ipfs.fetchMetadata as sinon.SinonStub
    ipfsFetchStub.resolves({
      name: 'Gauge info',
    })

    const result = await decodeActions._parseUpdateGaugeMetadata(baseAction, action)
    expect(result?.type).to.be.eq(ProposalActionType.UpdateGaugeMetadata)
    expect(result?.gaugeMetadata).to.deep.equal({ name: 'Gauge info' })
    expect(stubExtractMetadataUri.calledOnce).to.be.true
    expect(ipfsFetchStub.calledOnce).to.be.true
  })

  it('should return null when _parseUpdateGaugeMetadata signature does not match', async () => {
    const decodeActions = new DecodeActions()
    const baseAction = {
      textSignature: 'wrongSignature',
      parameters: [],
    }

    const action = {
      to: '0x4444444444444444444444444444444444444444',
      value: 0n,
      data: '0x',
    }

    const result = await decodeActions._parseUpdateGaugeMetadata(baseAction as any, action)

    expect(result).to.be.null
  })
})
