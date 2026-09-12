import { Models } from '@dbModels'
import AllowancesCheck from '@modules/proposalChecks/checks/assets/allowances'
import NftsCheck from '@modules/proposalChecks/checks/assets/nfts'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import RecipientResolver from '@modules/proposalChecks/recipients'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { IAssessmentFindingKind, type IResolvedAddress, type ITokenStandard, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface, MaxUint256 } from 'ethers'
import * as sinon from 'sinon'

const TOKEN = '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18'
const NFT = '0x4444444444444444444444444444444444444444'
const SPENDER = '0x5555555555555555555555555555555555555555'
const DAO = DECATS.daoAddress
const erc20 = new Interface([
  'function approve(address,uint256)',
  'function increaseAllowance(address,uint256)',
  'function decreaseAllowance(address,uint256)',
  'function transferFrom(address,address,uint256)',
])
const nft = new Interface([
  'function safeTransferFrom(address,address,uint256)',
  'function safeTransferFrom(address,address,uint256,uint256,bytes)',
  'function safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
  'function setApprovalForAll(address,bool)',
  'function approve(address,uint256)',
])

const resolved = (overrides: Partial<IResolvedAddress> = {}): IResolvedAddress => ({
  address: SPENDER,
  kind: 'eoa',
  verified: null,
  contractName: null,
  deployedAtBlock: null,
  deployedAt: null,
  deployer: null,
  deployedByCreator: null,
  recentlyDeployed: null,
  ...overrides,
})
const ctxWith = (
  rawActions: any[],
  tokens: Record<string, ITokenStandard | null> = {},
  recipient: IResolvedAddress = resolved(),
) => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    tokens,
    recipients: { [recipient.address]: recipient },
  }
}

