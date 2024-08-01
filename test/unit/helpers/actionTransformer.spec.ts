import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ActionTransformer from '@helpers/actionTransformer'
import { type IProposalRawAction, ProposalActionType } from '@types'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'

describe('Helper:Action Transformer', () => {
  const rawActions = [
    {
      to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      data: '0xa9059cbb000000000000000000000000ff557d98dd04cda5edab8837e52cdff7479af6d0000000000000000000000000000000000000000000000000000000000a408300',
      value: '0',
      functionName: 'transfer',
      textSignature: 'transfer(address,uint256)',
      decoded: ['0xFf557D98dD04cDA5EDAB8837E52cDfF7479af6D0', 172000000],
      contractName: 'ERC20',
      type: 'Transfer',
      metadata: {
        token: {
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          name: '(PoS) Tether USD',
          symbol: 'USDT',
          decimals: 6,
          logo: 'https://logos.covalenthq.com/tokens/1/0xdac17f958d2ee523a2206206994597c13d831ec7.png',
          type: 'ERC20',
        },
        from: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
        to: '0xFf557D98dD04cDA5EDAB8837E52cDfF7479af6D0',
        value: '172000000',
      },
    },
    {
      to: '0x6ED29345A6a5e2317e2D09D6f54574cEF95320C7',
      data: '0x40c10f19000000000000000000000000d2da987db6c5d336451e9e2fe90cc4aa093e71dc00000000000000000000000000000000000000000000152d02c7e14af6800000',
      value: '0',
      functionName: 'mint',
      textSignature: 'mint(address,uint256)',
      decoded: ['0xD2DA987DB6C5D336451e9E2FE90cc4aA093E71Dc', '123213213'],
      contractName: 'IERC20MintableUpgradeable',
      type: 'Mint',
      metadata: {
        token: {
          address: '0x6ED29345A6a5e2317e2D09D6f54574cEF95320C7',
          name: 'Ghoodtest',
          symbol: 'GHT',
          decimals: 18,
          logo: 'https://logos.covalenthq.com/tokens/42161/0x6ed29345a6a5e2317e2d09d6f54574cef95320c7.png',
          type: 'GovernanceERC20',
        },
        to: '0xD2DA987DB6C5D336451e9E2FE90cc4aA093E71Dc',
        value: '1213213213',
      },
    },
    {
      to: '0x71a9924745E1D28E90811ee3D8f3193686026333',
      data: '0x3628731c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000010853821beb29e2ff64887c90d4570f384566a3a',
      value: '0',
      functionName: 'addAddresses',
      textSignature: 'addAddresses(address[])',
      decoded: [['0x10853821bEb29e2fF64887C90D4570f384566A3A']],
      contractName: 'Multisig',
      type: 'MultisigAddMembers',
      metadata: {
        addresses: ['0x10853821bEb29e2fF64887C90D4570f384566A3A'],
      },
    },
    {
      to: '0x71a9924745E1D28E90811ee3D8f3193686026333',
      data: '0x3628731c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000010853821beb29e2ff64887c90d4570f384566a3a',
      value: '0',
      functionName: 'removeAddresses',
      textSignature: 'removeAddresses(address[])',
      decoded: [['0x10853821bEb29e2fF64887C90D4570f384566A3A']],
      contractName: 'Multisig',
      type: 'MultisigRemoveMembers',
      metadata: {
        addresses: ['0x10853821bEb29e2fF64887C90D4570f384566A3A'],
      },
    },
    {
      to: '0x144e75D56E571e8964C6B2C532187561fBB5A275',
      data: '0xee57e36f00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000042697066733a2f2f6261666b72656965687935776f70676a327069657269726f6d6a7978797871676d6474366d6679336c3468747768376e337862686b6d6e63783569000000000000000000000000000000000000000000000000000000000000',
      value: '0',
      functionName: 'setMetadata',
      textSignature: 'setMetadata(bytes)',
      decoded: [
        '0x697066733a2f2f6261666b72656965687935776f70676a327069657269726f6d6a7978797871676d6474366d6679336c3468747768376e337862686b6d6e63783569',
      ],
      contractName: null,
      type: 'MetadataUpdate',
      metadata: {
        ipfsUrl: 'ipfs://bafkreiehy5wopgj2pieriromjyxyxqgmdt6mfy3l4htwh7n3xbhkmncx5i',
        name: 'Simtoonia',
        description: "We're the future of the Internet!",
        avatar: 'ipfs://QmbSjz8FdVsheZJ476SwB17PuZCTPMzVMDbWU7SH4uV4bL',
        links: [],
      },
    },
    {
      to: '0x96D33DE643815AeDb78057A0742F266BdAd35220',
      data: '0x303f433600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001',
      value: '0',
      functionName: 'updateMultisigSettings',
      textSignature: 'updateMultisigSettings(tuple)',
      decoded: [
        [
          true,
          {
            $numberLong: '1',
          },
        ],
      ],
      contractName: 'Multisig',
      type: 'UpdateMultiSigSettings',
      metadata: {
        onlyListed: true,
        minApprovals: {
          $numberLong: '1',
        },
      },
    },
    {
      to: '0x8C94ffb7f86c1E919bc82D430919C9B25Efa1db2',
      data: '0x0dfb278e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000007a120000000000000000000000000000000000000000000000000000000000002981000000000000000000000000000000000000000000000000000000000000151800000000000000000000000000000000000000000000000000000000000000000',
      value: '0',
      functionName: 'updateVotingSettings',
      textSignature: 'updateVotingSettings(tuple)',
      decoded: [[1, 500000, 17000, 86400, 0]],
      contractName: 'MajorityVotingBase',
      type: 'UpdateVoteSettings',
      metadata: {
        votingMode: 1,
        supportThreshold: '500000',
        minParticipation: '17000',
        minDuration: '86400',
        minProposerVotingPower: 0,
      },
    },
  ]

  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  function getByType(type: ProposalActionType) {
    return rawActions.find(action => action.type === type)
  }

  it('should parse the transfer', async () => {
    const transfer = getByType(ProposalActionType.Transfer)
    sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork')
    const action = await ActionTransformer.handleAction(
      transfer as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.Transfer)
  })

  it('should parse the mint', async () => {
    sandbox.stub(Web3Helper, 'getERC20Balance')
    const mint = getByType(ProposalActionType.Mint)
    const action = await ActionTransformer.handleAction(
      mint as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
        token: {
          totalSupply: '1000000000000000000000000000',
          holdersCount: 1,
        },
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.Mint)
  })

  it('should parse the multisig add members', async () => {
    sandbox.stub(Models.LogMember, 'getMultiSigMemberAtBlockNumber').resolves({
      members: ['0x10853821bEb29e2fF64887C90D4570f384566A3A'],
    })
    const addMembers = getByType(ProposalActionType.MultisigAddMembers)
    const action = await ActionTransformer.handleAction(
      addMembers as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.MultisigAddMembers)
  })

  it('should parse the multisig remove members', async () => {
    sandbox.stub(Models.LogMember, 'getMultiSigMemberAtBlockNumber').resolves({
      members: ['0x10853821bEb29e2fF64887C90D4570f384566A3A'],
    })
    const removeMembers = getByType(ProposalActionType.MultisigRemoveMembers)
    const action = await ActionTransformer.handleAction(
      removeMembers as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.MultisigRemoveMembers)
  })

  it('should parse the metadata update', async () => {
    sandbox.stub(Models.LogDaoMetadata, 'getMetadataAtBlockNumber')
    const metadataUpdate = getByType(ProposalActionType.MetadataUpdate)
    const action = await ActionTransformer.handleAction(
      metadataUpdate as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.MetadataUpdate)
  })

  it('should parse the update multi-sig settings', async () => {
    const updateMultiSigSettings = getByType(ProposalActionType.UpdateMultiSigSettings)
    const action = await ActionTransformer.handleAction(
      updateMultiSigSettings as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
        settings: {
          onlyListed: true,
          minApprovals: 1,
        },
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.UpdateMultiSigSettings)
  })

  it('should parse the update vote settings', async () => {
    const updateVoteSettings = getByType(ProposalActionType.UpdateVoteSettings)
    const action = await ActionTransformer.handleAction(
      updateVoteSettings as any,
      {
        daoAddress: '0xCD0C49D4de6cAf086350549753CfC4F4ACcB1031',
        settings: {
          votingMode: 1,
          supportThreshold: '500000',
          minParticipation: '17000',
          minDuration: '86400',
          minProposerVotingPower: 0,
        },
      } as any,
    )
    expect(action.type).to.be.eq(ProposalActionType.UpdateVoteSettings)
  })
})
