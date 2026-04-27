import config from '@config'
import { Models } from '@dbModels'
import PromptBuilder from '@modules/audit/promptBuilder'
import AuditRunnerReal from '@modules/audit/runner'
import TenderlyModule from '@modules/tenderly'
import { ISimulationStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const fakeProposal = {
  id: 'audit-proposal',
  network: NetworksEnum.ethereumMainnet,
  pluginAddress: '0x1111111111111111111111111111111111111111',
  proposalIndex: '7',
  daoAddress: '0x2222222222222222222222222222222222222222',
  rawActions: [{ to: '0x3333333333333333333333333333333333333333', data: '0xdeadbeef', value: '0' }],
  actions: [],
  toObject() {
    return { ...this }
  },
}

const fakePlugin = {
  address: fakeProposal.pluginAddress,
  network: fakeProposal.network,
  toObject() {
    return { ...this }
  },
}

const fakeSettings = {
  id: 'settings',
  toObject() {
    return { ...this }
  },
}

const fakeTenderlyResult = {
  status: ISimulationStatus.SUCCESS,
  shareUrl: 'https://www.tdly.co/shared/simulation/abc',
  assetChanges: [],
  balanceChanges: [],
  callTrace: {},
  contracts: [{ address: '0x4444444444444444444444444444444444444444', contract_name: 'X', is_proxy: false }],
}

function buildClaudeResponse(resultJson: string, usage: Record<string, number> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content: [{ type: 'text', text: resultJson }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...usage,
    },
  }
}

function defaultParams() {
  return {
    network: fakeProposal.network,
    pluginAddress: fakeProposal.pluginAddress,
    proposalIndex: fakeProposal.proposalIndex,
  }
}

function loadRunnerWithFakeSDK(
  messagesCreateStub: sinon.SinonStub,
  anthropicCtorSpy?: sinon.SinonSpy,
): typeof AuditRunnerReal {
  class FakeAnthropic {
    messages = { create: messagesCreateStub }
    constructor(opts: any) {
      anthropicCtorSpy?.(opts)
    }
  }
  const mod = proxyquire('@modules/audit/runner', {
    '@anthropic-ai/sdk': { default: FakeAnthropic },
  })
  return mod.default as typeof AuditRunnerReal
}

