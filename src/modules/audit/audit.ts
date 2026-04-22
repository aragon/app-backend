import { spawn } from 'node:child_process'
import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import logger from '@logger'
import Connections from '@modules/connections'
import TenderlyModule from '@modules/tenderly'
import { EnumConnection, type NetworksEnum } from '@types'
import { ethers, Interface } from 'ethers'
import PromptBuilder from './promptBuilder'

const llo = logger.logMeta.bind(null, { service: 'audit' })

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_AUDIT_TIMEOUT_MS || 300000)

function parseArgs(): { network: NetworksEnum; pluginAddress: string; proposalIndex: string } {
  const [, , networkArg, pluginArg, indexArg] = process.argv
  if (!networkArg || !pluginArg || !indexArg) {
    throw new Error('Usage: yarn audit:proposal <network> <pluginAddress> <proposalIndex>')
  }
  if (!ethers.isAddress(pluginArg)) {
    throw new Error(`Invalid pluginAddress: ${pluginArg}`)
  }
  if (!/^\d+$/.test(indexArg)) {
    throw new Error(`proposalIndex must be a non-negative integer, got: ${indexArg}`)
  }
  return {
    network: networkArg as NetworksEnum,
    pluginAddress: ethers.getAddress(pluginArg),
    proposalIndex: indexArg,
  }
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

const COLOR = process.stdout.isTTY && process.env.NO_COLOR !== '1'
const ansi = (code: string, s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = (s: string) => ansi('1', s)
const dim = (s: string) => ansi('2', s)
const cyan = (s: string) => ansi('36', s)
const green = (s: string) => ansi('32', s)
const yellow = (s: string) => ansi('33', s)
const red = (s: string) => ansi('31', s)
const magenta = (s: string) => ansi('35', s)

const RISK_COLOR: Record<string, (s: string) => string> = {
  low: green,
  medium: yellow,
  high: red,
  critical: (s: string) => ansi('1;31', s),
}
const SEVERITY_COLOR: Record<string, (s: string) => string> = {
  info: dim,
  low: green,
  medium: yellow,
  high: red,
  critical: (s: string) => ansi('1;31', s),
}

interface IAuditResult {
  summary: string
  riskLevel: string
  findings: Array<{ severity: string; category: string; description: string; actionIndex?: number | null }>
  recommendations: string[]
}

interface IContext {
  network: string
  pluginAddress: string
  daoAddress: string
  proposalIndex: string
  tenderlyUrl?: string
  tenderlyStatus?: string
}

function formatPretty(envelope: any, audit: IAuditResult, ctx: IContext): string {
  const width = 70
  const hr = dim('─'.repeat(width))
  const hrStrong = cyan('═'.repeat(width))
  const riskColor = RISK_COLOR[audit.riskLevel] ?? dim
  const costUsd = envelope?.total_cost_usd != null ? `$${Number(envelope.total_cost_usd).toFixed(4)}` : 'n/a'
  const durationMs = envelope?.duration_ms
  const duration = durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : 'n/a'

  const lines: string[] = []
  lines.push('')
  lines.push(hrStrong)
  lines.push(bold(cyan('  ARAGON PROPOSAL SECURITY AUDIT')))
  lines.push(hrStrong)
  lines.push('')
  lines.push(`  ${dim('Network    ')} ${ctx.network}`)
  lines.push(`  ${dim('DAO        ')} ${ctx.daoAddress}`)
  lines.push(`  ${dim('Plugin     ')} ${ctx.pluginAddress}`)
  lines.push(`  ${dim('Proposal   ')} ${ctx.proposalIndex}`)
  if (ctx.tenderlyUrl) lines.push(`  ${dim('Tenderly   ')} ${ctx.tenderlyStatus ?? ''} ${cyan(ctx.tenderlyUrl)}`)
  lines.push(`  ${dim('Cost       ')} ${costUsd}   ${dim('Duration')} ${duration}`)
  lines.push('')
  lines.push(hr)
  lines.push(`  ${bold('RISK LEVEL')}   ${riskColor(bold(audit.riskLevel.toUpperCase()))}`)
  lines.push(hr)
  lines.push('')
  lines.push(bold('  SUMMARY'))
  lines.push(wrapText(audit.summary, width - 4, '  '))
  lines.push('')

  const findings = audit.findings ?? []
  lines.push(bold(`  FINDINGS (${findings.length})`))
  if (findings.length === 0) {
    lines.push(`  ${dim('none')}`)
  } else {
    findings.forEach((f, i) => {
      const sev = (f.severity || 'info').toLowerCase()
      const sevColor = SEVERITY_COLOR[sev] ?? dim
      const idx = f.actionIndex != null ? dim(`  (action #${f.actionIndex})`) : ''
      lines.push(`  ${sevColor(`[${sev.toUpperCase()}]`)} ${magenta(f.category)}${idx}`)
      lines.push(wrapText(f.description, width - 6, '     '))
      if (i < findings.length - 1) lines.push('')
    })
  }
  lines.push('')

  const recs = audit.recommendations ?? []
  lines.push(bold(`  RECOMMENDATIONS (${recs.length})`))
  if (recs.length === 0) {
    lines.push(`  ${dim('none')}`)
  } else {
    recs.forEach((r, i) => {
      lines.push(`  ${dim(`${i + 1}.`)} ${wrapText(r, width - 6, '     ').trimStart()}`)
    })
  }
  lines.push('')
  lines.push(hrStrong)
  lines.push('')
  return lines.join('\n')
}

function wrapText(text: string, width: number, indent: string): string {
  const words = (text || '').split(/\s+/)
  const out: string[] = []
  let line = indent
  for (const w of words) {
    if (line.length + w.length + 1 > width + indent.length) {
      out.push(line.trimEnd())
      line = indent + w + ' '
    } else {
      line += w + ' '
    }
  }
  if (line.trim()) out.push(line.trimEnd())
  return out.join('\n')
}

function renderOutput(claudeOutput: string, ctx: IContext): string {
  const mode = process.env.AUDIT_OUTPUT || 'pretty'
  if (mode === 'json' || mode === 'raw') return claudeOutput

  let envelope: any
  try {
    envelope = JSON.parse(claudeOutput)
  } catch {
    return `${red('Failed to parse Claude CLI output. Raw:')}\n${claudeOutput}`
  }

  const resultStr = envelope?.result
  if (typeof resultStr !== 'string') {
    return `${red('Claude CLI envelope missing .result field. Raw:')}\n${claudeOutput}`
  }

  let audit: IAuditResult
  try {
    audit = JSON.parse(resultStr)
  } catch {
    return `${red('Claude returned non-JSON. Raw result:')}\n${resultStr}`
  }

  return formatPretty(envelope, audit, ctx)
}

async function runClaude(prompt: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json', '--dangerously-skip-permissions'], {
      stdio: ['pipe', 'pipe', 'pipe'],
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
      settle(() => reject(new Error(`Claude CLI timed out after ${CLAUDE_TIMEOUT_MS}ms`)))
    }, CLAUDE_TIMEOUT_MS)

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

async function main() {
  const { network, pluginAddress, proposalIndex } = parseArgs()
  logger.info('Audit started', llo({ network, pluginAddress, proposalIndex }))

  await Connections.open([EnumConnection.MONGODB])

  const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network)
  if (!proposal) {
    throw new Error(`Proposal not found for ${network}/${pluginAddress}/${proposalIndex}`)
  }
  if (!proposal.rawActions?.length) {
    throw new Error(`Proposal has no rawActions`)
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

  const rendered = renderOutput(claudeOutput, {
    network,
    pluginAddress,
    daoAddress: proposal.daoAddress,
    proposalIndex,
    tenderlyUrl: tenderlyResult.shareUrl,
    tenderlyStatus: tenderlyResult.status,
  })
  process.stdout.write(rendered)
  if (!rendered.endsWith('\n')) process.stdout.write('\n')
}

main()
  .then(async () => {
    await Connections.close()
    process.exit(0)
  })
  .catch(async err => {
    logger.error('Audit failed', llo({ error: err?.message || String(err) }))
    try {
      await Connections.close()
    } catch {}
    process.exit(1)
  })
