import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DecodeActions from '@helpers/decodeAction'
import { expect } from 'chai'
import { Fragment, FunctionFragment, Interface } from 'ethers'
import FourByte from '@helpers/4byte'
import Logger from '@logger'
import { NetworksEnum, ProposalActionType } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import Covalent from '@helpers/covalent'
import ProxyContract from '@helpers/proxyContract'
import Etherscan from '@helpers/etherscan'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import Ipfs from '@modules/ipfs'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'

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

      const stubParseContractNetspec = sandbox.stub(decodeActions, 'parseContractNetspec').resolves()
      const stubMint = sandbox.stub(decodeActions, '_parseMintAction').resolves({} as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('0')
      const getTokenInfoWithCovalentStub = sandbox.stub(Covalent, 'getTokenInfo').resolves({
        totalSupply: '1000000000000000000',
        totalHolders: 1,
      })

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      await decodeActions.decodeData(action, {
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubMint.calledOnce).to.be.true
      expect(stubParseContractNetspec.notCalled).to.be.true
      expect(getERC20BalanceStub.notCalled).to.be.true
      expect(getTokenInfoWithCovalentStub.calledOnce).to.be
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
    expect(stubDecodeFallback.calledOnceWith(action.data)).to.be.true
    expect(stubNetspec.calledOnce).to.be.true
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

  it('should preserve decoded parameters when netspec has fewer inputs in decodeData', async () => {
    const decodeActions = new DecodeActions()
    const decoded = {
      function: 'createCampaign',
      textSignature: 'createCampaign(bytes,(bytes32,bytes,bytes),(address,bytes32,bytes),(uint64,uint64))',
      parameters: [
        { name: 'arg0', type: 'bytes', value: '0x1234' },
        { name: 'arg1', type: '(bytes32,bytes,bytes)', value: ['0x00', '0x', '0x'] },
        { name: 'arg2', type: '(address,bytes32,bytes)', value: ['0x1', '0x00', '0x'] },
        { name: 'arg3', type: '(uint64,uint64)', value: ['1', '2'] },
      ],
    }

    sandbox.stub(decodeActions, '_decodeWithAbi').resolves(decoded as any)
    sandbox.stub(decodeActions, '_decodeFallback').resolves(null)
    sandbox.stub(decodeActions, 'parseContractNetspec').resolves({
      contractName: 'CampaignContract',
      notice: 'Create campaign',
      implementationAddress: '0x1111111111111111111111111111111111111111',
      inputs: [{ name: 'metadata', type: 'bytes', notice: 'first input only', components: [] }],
    } as any)

    const result = await decodeActions.decodeData(
      {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x12345678',
      },
      { network: NetworksEnum.ethereumSepolia, daoAddress: '0xDao' } as any,
    )

    expect(result).to.not.be.null
    expect(result?.type).to.eq(ProposalActionType.Unknown)
    expect(result?.inputData?.parameters).to.have.length(4)
    expect(result?.inputData?.implementationAddress).to.eq('0x1111111111111111111111111111111111111111')
    expect(result?.inputData?.parameters?.[0]).to.deep.include({
      name: 'metadata',
      type: 'bytes',
      notice: 'first input only',
    })
    expect(result?.inputData?.parameters?.[1]).to.deep.include({
      name: 'arg1',
      type: '(bytes32,bytes,bytes)',
    })
    expect(result?.inputData?.parameters?.[2]).to.deep.include({
      name: 'arg2',
      type: '(address,bytes32,bytes)',
    })
    expect(result?.inputData?.parameters?.[3]).to.deep.include({
      name: 'arg3',
      type: '(uint64,uint64)',
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

      // findByTokenAddressAndNetwork
      const findTokenStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'userEns.eth',
        avatar: 'ERC20',
      } as any)

      const findByAddressDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        ens: 'daoEns.eth',
      } as any)

      const result = await decodeActions.decodeTransfer(action, document as any)

      expect(result?.inputData.function).to.eq('NativeTransfer')
      expect(result?.inputData.textSignature).to.eq('nativeTransfer(address,uint256)')
      expect(result?.sender.address).to.eq(document.daoAddress)
      expect(result?.receiver.address).to.eq(action.to)
      expect(result?.amount).to.eq(action.value)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(result?.inputData.contract).to.be.eq('NativeToken')
      expect(findTokenStub.calledOnce).to.be.true
      expect(createMemberStub.calledOnce).to.be.true
      expect(findByAddressDaoStub.calledOnce).to.be.true
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

      const result = await decodeActions._decodeWithAbi({
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        data: data,
        value: '0',
      })

      expect(result).to.deep.equal({
        contract: 'IERC20MintableUpgradeable',
        function: 'mint',
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
    })

    it('should return null if no matching ABI is found', async () => {
      const decodeActions = new DecodeActions()
      const data =
        '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000'

      // No ABI setup
      decodeActions.allSignatures = []

      const result = await decodeActions._decodeWithAbi({
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        data: data,
        value: '0',
      })

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
      const result = await decodeActions._decodeWithAbi({
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        data: data,
        value: '0',
      })
      expect(result).to.be.null
      expect(stubLogger.calledWith('Error decoding action data with abi' as any)).to.be.true
    })

    it('should decode tuple-heavy calldata and keep all parameters', async () => {
      const decodeActions = new DecodeActions()
      const createCampaignAbi = [
        {
          type: 'function',
          name: 'createCampaign',
          inputs: [
            { name: 'metadata', type: 'bytes' },
            {
              name: 'stage1',
              type: 'tuple',
              components: [
                { name: 'id', type: 'bytes32' },
                { name: 'payload', type: 'bytes' },
                { name: 'extra', type: 'bytes' },
              ],
            },
            {
              name: 'stage2',
              type: 'tuple',
              components: [
                { name: 'target', type: 'address' },
                { name: 'id', type: 'bytes32' },
                { name: 'payload', type: 'bytes' },
              ],
            },
            {
              name: 'timing',
              type: 'tuple',
              components: [
                { name: 'start', type: 'uint64' },
                { name: 'end', type: 'uint64' },
              ],
            },
          ],
        },
      ]
      const iface = new Interface(createCampaignAbi)
      const encodedData = iface.encodeFunctionData('createCampaign', [
        '0x1234',
        ['0x' + '11'.repeat(32), '0xabcd', '0xdeadbeef'],
        ['0x1111111111111111111111111111111111111111', '0x' + '22'.repeat(32), '0xbeef'],
        [10n, 20n],
      ])

      decodeActions.allSignatures = [
        {
          contractName: 'CampaignPlugin',
          signatures: [
            {
              method: 'createCampaign',
              inputs: createCampaignAbi[0].inputs,
              notice: 'Create campaign',
              sig: FunctionFragment.getSelector('createCampaign', createCampaignAbi[0].inputs as any),
              fragment: Fragment.from(createCampaignAbi[0]) as any,
            },
          ],
          abi: createCampaignAbi as any,
        },
      ]

      const result = await decodeActions._decodeWithAbi({
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: encodedData,
      })

      expect(result).to.not.be.null
      expect(result?.function).to.equal('createCampaign')
      expect(result?.parameters).to.have.length(4)
      expect(result?.parameters?.[0].value).to.equal('0x1234')
      expect(result?.parameters?.[1].value).to.deep.equal(['0x' + '11'.repeat(32), '0xabcd', '0xdeadbeef'])
      expect(result?.parameters?.[2].value).to.deep.equal([
        '0x1111111111111111111111111111111111111111',
        '0x' + '22'.repeat(32),
        '0xbeef',
      ])
      expect(result?.parameters?.[3].value).to.deep.equal(['10', '20'])
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
      const getContractSourceCode = sandbox.stub(Etherscan, 'fetchContractSourceCode').resolves([
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

      const result = await decodeActions.parseContractNetspec('mint', contractAddress, network)
      expect(result).to.deep.equal({
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
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
    })

    it('should return null if no contract netspec is found', async () => {
      const decodeActions = new DecodeActions()
      const contractAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
      const network = NetworksEnum.ethereumMainnet

      const getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
      const getContractSourceCode = sandbox.stub(Etherscan, 'fetchContractSourceCode').resolves(null)
      const result = await decodeActions.parseContractNetspec('mint', contractAddress, network)
      expect(result).to.be.null
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getContractSourceCode.calledOnce).to.be.true
    })
  })

  describe('decodeAction', () => {
    it('should _parseTokenVotingSettingUpdateAction', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'updateVotingSettings(tuple)',
        function: 'updateVotingSettings',
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

      const result = await decodeActions._parseTokenVotingSettingUpdateAction(baseAction, action)
      expect(result?.type).to.be.eq(ProposalActionType.UpdateVoteSettings)
    })

    it('should fails when the signature is not matched for _parseTokenVotingSettingUpdateAction', async () => {
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

      const result = await decodeActions._parseTokenVotingSettingUpdateAction(baseAction, action)
      expect(result).to.be.null
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
        data: '0x40c10f1900000000000000000000000x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
      }

      const result = await decodeActions._parseMultiSigSettingUpdateAction(baseAction, action)
      expect(result?.type).to.be.eq(ProposalActionType.UpdateMultiSigSettings)
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

      const result = await decodeActions._parseMultiSigSettingUpdateAction(baseAction, action)
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
      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)
      const result = await decodeActions._parseTransferAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(saveAndGetStub.calledOnce).to.be.true
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

      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const result = await decodeActions._parseTransferAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Transfer)
      expect(saveAndGetStub.calledOnce).to.be.true
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
        .stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin')
        .resolves([{ memberAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9E' }])

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'abc.eth',
      } as any)

      const result = await decodeActions._parseAddMemberAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MultisigAddMembers)

      expect(getMultiSigMemberAtBlockNumberStub.calledOnce).to.be.true
      expect(createMemberStub.calledOnce).to.be.true
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
        .stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin')
        .resolves([{ memberAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9E' }])

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        ens: 'abc.eth',
      } as any)

      const result = await decodeActions._parseRemoveMemberAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MultisigRemoveMembers)
      expect(getMultiSigMemberAtBlockNumberStub.calledOnce).to.be.true
      expect(createMemberStub.calledOnce).to.be.true
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
      }

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        name: 'MockToken',
        symbol: 'MOCK',
        decimals: 18,
        logo: 'https://mock.com/logo.png',
        type: 'ERC20',
      } as any)

      const covalentTokenInfo = sandbox.stub(Covalent, 'getTokenInfo').resolves({
        totalSupply: '1000000000000000000',
        totalHolders: 1,
      })

      const result = await decodeActions._parseMintAction(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.Mint)
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(covalentTokenInfo.calledOnce).to.be.true
      expect(result!.totalSupply).to.be.eq('1000000000000000000')
      expect(result!.holdersCount).to.be.eq(1)
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
      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('http://link')
      const ipfsFetchStubb = sandbox.stub(Ipfs, 'fetchMetadata').resolves({
        name: 'Updated Dao',
      })

      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)
      expect(result?.type).to.be.eq(ProposalActionType.MetadataUpdate)
      expect(stubExtractMetadataUri.calledOnce).to.be.true
      expect(ipfsFetchStubb.calledOnce).to.be.true
      expect(getMetadataAtBlockNumberStub.calledOnce).to.be.true
    })

    it('should preserve extra metadata params when plugin netspec has fewer inputs', async () => {
      const decodeActions = new DecodeActions()
      const baseAction = {
        textSignature: 'setMetadata(bytes)',
        function: 'setMetadata',
        contract: 'DaoFactory',
        parameters: [
          { name: 'metadata', type: 'bytes', value: '0x1234' },
          { name: 'context', type: 'bytes32', value: '0x' + 'ab'.repeat(32) },
        ],
      }

      const action = {
        to: '0x8888888888888888888888888888888888888888',
        value: 0n,
        data: '0x00',
      }

      const document = {
        daoAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 10,
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null as any)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null as any)
      sandbox.stub(Models.LogMetadata, 'getMetadataAtBlockNumber').resolves({ name: 'Old metadata' } as any)
      sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://example')
      sandbox.stub(Ipfs, 'fetchMetadata').resolves({ name: 'New metadata' } as any)
      sandbox.stub(decodeActions, 'parseContractNetspec').resolves({
        contractName: 'PluginContract',
        notice: 'Plugin metadata update',
        inputs: [{ name: 'pluginMetadata', type: 'bytes', notice: 'plugin metadata bytes' }],
      } as any)

      const result = await decodeActions._parseUpdateDaoMetadata(baseAction as any, action as any, document as any)

      expect(result).to.not.be.null
      expect(result?.type).to.be.eq(ProposalActionType.MetadataUpdate)
      expect(result?.inputData.parameters).to.have.length(2)
      expect(result?.inputData.parameters?.[0]).to.deep.include({
        name: 'pluginMetadata',
        type: 'bytes',
        notice: 'plugin metadata bytes',
      })
      expect(result?.inputData.parameters?.[1]).to.deep.include({
        name: 'context',
        type: 'bytes32',
      })
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

      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(null)
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

      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('http://link')
      const ipfsFetchStubb = sandbox.stub(Ipfs, 'fetchMetadata').resolves(null)
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

      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('http://link')
      const ipfsFetchStubb = sandbox.stub(Ipfs, 'fetchMetadata').rejects(new Error('fake-error'))

      const decodeActions = new DecodeActions()
      const result = await decodeActions._parseUpdateDaoMetadata(baseAction, action, document as any)

      expect(result).to.be.null
      expect(stubExtractMetadataUri.calledOnce).to.be.true
      expect(ipfsFetchStubb.calledOnce).to.be.true
    })
  })
})
