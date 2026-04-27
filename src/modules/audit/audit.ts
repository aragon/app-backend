import logger from '@logger'
import Connections from '@modules/connections'
import { EnumConnection, type IProposalAudit, type NetworksEnum } from '@types'
import { ethers } from 'ethers'
import AuditRunner from './runner'

const llo = logger.logMeta.bind(null, { service: 'audit' })

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

interface ICliContext {
  network: string
  pluginAddress: string
  proposalIndex: string
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

function formatPretty(audit: IProposalAudit, ctx: ICliContext): string {
  const width = 70
  const hr = dim('─'.repeat(width))
  const hrStrong = cyan('═'.repeat(width))
  const riskColor = RISK_COLOR[audit.riskLevel] ?? dim
  const costUsd = audit.costUsd != null ? `$${audit.costUsd.toFixed(4)}` : 'n/a'
  const duration = audit.durationMs != null ? `${(audit.durationMs / 1000).toFixed(1)}s` : 'n/a'

  const lines: string[] = []
  lines.push('')
  lines.push(hrStrong)
  lines.push(bold(cyan('  ARAGON PROPOSAL SECURITY AUDIT')))
  lines.push(hrStrong)
  lines.push('')
  lines.push(`  ${dim('Network    ')} ${ctx.network}`)
  lines.push(`  ${dim('Plugin     ')} ${ctx.pluginAddress}`)
  lines.push(`  ${dim('Proposal   ')} ${ctx.proposalIndex}`)
  if (audit.tenderlyUrl) lines.push(`  ${dim('Tenderly   ')} ${cyan(audit.tenderlyUrl)}`)
  lines.push(`  ${dim('Cost       ')} ${costUsd}   ${dim('Duration')} ${duration}`)
  lines.push('')
  lines.push(hr)
  lines.push(`  ${bold('RISK LEVEL')}   ${riskColor(bold(audit.riskLevel.toUpperCase()))}`)
  lines.push(hr)
  lines.push('')
  lines.push(bold('  SUMMARY'))
  lines.push(wrapText(audit.summary, width - 4, '  '))
  lines.push('')

  lines.push(bold(`  FINDINGS (${audit.findings.length})`))
  if (audit.findings.length === 0) {
    lines.push(`  ${dim('none')}`)
  } else {
    audit.findings.forEach((f, i) => {
      const sev = (f.severity || 'info').toLowerCase()
      const sevColor = SEVERITY_COLOR[sev] ?? dim
      const idx = f.actionIndex != null ? dim(`  (action #${f.actionIndex})`) : ''
      lines.push(`  ${sevColor(`[${sev.toUpperCase()}]`)} ${magenta(f.category)}${idx}`)
      lines.push(wrapText(f.description, width - 6, '     '))
      if (i < audit.findings.length - 1) lines.push('')
    })
  }
  lines.push('')

  lines.push(bold(`  RECOMMENDATIONS (${audit.recommendations.length})`))
  if (audit.recommendations.length === 0) {
    lines.push(`  ${dim('none')}`)
  } else {
    audit.recommendations.forEach((r, i) => {
      lines.push(`  ${dim(`${i + 1}.`)} ${wrapText(r, width - 6, '     ').trimStart()}`)
    })
  }
  lines.push('')
  lines.push(hrStrong)
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const params = parseArgs()
  await Connections.open([EnumConnection.MONGODB])

  const { audit } = await AuditRunner.run(params)

  const mode = process.env.AUDIT_OUTPUT || 'pretty'
  if (mode === 'json' || mode === 'raw') {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`)
  } else {
    const rendered = formatPretty(audit, params)
    process.stdout.write(rendered)
    if (!rendered.endsWith('\n')) process.stdout.write('\n')
  }
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
