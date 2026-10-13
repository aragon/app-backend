import ContractHelper from '@helpers/contractHelper'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import RecipientResolver, { RECENT_DEPLOYMENT_WINDOW_SECONDS } from '@modules/proposalChecks/recipients'
import ProviderModule from '@modules/provider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { DECATS, FARTDAO } from '@test/mock/proposalChecks/incidents'
import { IAssessmentFindingKind, type IResolvedAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NOW = 1_784_000_000
const BLOCK = 90094457
const CONTRACT = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const network = NetworksEnum.polygonMainnet
const at = (creator: string | null) => ({ creator: creator as any, evidenceBlock: BLOCK, evidenceTime: NOW })
const creation = (blockNumber: number, transactionHash: string | null) => ({
  blockNumber,
  transactionHash,
  address: CONTRACT as any,
})

describe('proposalChecks/recipients', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('collects the addresses the actions hand value to, skipping delegatecalls', () => {
    const actions = AssessmentContextBuilder._flatten([...FARTDAO.rawActions, ...DECATS.rawActions], FARTDAO.daoAddress)
    expect(RecipientResolver.beneficiaries(actions)).to.deep.eq([FARTDAO.creatorAddress])

    const delegated = actions.map(a => ({ ...a, operation: 'delegatecall' as const }))
    expect(RecipientResolver.beneficiaries(delegated)).to.deep.eq([])
  })

  it('resolves a wallet as an EOA from its empty code at the evidence block, with nothing else to say', async () => {
    const getCode = sandbox.stub().resolves('0x')
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode })
    const source = sandbox.stub(ContractHelper, 'getSourceCode')

    const resolved = await RecipientResolver.resolve([DECATS.creatorAddress], network, at(null))

    expect(getCode.calledOnceWith(DECATS.creatorAddress, BLOCK)).to.be.true
    expect(resolved[DECATS.creatorAddress]).to.include({ kind: 'eoa', verified: null, deployer: null })
    expect(source.called).to.be.false
  })

  it('resolves a contract deployed by the creator two days earlier as recently creator-deployed', async () => {
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(null)
    // The explorer answers with the block as a decimal string, whatever the declared type says.
    sandbox
      .stub(ProxyWeb3Provider, 'fetchContractCreation')
      .resolves({ ...creation(500, '0xdeploy'), blockNumber: '500' } as any)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(NOW - 2 * 24 * 3600)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0x6080'),
      getTransaction: sandbox.stub().resolves({ from: DECATS.creatorAddress }),
    })

    const resolved = await RecipientResolver.resolve([CONTRACT], network, at(DECATS.creatorAddress))

    expect(resolved[CONTRACT]).to.deep.eq({
      address: CONTRACT,
      kind: 'contract',
      verified: false,
      contractName: null,
      deployedAtBlock: 500,
      deployedAt: NOW - 2 * 24 * 3600,
      deployer: DECATS.creatorAddress,
      deployedByCreator: true,
      recentlyDeployed: true,
    })
  })

  it('treats a verified contract deployed long ago by someone else as neither flag', async () => {
    sandbox
      .stub(ContractHelper, 'getSourceCode')
      .resolves([{ SourceCode: '', ABI: '[]', ContractName: 'Vault', CompilerVersion: '' }])
    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(creation(1, '0xdeploy'))
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(NOW - RECENT_DEPLOYMENT_WINDOW_SECONDS - 1)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0x6080'),
      getTransaction: sandbox.stub().resolves({ from: OTHER }),
    })

    const resolved = await RecipientResolver.resolve([CONTRACT], network, at(DECATS.creatorAddress))

    expect(resolved[CONTRACT]).to.include({
      kind: 'contract',
      verified: true,
      contractName: 'Vault',
      deployedByCreator: false,
      recentlyDeployed: false,
    })
  })

  it('does not call a deployment after the evidence time recent, even if the explorer reports one', async () => {
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(null)
    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(creation(999, '0xdeploy'))
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(NOW + 3600)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0x6080'),
      getTransaction: sandbox.stub().resolves({ from: DECATS.creatorAddress }),
    })

    const resolved = await RecipientResolver.resolve([CONTRACT], network, at(DECATS.creatorAddress))

    expect(resolved[CONTRACT]).to.include({ deployedByCreator: true, recentlyDeployed: false })
  })

  it('leaves what it could not establish as null, and the kind unknown when even the code read fails', async () => {
    const getCode = sandbox.stub()
    getCode.onFirstCall().rejects(new Error('archive missing')).onSecondCall().resolves('0x6080')
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode })
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(null)
    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves(creation(0, null))
    sandbox.stub(logger, 'warn')

    const resolved = await RecipientResolver.resolve([DECATS.creatorAddress, CONTRACT], network, at(null))

    expect(resolved[DECATS.creatorAddress].kind).to.eq('unknown')
    expect(resolved[CONTRACT]).to.include({
      kind: 'contract',
      verified: false,
      deployer: null,
      deployedByCreator: null,
      recentlyDeployed: null,
    })
  })

  it('keeps going when a lookup throws, without inventing anything', async () => {
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').throws(new Error('rpc down'))
    sandbox.stub(logger, 'warn')

    const resolved = await RecipientResolver.resolve([CONTRACT], network, at(null))

    expect(resolved[CONTRACT].kind).to.eq('unknown')
  })
})

describe('proposalChecks/checks/assets/transfers recipient tag', () => {
  const ctxWith = (recipient: Partial<IResolvedAddress>) => {
    const base = fakeAssessmentContext()
    const actions = AssessmentContextBuilder._flatten(DECATS.rawActions, DECATS.daoAddress)
    const key = DECATS.creatorAddress
    return {
      ...base,
      request: { ...base.request, daoAddress: DECATS.daoAddress },
      actions,
      recipients: {
        [key]: {
          address: key,
          kind: 'contract' as const,
          verified: true,
          contractName: 'X',
          deployedAtBlock: 1,
          deployedAt: 1,
          deployer: OTHER,
          deployedByCreator: false,
          recentlyDeployed: false,
          ...recipient,
        },
      },
    }
  }

  it('tags a transfer to an unverified contract, or to a fresh creator-deployed one, as needing review', () => {
    const unverified = TransfersCheck.run(ctxWith({ verified: false })).findings[0]
    expect(unverified.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(unverified.details).to.include('recipient is a contract with no verified source')

    const fresh = TransfersCheck.run(ctxWith({ deployedByCreator: true, recentlyDeployed: true })).findings[0]
    expect(fresh.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(fresh.details).to.include('recipient was deployed by the proposal creator within the last 7 days')
  })

  it('keeps an ordinary recipient as a plain change and carries the resolved recipient on the finding', () => {
    const finding = TransfersCheck.run(ctxWith({})).findings[0]
    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect((finding.after as any).recipient.contractName).to.eq('X')
    expect(finding.evidenceLimit ?? '').to.not.contain('recipient')
  })

  it('says the recipient is unresolved when nothing could be read about it', () => {
    const finding = TransfersCheck.run(ctxWith({ kind: 'unknown', verified: null })).findings[0]
    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.evidenceLimit).to.contain('recipient not resolved')
  })
})