describe('Module: audit/runner', () => {
  let sandbox: SinonSandbox
  let messagesCreateStub: sinon.SinonStub
  let AuditRunner: typeof AuditRunnerReal

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(config, 'AUDIT').value({
      ...config.AUDIT,
      ANTHROPIC_API_KEY: 'sk-test',
      MODEL: 'claude-sonnet-4-5',
      MAX_TOKENS: 4096,
      TIMEOUT_MS: 300000,
    })
    sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(fakeProposal as any)
    sandbox.stub(Models.Plugin, 'findByAddress').resolves(fakePlugin as any)
    sandbox.stub(Models.Setting, 'findActive').resolves(fakeSettings as any)
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(fakeTenderlyResult as any)
    sandbox.stub(PromptBuilder, 'load').resolves({ system: 'SYSTEM RULES', template: 'TPL {{NETWORK}}', version: '2' })
    sandbox.stub(PromptBuilder, 'build').returns('USER PROMPT')
    messagesCreateStub = sinon.stub().resolves(
      buildClaudeResponse(
        JSON.stringify({
          riskLevel: 'medium',
          summary: 'risky',
          findings: [{ severity: 'medium', category: 'fundDrain', description: 'd', actionIndex: 0 }],
          recommendations: ['verify recipient'],
        }),
      ),
    )
    AuditRunner = loadRunnerWithFakeSDK(messagesCreateStub)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should orchestrate Tenderly + SDK and return a structured audit', async () => {
    const { audit } = await AuditRunner.run(defaultParams())

    expect(messagesCreateStub.calledOnce).to.be.true
    const call = messagesCreateStub.args[0][0]
    expect(call.model).to.eq('claude-sonnet-4-5')
    expect(call.system[0].text).to.eq('SYSTEM RULES')
    expect(call.system[0].cache_control).to.deep.eq({ type: 'ephemeral' })
    expect(call.messages[0]).to.deep.eq({ role: 'user', content: 'USER PROMPT' })

    expect(audit.riskLevel).to.eq('medium')
    expect(audit.findings).to.have.lengthOf(1)
    expect(audit.recommendations).to.deep.eq(['verify recipient'])
    expect(audit.promptVersion).to.eq('2')
    expect(audit.tenderlyUrl).to.eq(fakeTenderlyResult.shareUrl)
    expect(audit.costUsd).to.be.greaterThan(0)
    expect(audit.durationMs).to.be.a('number')
    expect(audit.createdAt).to.be.a('number')
  })

  it('should include cache hits in the cost estimate when the SDK reports cache reads', async () => {
    messagesCreateStub.resolves(
      buildClaudeResponse(JSON.stringify({ riskLevel: 'low', summary: 's' }), {
        input_tokens: 100,
        cache_read_input_tokens: 9000,
        output_tokens: 200,
      }),
    )

    const { audit } = await AuditRunner.run(defaultParams())
    // base input + cache reads (cheaper) + output
    // (100*3 + 9000*3*0.1 + 200*15) / 1e6 ≈ 0.0057
    expect(audit.costUsd).to.be.lessThan(0.01)
    expect(audit.costUsd).to.be.greaterThan(0.005)
  })

  it('should throw when ANTHROPIC_API_KEY is not configured', async () => {
    sandbox.stub(config, 'AUDIT').value({
      ...config.AUDIT,
      ANTHROPIC_API_KEY: null,
    })

    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('AUDIT_ANTHROPIC_API_KEY is not configured')
    expect(messagesCreateStub.called).to.be.false
  })

  it('should throw when proposal is not found', async () => {
    ;(Models.Proposal.findByProposalIndex as sinon.SinonStub).resolves(null)
    await expect(AuditRunner.run({ ...defaultParams(), proposalIndex: 'nope' })).to.be.rejectedWith(
      'Proposal not found',
    )
  })

  it('should throw when proposal has no rawActions', async () => {
    ;(Models.Proposal.findByProposalIndex as sinon.SinonStub).resolves({ ...fakeProposal, rawActions: [] } as any)
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('Proposal has no rawActions')
  })

  it('should throw when plugin is not found', async () => {
    ;(Models.Plugin.findByAddress as sinon.SinonStub).resolves(null)
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('Plugin not found')
  })

  it('should throw when Tenderly simulation is not configured / fails', async () => {
    ;(TenderlyModule.simulateFull as sinon.SinonStub).resolves(false)
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('Tenderly simulation failed or not configured')
  })

  it('should throw when SDK returns no text content block', async () => {
    messagesCreateStub.resolves({
      ...buildClaudeResponse('{}'),
      content: [{ type: 'tool_use', id: 'x' }],
    })
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('no text content block')
  })

  it('should throw when SDK text content is not valid JSON', async () => {
    messagesCreateStub.resolves(buildClaudeResponse('not json'))
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('non-JSON output')
  })

  it('should default findings/recommendations to empty arrays when omitted', async () => {
    messagesCreateStub.resolves(buildClaudeResponse(JSON.stringify({ riskLevel: 'low', summary: 's' })))

    const { audit } = await AuditRunner.run(defaultParams())
    expect(audit.findings).to.deep.eq([])
    expect(audit.recommendations).to.deep.eq([])
  })

  it('should tolerate null settings, undefined Tenderly contracts, and missing rawAction fields', async () => {
    ;(Models.Setting.findActive as sinon.SinonStub).resolves(null)
    ;(TenderlyModule.simulateFull as sinon.SinonStub).resolves({
      status: ISimulationStatus.SUCCESS,
      shareUrl: undefined,
      assetChanges: [],
      balanceChanges: [],
      callTrace: undefined,
      contracts: undefined,
    } as any)
    ;(Models.Proposal.findByProposalIndex as sinon.SinonStub).resolves({
      ...fakeProposal,
      rawActions: [{ to: '0x5555555555555555555555555555555555555555' }],
    } as any)

    const { audit } = await AuditRunner.run(defaultParams())
    expect(audit.tenderlyUrl).to.be.null
    expect(audit.summary).to.eq('risky')
  })

  it('should propagate SDK errors as runner errors', async () => {
    messagesCreateStub.rejects(new Error('rate_limit'))
    await expect(AuditRunner.run(defaultParams())).to.be.rejectedWith('rate_limit')
  })
})
