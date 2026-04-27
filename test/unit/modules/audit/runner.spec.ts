import { EventEmitter } from 'node:events'
import config from '@config'
import { Models } from '@dbModels'
import PromptBuilder from '@modules/audit/promptBuilder'
import AuditRunner from '@modules/audit/runner'
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

interface IFakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: sinon.SinonSpy; end: sinon.SinonSpy }
  kill: sinon.SinonSpy
}

function makeChild(): IFakeChild {
  const child = new EventEmitter() as IFakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: sinon.spy(), end: sinon.spy() }
  child.kill = sinon.spy()
  return child
}

function loadRunnerWithSpawn(spawnStub: sinon.SinonStub) {
  const mod = proxyquire('@modules/audit/runner', {
    'node:child_process': { spawn: spawnStub },
  })
  return mod.default as typeof AuditRunner
}

describe('Module: audit/runner', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(fakeProposal as any)
    sandbox.stub(Models.Plugin, 'findByAddress').resolves(fakePlugin as any)
    sandbox.stub(Models.Setting, 'findActive').resolves(fakeSettings as any)
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(fakeTenderlyResult as any)
    sandbox.stub(PromptBuilder, 'load').resolves({ template: 'TPL', version: '2' })
    sandbox.stub(PromptBuilder, 'build').returns('THE PROMPT')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should orchestrate Tenderly + Claude and return a structured audit', async () => {
    const child = makeChild()
    const spawnStub = sinon.stub().returns(child)
    const Runner = loadRunnerWithSpawn(spawnStub)

    const claudeEnvelope = {
      total_cost_usd: 0.42,
      duration_ms: 12345,
      result: JSON.stringify({
        riskLevel: 'medium',
        summary: 'risky',
        findings: [{ severity: 'medium', category: 'fundDrain', description: 'd', actionIndex: 0 }],
        recommendations: ['verify recipient'],
      }),
    }

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })

    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify(claudeEnvelope)))
      child.emit('close', 0)
    })

    const { audit, envelope } = await runPromise

    expect(spawnStub.calledOnce).to.be.true
    expect(child.stdin.write.calledOnceWith('THE PROMPT')).to.be.true
    expect(audit.riskLevel).to.eq('medium')
    expect(audit.findings).to.have.lengthOf(1)
    expect(audit.recommendations).to.deep.eq(['verify recipient'])
    expect(audit.promptVersion).to.eq('2')
    expect(audit.tenderlyUrl).to.eq(fakeTenderlyResult.shareUrl)
    expect(audit.costUsd).to.eq(0.42)
    expect(audit.durationMs).to.eq(12345)
    expect(audit.createdAt).to.be.a('number')
    expect(envelope.total_cost_usd).to.eq(0.42)
  })

  it('should throw when proposal is not found', async () => {
    ;(Models.Proposal.findByProposalIndex as sinon.SinonStub).resolves(null)
    await expect(
      AuditRunner.run({
        network: fakeProposal.network,
        pluginAddress: fakeProposal.pluginAddress,
        proposalIndex: 'nope',
      }),
    ).to.be.rejectedWith('Proposal not found')
  })

  it('should throw when proposal has no rawActions', async () => {
    ;(Models.Proposal.findByProposalIndex as sinon.SinonStub).resolves({ ...fakeProposal, rawActions: [] } as any)
    await expect(
      AuditRunner.run({
        network: fakeProposal.network,
        pluginAddress: fakeProposal.pluginAddress,
        proposalIndex: fakeProposal.proposalIndex,
      }),
    ).to.be.rejectedWith('Proposal has no rawActions')
  })

  it('should throw when plugin is not found', async () => {
    ;(Models.Plugin.findByAddress as sinon.SinonStub).resolves(null)
    await expect(
      AuditRunner.run({
        network: fakeProposal.network,
        pluginAddress: fakeProposal.pluginAddress,
        proposalIndex: fakeProposal.proposalIndex,
      }),
    ).to.be.rejectedWith('Plugin not found')
  })

  it('should throw when Tenderly simulation is not configured / fails', async () => {
    ;(TenderlyModule.simulateFull as sinon.SinonStub).resolves(false)
    await expect(
      AuditRunner.run({
        network: fakeProposal.network,
        pluginAddress: fakeProposal.pluginAddress,
        proposalIndex: fakeProposal.proposalIndex,
      }),
    ).to.be.rejectedWith('Tenderly simulation failed or not configured')
  })

  it('should reject when Claude exits non-zero', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from('boom'))
      child.emit('close', 1)
    })

    await expect(runPromise).to.be.rejectedWith('Claude CLI exited with code 1')
  })

  it('should reject when Claude envelope is missing the .result field', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify({ total_cost_usd: 0.1 })))
      child.emit('close', 0)
    })

    await expect(runPromise).to.be.rejectedWith('Claude CLI envelope missing .result field')
  })

  it('should reject when child errors before close', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => child.emit('error', new Error('spawn failed')))

    await expect(runPromise).to.be.rejectedWith('spawn failed')
  })

  it('should reject when Claude .result is not a string', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify({ result: { not: 'a string' } })))
      child.emit('close', 0)
    })

    await expect(runPromise).to.be.rejectedWith('missing .result field')
  })

  it('should reject when Claude top-level envelope is not JSON', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('not json'))
      child.emit('close', 0)
    })

    await expect(runPromise).to.be.rejected
  })

  it('should tolerate null settings, undefined Tenderly contracts, missing action fields, and forward ANTHROPIC_API_KEY', async () => {
    sandbox.stub(config, 'AUDIT').value({ ...config.AUDIT, ANTHROPIC_API_KEY: 'sk-test', TIMEOUT_MS: 300000 })
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

    const child = makeChild()
    const spawnStub = sinon.stub().returns(child)
    const Runner = loadRunnerWithSpawn(spawnStub)

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify({ result: JSON.stringify({ riskLevel: 'low', summary: 's' }) })))
      child.emit('close', 0)
    })

    const { audit } = await runPromise
    expect(audit.tenderlyUrl).to.be.null
    expect(audit.costUsd).to.be.null
    expect(audit.durationMs).to.be.null
    expect(spawnStub.args[0][2].env.ANTHROPIC_API_KEY).to.eq('sk-test')
  })

  it('should kill the child and reject when Claude takes longer than TIMEOUT_MS', async () => {
    sandbox.stub(config, 'AUDIT').value({ ...config.AUDIT, TIMEOUT_MS: 25 })
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })

    await expect(runPromise).to.be.rejectedWith('timed out')
    expect(child.kill.calledOnceWith('SIGKILL')).to.be.true
  })

  it('should default findings/recommendations to empty arrays when omitted', async () => {
    const child = makeChild()
    const Runner = loadRunnerWithSpawn(sinon.stub().returns(child))

    const runPromise = Runner.run({
      network: fakeProposal.network,
      pluginAddress: fakeProposal.pluginAddress,
      proposalIndex: fakeProposal.proposalIndex,
    })
    setImmediate(() => {
      child.stdout.emit(
        'data',
        Buffer.from(JSON.stringify({ result: JSON.stringify({ riskLevel: 'low', summary: 's' }) })),
      )
      child.emit('close', 0)
    })

    const { audit } = await runPromise
    expect(audit.findings).to.deep.eq([])
    expect(audit.recommendations).to.deep.eq([])
    expect(audit.tenderlyUrl).to.eq(fakeTenderlyResult.shareUrl)
    expect(audit.costUsd).to.be.null
    expect(audit.durationMs).to.be.null
  })
})
