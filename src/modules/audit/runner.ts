import Anthropic from '@anthropic-ai/sdk'
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
}

interface IClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// Anthropic published pricing per 1M tokens (USD). Cache writes cost 1.25x base
// input, cache reads cost 0.1x. Output uses the standard rate. Keyed by the
// `claude-{family}-{...}` model identifier prefix so renamed/aliased model
// strings still resolve. Unknown models → costUsd reported as null.
const MODEL_RATE_PREFIXES: Array<{ prefix: string; rates: { inputPerMtok: number; outputPerMtok: number } }> = [
  { prefix: 'claude-opus', rates: { inputPerMtok: 15, outputPerMtok: 75 } },
  { prefix: 'claude-sonnet', rates: { inputPerMtok: 3, outputPerMtok: 15 } },
  { prefix: 'claude-haiku', rates: { inputPerMtok: 0.8, outputPerMtok: 4 } },
  { prefix: 'claude-3-opus', rates: { inputPerMtok: 15, outputPerMtok: 75 } },
  { prefix: 'claude-3-5-sonnet', rates: { inputPerMtok: 3, outputPerMtok: 15 } },
  { prefix: 'claude-3-7-sonnet', rates: { inputPerMtok: 3, outputPerMtok: 15 } },
  { prefix: 'claude-3-5-haiku', rates: { inputPerMtok: 0.8, outputPerMtok: 4 } },
]
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

const ALLOWED_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical'])

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

