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
// input, cache reads cost 0.1x. Output uses the standard rate.
const SONNET_RATES = {
  inputPerMtok: 3,
  outputPerMtok: 15,
  cacheWriteMultiplier: 1.25,
  cacheReadMultiplier: 0.1,
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

function stripCodeFence(s: string): string {
  // Models occasionally wrap JSON in ```json ... ``` fences despite the prompt — strip them.
  return s
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

function estimateCost(usage: IClaudeUsage): number {
  const inTok = usage.input_tokens ?? 0
  const outTok = usage.output_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cost =
    (inTok * SONNET_RATES.inputPerMtok) / 1_000_000 +
    (cacheWrite * SONNET_RATES.inputPerMtok * SONNET_RATES.cacheWriteMultiplier) / 1_000_000 +
    (cacheRead * SONNET_RATES.inputPerMtok * SONNET_RATES.cacheReadMultiplier) / 1_000_000 +
    (outTok * SONNET_RATES.outputPerMtok) / 1_000_000
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
      },
      template,
    )

    logger.info(
      'Invoking Anthropic SDK',
      llo({ promptVersion: version, systemLength: system.length, userLength: userPrompt.length }),
    )
    const { text, usage, durationMs } = await callClaude(system, userPrompt)

    let parsed: { summary: string; riskLevel: string; findings?: IProposalAuditFinding[]; recommendations?: string[] }
    try {
      parsed = JSON.parse(stripCodeFence(text))
    } catch {
      // Don't include the raw text in the error message — the model output
      // can echo untrusted proposal data and would leak through logs.
      throw new Error('Anthropic returned non-JSON output')
    }

    const audit: IProposalAudit = {
      riskLevel: parsed.riskLevel,
      summary: parsed.summary,
      findings: parsed.findings ?? [],
      recommendations: parsed.recommendations ?? [],
      promptVersion: version,
      tenderlyUrl: tenderlyResult.shareUrl ?? null,
      costUsd: estimateCost(usage),
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