describe('proposalChecks/checks/assets/allowances', () => {
  it('reports a new allowance as a change to tell subscribers about, unlimited when it is', () => {
    const ctx = ctxWith([{ to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, MaxUint256]) }], {
      [TOKEN]: 'ERC20',
    })

    const [finding] = AllowancesCheck.run(ctx).findings

    expect(finding.id).to.eq('assets/allowances:set:0')
    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.notify).to.eq(true)
    expect(finding.title).to.contain('unlimited amount')
    expect(finding.details).to.include('the allowance is unlimited')
    expect(finding.after).to.include({
      token: TOKEN,
      owner: DAO,
      spender: SPENDER,
      change: 'set',
      unlimited: true,
      confirmed: null,
    })
  })

  it('reports a removed or lowered allowance without a notification, and a raised one with', () => {
    const ctx = ctxWith([
      { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 0]) },
      { to: TOKEN, value: '0', data: erc20.encodeFunctionData('decreaseAllowance', [SPENDER, 5]) },
      { to: TOKEN, value: '0', data: erc20.encodeFunctionData('increaseAllowance', [SPENDER, 5]) },
    ])

    const findings = AllowancesCheck.run(ctx).findings

    expect(findings.map(f => [f.id, f.notify])).to.deep.eq([
      ['assets/allowances:removed:0', false],
      ['assets/allowances:lowered:1', false],
      ['assets/allowances:raised:2', true],
    ])
    expect(findings[0].evidenceLimit).to.contain('allowance before the action not read')
    expect(findings[2].details).to.include('allowance before the action: 0, after: 5')
  })

  it('folds allowances in order, so a second approve is read against what the first one left', () => {
    const ctx = {
      ...ctxWith([
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 0]) },
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 50]) },
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('increaseAllowance', [SPENDER, 5]) },
      ]),
      allowances: { '0': '100', '1': '100', '2': '100' },
    }

    const findings = AllowancesCheck.run(ctx).findings

    expect(findings.map(f => [f.id, f.notify])).to.deep.eq([
      ['assets/allowances:removed:0', false],
      ['assets/allowances:raised:1', true],
      ['assets/allowances:raised:2', true],
    ])
    expect(findings[1].details).to.include('allowance before the action: 0, after: 50')
    expect(findings[2].details).to.include('allowance before the action: 50, after: 55')
  })

  it('reads an approve against the allowance in place: lower is dashboard-only, higher is sent, equal changes nothing', () => {
    const ctx = {
      ...ctxWith([
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 10]) },
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 200]) },
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 100]) },
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('increaseAllowance', [SPENDER, 5]) },
      ]),
      allowances: { '0': '100', '1': '100', '2': '100', '3': '100' },
    }

    const findings = AllowancesCheck.run(ctx).findings

    expect(findings.map(f => [f.id, f.notify])).to.deep.eq([
      ['assets/allowances:lowered:0', false],
      ['assets/allowances:raised:1', true],
      ['assets/allowances:lowered:2', false],
      ['assets/allowances:raised:3', true],
    ])
    expect(findings[0].title).to.contain('Lowers the allowance')
    expect(findings[0].details).to.include('allowance before the action: 100, after: 10')
    expect(findings[1].details).to.include('allowance before the action: 10, after: 200')
    expect(findings[3].title).to.contain('to 105')
    expect(findings[0].evidenceLimit ?? '').to.not.contain('allowance before the action not read')
  })

  it('tags an unverified or freshly creator-deployed spender for review, and notifies even for a removal then', () => {
    const ctx = ctxWith(
      [{ to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 0]) }],
      {},
      resolved({ kind: 'contract', verified: false }),
    )

    const [finding] = AllowancesCheck.run(ctx).findings

    expect(finding.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(finding.notify).to.eq(true)
    expect(finding.details).to.include('spender is a contract with no verified source')
  })

  it('confirms a set allowance against the simulated approvals', () => {
    const base = ctxWith([{ to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 7]) }])
    const ctx = {
      ...base,
      availability: { ...base.availability, simulation: 'ok' as const },
      simulation: {
        ...base.simulation,
        status: 'ok' as const,
        reason: null,
        approvals: [{ token: TOKEN, owner: DAO, spender: SPENDER, amount: '7', unlimited: false }],
      },
    }

    expect((AllowancesCheck.run(ctx).findings[0].after as any).confirmed).to.eq(true)
    const other = { ...ctx, simulation: { ...ctx.simulation, approvals: [] } }
    expect((AllowancesCheck.run(other).findings[0].after as any).confirmed).to.eq(false)
  })

  it('reports an ERC721 approval to the zero address as a revocation, not sent', () => {
    const ctx = ctxWith(
      [
        {
          to: NFT,
          value: '0',
          data: erc20.encodeFunctionData('approve', ['0x0000000000000000000000000000000000000000', 42]),
        },
      ],
      { [NFT]: 'ERC721' },
    )

    const [finding] = NftsCheck.run(ctx).findings

    expect(finding.id).to.eq('assets/nfts:approvalRevoked:0')
    expect(finding.notify).to.be.false
    expect(finding.title).to.contain('Removes the approval on token 42')
  })

  it('leaves an approve on a known ERC721 collection to the NFT rule', () => {
    const ctx = ctxWith([{ to: NFT, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 42]) }], {
      [NFT]: 'ERC721',
    })

    expect(AllowancesCheck.run(ctx).findings).to.deep.eq([])
    expect(NftsCheck.run(ctx).findings.map(f => f.id)).to.deep.eq(['assets/nfts:approval:0'])
  })
})

