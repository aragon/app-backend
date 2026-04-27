import { spawn } from 'node:child_process'
import { DAO } from '@artifacts/dao'
import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import type { HexAddress, IProposalAudit, IProposalAuditFinding, NetworksEnum } from '@types'
import { ethers, Interface } from 'ethers'
import PromptBuilder from './promptBuilder'

const llo = logger.logMeta.bind(null, { service: 'audit-runner' })

export interface IRunAuditParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  proposalIndex: string
}

export interface IRunAuditResult {
  audit: IProposalAudit
  envelope: any
}

function trimTenderly(result: Record<string, any>): Record<string, any> {
  return {
    status: result.status,
    shareUrl: result.shareUrl,
    error: result.error,
    assetChanges: result.assetChanges,
    balanceChanges: result.balanceChanges,
    callTrace: result.callTrace,
    contracts: (result.contracts || []).map((c: any) => ({
      address: c.address,
      contract_name: c.contract_name,
      standard: c.standard,
      standards: c.standards,
      is_proxy: c.is_proxy,
      implementation_address: c.implementation_address,
    })),
  }
}

function trimDoc(doc: any): Record<string, any> {
  const obj = doc?.toObject ? doc.toObject() : doc
  if (!obj || typeof obj !== 'object') return obj
  const { _id, __v, ...rest } = obj
  return rest
}

function encodeDaoExecute(rawActions: Array<{ to: string; data?: string; value?: string }>): string {
  const actions = rawActions.map(a => ({
    to: a.to,
    value: a.value || '0',
    data: a.data || '0x',
  }))
  const iface = new Interface(DAO.abi)
  return iface.encodeFunctionData('execute', [ethers.id(Date.now().toString()), actions, 0])
}

async function runClaude(prompt: string): Promise<string> {
  const { CLAUDE_BIN, TIMEOUT_MS, ANTHROPIC_API_KEY } = config.AUDIT
  const env = ANTHROPIC_API_KEY ? { ...process.env, ANTHROPIC_API_KEY } : process.env

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json', '--dangerously-skip-permissions'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle(() => reject(new Error(`Claude CLI timed out after ${TIMEOUT_MS}ms`)))
    }, TIMEOUT_MS)

    child.stdout.on('data', c => stdoutChunks.push(c))
    child.stderr.on('data', c => stderrChunks.push(c))
    child.on('error', err => settle(() => reject(err)))
    child.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (code !== 0) {
        settle(() =>
          reject(
            new Error(
              `Claude CLI exited with code ${code}. stdout: ${stdout || '<empty>'} stderr: ${stderr || '<empty>'}`,
            ),
          ),
        )
        return
      }
      settle(() => resolve(stdout))
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

const AuditRunner = {
  /**
   * Runs the proposal audit pipeline (Mongo lookup → Tenderly → prompt build → Claude).
   * Caller is responsible for opening Mongo + RabbitMQ connections.
   */
  async run(params: IRunAuditParams): Promise<IRunAuditResult> {
    const { network, pluginAddress, proposalIndex } = params
    logger.info('Audit started', llo({ network, pluginAddress, proposalIndex }))

    const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network)
    if (!proposal) {
      throw new Error(`Proposal not found for ${network}/${pluginAddress}/${proposalIndex}`)
    }
    if (!proposal.rawActions?.length) {
      throw new Error('Proposal has no rawActions')
    }

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    if (!plugin) {
      throw new Error(`Plugin not found for ${network}/${pluginAddress}`)
    }

    const settings = await Models.Setting.findActive({ pluginAddress, network })

    const encodedData = encodeDaoExecute(proposal.rawActions)
    const tenderlyResult = await TenderlyModule.simulateFull(
      {
        to: proposal.daoAddress,
        data: encodedData,
        value: '0',
        from: pluginAddress,
      },
      network,
    )
    if (tenderlyResult === false) {
      throw new Error('Tenderly simulation failed or not configured')
    }

    const { template, version } = await PromptBuilder.load()
    const prompt = PromptBuilder.build(
      {
        network,
        daoAddress: proposal.daoAddress,
        plugin: trimDoc(plugin),
        settings: settings ? trimDoc(settings) : null,
        proposal: trimDoc(proposal),
        rawActions: proposal.rawActions,
        decodedActions: proposal.actions,
        tenderly: trimTenderly(tenderlyResult),
      },
      template,
    )

    logger.info('Invoking Claude CLI', llo({ promptVersion: version, promptLength: prompt.length }))
    const claudeOutput = await runClaude(prompt)

    const envelope = JSON.parse(claudeOutput)
    const resultStr = envelope?.result
    if (typeof resultStr !== 'string') {
      throw new Error('Claude CLI envelope missing .result field')
    }
    const parsed = JSON.parse(resultStr) as {
      summary: string
      riskLevel: string
      findings: IProposalAuditFinding[]
      recommendations: string[]
    }

    const audit: IProposalAudit = {
      riskLevel: parsed.riskLevel,
      summary: parsed.summary,
      findings: parsed.findings ?? [],
      recommendations: parsed.recommendations ?? [],
      promptVersion: version,
      simulationId: null,
      tenderlyUrl: tenderlyResult.shareUrl ?? null,
      costUsd: envelope?.total_cost_usd != null ? Number(envelope.total_cost_usd) : null,
      durationMs: envelope?.duration_ms ?? null,
      createdAt: Date.now(),
    }

    return { audit, envelope }
  },
}

export default AuditRunner