function stripCodeFence(s: string): string {
  // Models occasionally wrap JSON in ```json ... ``` fences despite the prompt — strip them.
  return s
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

function estimateCost(model: string, usage: IClaudeUsage): number | null {
  // Sort prefixes by length desc so more specific prefixes win (e.g.
  // "claude-3-5-sonnet" before "claude-sonnet").
  const ratesEntry = [...MODEL_RATE_PREFIXES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(r => model.startsWith(r.prefix))
  if (!ratesEntry) return null

  const { inputPerMtok, outputPerMtok } = ratesEntry.rates
  const inTok = usage.input_tokens ?? 0
  const outTok = usage.output_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cost =
    (inTok * inputPerMtok) / 1_000_000 +
    (cacheWrite * inputPerMtok * CACHE_WRITE_MULT) / 1_000_000 +
    (cacheRead * inputPerMtok * CACHE_READ_MULT) / 1_000_000 +
    (outTok * outputPerMtok) / 1_000_000
  return Number(cost.toFixed(6))
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; usage: IClaudeUsage; durationMs: number }> {
  const { ANTHROPIC_API_KEY, MODEL, MAX_TOKENS, TIMEOUT_MS } = config.AUDIT
  if (!ANTHROPIC_API_KEY) {
    throw new Error('AUDIT_ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: TIMEOUT_MS })
  const start = Date.now()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // `ephemeral` is the only cache_control type Anthropic currently supports
    // and it ENABLES prompt caching (5-min TTL on the matching prefix). The
    // static rules/schema/risk-categories live in `system`, so once cached
    // every subsequent audit within the window skips re-tokenizing them.
    // https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = response.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined
  if (!textBlock) {
    throw new Error('Anthropic SDK returned no text content block')
  }

  return {
    text: textBlock.text,
    usage: response.usage as IClaudeUsage,
    durationMs: Date.now() - start,
  }
}

function validateAudit(value: unknown): {
  summary: string
  riskLevel: string
  findings: IProposalAuditFinding[]
  recommendations: string[]
} {
  const v = value as Record<string, unknown> | null
  if (!v || typeof v !== 'object') {
    throw new Error('Audit payload is not an object')
  }
  if (typeof v.summary !== 'string' || v.summary.length === 0) {
    throw new Error('Audit payload is missing a non-empty `summary`')
  }
  if (typeof v.riskLevel !== 'string' || !ALLOWED_RISK_LEVELS.has(v.riskLevel)) {
    throw new Error('Audit payload has an invalid `riskLevel`')
  }
  const findingsRaw = v.findings ?? []
  if (!Array.isArray(findingsRaw)) {
    throw new Error('Audit payload `findings` must be an array')
  }
  const findings: IProposalAuditFinding[] = findingsRaw.map((f, i) => {
    const item = f as Record<string, unknown>
    if (!item || typeof item !== 'object') {
      throw new Error(`Audit finding[${i}] is not an object`)
    }
    if (
      typeof item.severity !== 'string' ||
      typeof item.category !== 'string' ||
      typeof item.description !== 'string'
    ) {
      throw new Error(`Audit finding[${i}] is missing required string fields`)
    }
    return {
      severity: item.severity,
      category: item.category,
      description: item.description,
      actionIndex: typeof item.actionIndex === 'number' ? item.actionIndex : null,
    }
  })
  const recommendationsRaw = v.recommendations ?? []
  if (!Array.isArray(recommendationsRaw) || recommendationsRaw.some(r => typeof r !== 'string')) {
    throw new Error('Audit payload `recommendations` must be an array of strings')
  }
  return { summary: v.summary, riskLevel: v.riskLevel, findings, recommendations: recommendationsRaw as string[] }
}

const AuditRunner = {
  /**
   * Runs the proposal audit pipeline (Mongo lookup → Tenderly → prompt build → Anthropic SDK).
   * Caller is responsible for opening Mongo connections.
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

    // Fetch previous proposals from the same plugin for historical context
    const previousProposals = await Models.Proposal.find({
      pluginAddress,
      network,
      id: { $ne: proposal.id },
    })
      .sort({ blockTimestamp: -1 })
      .limit(10)
      .lean()

    const trimmedPreviousProposals = previousProposals.map((p: any) => ({
      proposalIndex: p.proposalIndex,
      incrementalId: p.incrementalId,
      title: p.title,
      summary: p.summary,
      description: p.description?.slice(0, 500) || null,
      executed: p.executed,
      blockTimestamp: p.blockTimestamp,
      actions: p.actions,
      rawActions: p.rawActions,
      audit: p.audit
        ? {
            riskLevel: p.audit.riskLevel,
            summary: p.audit.summary,
            findings: p.audit.findings,
          }
        : null,
    }))

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

    const { system, template, version } = await PromptBuilder.load()
    const userPrompt = PromptBuilder.build(
      {
        network,
        daoAddress: proposal.daoAddress,
        plugin: trimDoc(plugin),
        settings: settings ? trimDoc(settings) : null,
        proposal: trimDoc(proposal),
        rawActions: proposal.rawActions,
        decodedActions: proposal.actions,
        tenderly: trimTenderly(tenderlyResult),
        previousProposals: trimmedPreviousProposals,
      },
      template,
    )

    logger.info(
      'Invoking Anthropic SDK',
      llo({ promptVersion: version, systemLength: system.length, userLength: userPrompt.length }),
    )
    const { text, usage, durationMs } = await callClaude(system, userPrompt)

    let rawParsed: unknown
    try {
      rawParsed = JSON.parse(stripCodeFence(text))
    } catch {
      // Don't include the raw text in the error message — the model output
      // can echo untrusted proposal data and would leak through logs.
      throw new Error('Anthropic returned non-JSON output')
    }
    const validated = validateAudit(rawParsed)

    const audit: IProposalAudit = {
      riskLevel: validated.riskLevel,
      summary: validated.summary,
      findings: validated.findings,
      recommendations: validated.recommendations,
      promptVersion: version,
      tenderlyUrl: tenderlyResult.shareUrl ?? null,
      costUsd: estimateCost(config.AUDIT.MODEL, usage),
      durationMs,
      createdAt: Date.now(),
    }

    logger.info(
      'Audit completed',
      llo({
        riskLevel: audit.riskLevel,
        findingsCount: audit.findings.length,
        costUsd: audit.costUsd,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      }),
    )

    return { audit }
  },
}

export default AuditRunner