describe('proposalChecks/checks/assets/nfts', () => {
  it('reports an ERC721 safe transfer, an ERC1155 batch, and an ERC721 transferFrom once the collection is known', () => {
    const ctx = ctxWith(
      [
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('safeTransferFrom(address,address,uint256)', [DAO, SPENDER, 9]),
        },
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('safeBatchTransferFrom', [DAO, SPENDER, [1, 2], [3, 4], '0x']),
        },
        { to: NFT, value: '0', data: erc20.encodeFunctionData('transferFrom', [DAO, SPENDER, 11]) },
      ],
      { [NFT]: 'ERC721' },
    )

    const findings = NftsCheck.run(ctx).findings

    expect(findings.map(f => f.id)).to.deep.eq([
      'assets/nfts:transfer:0',
      'assets/nfts:transfer:1',
      'assets/nfts:transfer:2',
    ])
    expect((findings[0].after as any).ids).to.deep.eq(['9'])
    expect((findings[2].after as any).ids).to.deep.eq(['11'])
    expect(findings[1].after as any).to.include({ to: SPENDER })
    expect((findings[1].after as any).ids).to.deep.eq(['1', '2'])
    expect((findings[1].after as any).amounts).to.deep.eq(['3', '4'])
    expect(findings.every(f => f.notify)).to.eq(true)
    expect(TransfersCheck.run(ctx).findings).to.deep.eq([])
  })

  it('reports a collection-wide operator as notifiable and its revocation as dashboard-only', () => {
    const ctx = ctxWith([
      { to: NFT, value: '0', data: nft.encodeFunctionData('setApprovalForAll', [SPENDER, true]) },
      { to: NFT, value: '0', data: nft.encodeFunctionData('setApprovalForAll', [SPENDER, false]) },
    ])

    const findings = NftsCheck.run(ctx).findings

    expect(findings.map(f => [f.id, f.notify])).to.deep.eq([
      ['assets/nfts:operator:0', true],
      ['assets/nfts:operatorRevoked:1', false],
    ])
    expect(findings[0].title).to.contain('every token of collection')
    expect(findings[0].evidenceLimit).to.contain('collection standard not known')
  })

  it('tags a transfer to an unverified contract and leaves a transferFrom on an unknown token to the transfer rule', () => {
    const tagged = ctxWith(
      [
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('safeTransferFrom(address,address,uint256)', [DAO, SPENDER, 9]),
        },
      ],
      {},
      resolved({ kind: 'contract', verified: false }),
    )
    expect(NftsCheck.run(tagged).findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)

    const unknown = ctxWith(
      [{ to: NFT, value: '0', data: erc20.encodeFunctionData('transferFrom', [DAO, SPENDER, 11]) }],
      { [NFT]: null },
    )
    expect(NftsCheck.run(unknown).findings).to.deep.eq([])
    expect(TransfersCheck.run(unknown).findings.map(f => f.id)).to.deep.eq(['assets/transfers:erc20:0'])
  })
})

describe('proposalChecks/context token standards and beneficiaries', () => {
  it('collects spenders, operators and NFT recipients as beneficiaries', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 1]) },
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('setApprovalForAll', ['0x6666666666666666666666666666666666666666', true]),
        },
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('setApprovalForAll', ['0x7777777777777777777777777777777777777777', false]),
        },
        {
          to: NFT,
          value: '0',
          data: nft.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
            DAO,
            '0x8888888888888888888888888888888888888888',
            1,
          ]),
        },
      ],
      DAO,
    )

    expect(RecipientResolver.beneficiaries(actions)).to.deep.eq([
      SPENDER,
      '0x6666666666666666666666666666666666666666',
      '0x8888888888888888888888888888888888888888',
    ])
  })

  it('takes a token standard from the simulation first, then the indexed token, else leaves it unknown', async () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        { to: TOKEN, value: '0', data: erc20.encodeFunctionData('approve', [SPENDER, 1]) },
        { to: NFT, value: '0', data: nft.encodeFunctionData('setApprovalForAll', [SPENDER, true]) },
        {
          to: '0x9999999999999999999999999999999999999999',
          value: '0',
          data: erc20.encodeFunctionData('approve', [SPENDER, 1]),
        },
      ],
      DAO,
    )
    const findOne = sinon.stub(Models.Token, 'findOne')
    findOne.withArgs(sinon.match({ address: NFT }), sinon.match.any).resolves({ type: 'ERC721' })
    findOne.resolves(null)
    try {
      const tokens = await AssessmentContextBuilder._tokenStandards(
        actions,
        [{ type: 'Transfer', asset: TOKEN, standard: 'ERC20', from: DAO, to: SPENDER, amount: '1' }],
        NetworksEnum.polygonMainnet,
      )
      expect(tokens).to.deep.eq({
        [TOKEN]: 'ERC20',
        [NFT]: 'ERC721',
        '0x9999999999999999999999999999999999999999': null,
      })
    } finally {
      findOne.restore()
    }
  })
})
