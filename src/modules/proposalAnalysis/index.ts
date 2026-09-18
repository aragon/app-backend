/**
 * Proposal analysis: the one function that turns a proposal id into a report.
 *
 * allowlist → load proposal and DAO context → fact pack → rule detectors → assistant → max(severity)
 *
 * It is a module and not controller code on purpose: today the HTTP controller calls it
 * synchronously while the user holds a button; the next iteration calls the same function from a
 * queue consumer when a proposal is decoded, and later stores the result. Nothing here depends on
 * how it was invoked.
 */

import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IProposalAnalysisGenerateOptions,
  type IProposalAnalysisRequest,
  type IProposalAnalysisResult,
  PROPOSAL_ANALYSIS_CONTRACT_VERSION,
  ProposalActionType,
} from '@types'
import { ZeroAddress } from 'ethers'
import ProposalAnalysisAssistantClient from './assistantClient'
import ProposalAnalysisDetectors from './detectors'
import ProposalAnalysisFactPack, { type IFactPackAssetInfo, type IFactPackTokenInfo } from './factPack'

const llo = logger.logMeta.bind(null, { service: 'proposal-analysis' })

/** Token addresses the fact pack will need prices and decimals for: every transfer's token. */
function collectTokenAddresses(actions: any[], out = new Set<string>()): Set<string> {
  for (const action of actions) {
    if (!action || typeof action !== 'object') {
      continue
    }
    if (action.type === ProposalActionType.Transfer || action.type === ProposalActionType.TransferNative) {
      out.add(String(action.token?.address ?? (action.type === ProposalActionType.Transfer ? action.to : ZeroAddress)))
    }
    if (action.value && action.value !== '0') {
      out.add(ZeroAddress)
    }
    if (Array.isArray(action.inputData?.actions)) {
      collectTokenAddresses(action.inputData.actions, out)
    }
  }
  return out
}

const ProposalAnalysisModule = {
  /**
   * Whether the feature is on for this DAO. An empty `DAO_IDS` means every DAO (the proof of
   * concept runs like that); a non-empty list restricts it to the ids listed, case-insensitively.
   */
  isDaoAllowed(daoId: string): boolean {
    const allowed = config.AI_ANALYSIS.DAO_IDS.map(id => id.trim().toLowerCase()).filter(id => id !== '')
    return allowed.length === 0 || allowed.includes(daoId.toLowerCase())
  },

  async generate(proposalId: string, options: IProposalAnalysisGenerateOptions = {}): Promise<IProposalAnalysisResult> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(!!proposal, ErrorKeyEnum.notFound, 404, 'Proposal not found', llo({ proposalId }))

    const daoId = Models.Dao.getEntityId({ network: proposal.network, address: proposal.daoAddress })
    // Same answer as for an unknown proposal: the feature does not exist for DAOs outside the list.
    Errors.assertExposable(ProposalAnalysisModule.isDaoAllowed(daoId), ErrorKeyEnum.analysisNotAvailable)

    // The fact pack would describe raw calldata only; wait for the decoder instead of guessing.
    Errors.assertExposable(proposal.decoding !== true, ErrorKeyEnum.analysisNotReady)

    // Fail on a bad override before any database work.
    const assistantUrl = ProposalAnalysisAssistantClient.resolveUrl(options.assistantUrl)

    const tokenAddresses = [...collectTokenAddresses(proposal.actions ?? [])]
    const [dao, plugins, tokens, assets] = await Promise.all([
      Models.Dao.findByAddress(proposal.daoAddress as HexAddress, proposal.network),
      Models.Plugin.findActivePluginsByDaoAddress(proposal.daoAddress as HexAddress, proposal.network),
      tokenAddresses.length === 0
        ? []
        : Models.Token.find({ network: proposal.network, address: { $in: tokenAddresses } }).exec(),
      Models.Asset.find({ daoAddress: proposal.daoAddress, network: proposal.network }).exec(),
    ])

    const factPack = ProposalAnalysisFactPack.build({
      proposal,
      dao: dao ? { name: dao.name, metrics: dao.metrics } : null,
      pluginAddresses: (plugins ?? []).map((plugin: { address: string }) => plugin.address),
      tokens: (tokens ?? []).map(
        (token: any): IFactPackTokenInfo => ({
          address: token.address,
          symbol: token.symbol ?? null,
          decimals: token.decimals ?? null,
          priceUsd: token.priceUsd ?? null,
        }),
      ),
      assets: (assets ?? []).map(
        (asset: any): IFactPackAssetInfo => ({ tokenAddress: asset.tokenAddress ?? ZeroAddress, amount: asset.amount }),
      ),
    })

    const rules = ProposalAnalysisDetectors.run(factPack)

    const request: IProposalAnalysisRequest = {
      contractVersion: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
      factPack,
      findings: rules.findings,
      text: {
        title: proposal.title ?? null,
        summary: proposal.summary ?? null,
        description: proposal.description ?? null,
      },
    }

    const startedAt = Date.now()
    const response = await ProposalAnalysisAssistantClient.requestReport(assistantUrl, request)

    // The assistant already applied the floor; applying it again here means a misbehaving or older
    // assistant still cannot hand the UI a severity below what the rules found.
    const severity = ProposalAnalysisDetectors.maxSeverity(rules.severity, response.report.severity)

    logger.info(
      'Proposal analysis generated',
      llo({
        proposalId,
        daoId,
        network: proposal.network,
        rulesSeverity: rules.severity,
        severity,
        findings: rules.findings.map(finding => finding.flag),
        model: response.model,
        promptVersion: response.promptVersion,
        latencyMs: Date.now() - startedAt,
      }),
    )

    return {
      proposalId,
      daoId,
      network: proposal.network,
      severity,
      rulesSeverity: rules.severity,
      report: { ...response.report, severity },
      findings: rules.findings,
      factPack,
      model: response.model,
      promptVersion: response.promptVersion,
      generatedAt: Date.now(),
    }
  },
}

export default ProposalAnalysisModule
