/**
 * HTTP client for the assistant's proposal-analysis endpoint (`POST /analysis/proposal`).
 *
 * The assistant is the only place a model is called; this backend never holds an AI Gateway key.
 * The request carries the fact pack, the rule findings and the proposal text, and the response is
 * checked here against the hand-mirrored contract before anyone reads it: a schema drift on either
 * side must fail loudly with a named error, not surface as an undefined field in the UI.
 */

import config from '@config'
import * as Errors from '@errors'
import logger from '@logger'
import {
  ErrorKeyEnum,
  IProposalAnalysisIntentVerdict,
  type IProposalAnalysisRequest,
  type IProposalAnalysisResponse,
  IProposalAnalysisSeverity,
  PROPOSAL_ANALYSIS_CONTRACT_VERSION,
} from '@types'
import axios, { type AxiosError } from 'axios'

const llo = logger.logMeta.bind(null, { service: 'proposal-analysis-assistant-client' })

const SEVERITIES: string[] = Object.values(IProposalAnalysisSeverity)
const VERDICTS: string[] = Object.values(IProposalAnalysisIntentVerdict)

function isRefList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(ref => Number.isInteger(ref) && ref >= 0)
}

/**
 * Structural check of the assistant's reply. Deliberately strict on the fields the app renders and
 * on the enums, lenient on extra fields, so a newer assistant can add data without breaking us.
 */
function isResponse(value: unknown): value is IProposalAnalysisResponse {
  const response = value as Partial<IProposalAnalysisResponse> | null
  const report = response?.report
  if (!report || typeof response.model !== 'string' || typeof response.promptVersion !== 'string') {
    return false
  }
  if (!SEVERITIES.includes(response.rulesSeverity as string) || !SEVERITIES.includes(report.severity)) {
    return false
  }
  if (typeof report.headline !== 'string' || typeof report.whyItMatters !== 'string') {
    return false
  }
  if (
    !Array.isArray(report.whatItDoes) ||
    !report.whatItDoes.every(item => typeof item?.text === 'string' && isRefList(item.actionRefs))
  ) {
    return false
  }
  if (
    !VERDICTS.includes(report.intentMismatch?.verdict) ||
    typeof report.intentMismatch.explanation !== 'string' ||
    !isRefList(report.intentMismatch.actionRefs)
  ) {
    return false
  }
  return Array.isArray(report.openQuestions) && report.openQuestions.every(question => typeof question === 'string')
}

/** The host of `url` ends with one of the configured suffixes (`localhost`, `.vercel.app`, …). */
function isAllowedHost(url: string): boolean {
  let hostname: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false
    }
    hostname = parsed.hostname.toLowerCase()
  } catch {
    return false
  }

  return config.AI_ANALYSIS.ASSISTANT_ALLOWED_HOSTS.some(suffix => {
    const normalized = suffix.trim().toLowerCase()
    return normalized.startsWith('.') ? hostname.endsWith(normalized) : hostname === normalized
  })
}

const ProposalAnalysisAssistantClient = {
  /**
   * The assistant to call for this request: the override when the caller gave one, otherwise the
   * configured URL. An override outside the allowed hosts is refused, the bearer secret must never
   * travel to an arbitrary address.
   */
  resolveUrl(override?: string): string {
    if (override) {
      Errors.assertExposable(isAllowedHost(override), ErrorKeyEnum.analysisAssistantUrlNotAllowed, null, null, {
        allowedHosts: config.AI_ANALYSIS.ASSISTANT_ALLOWED_HOSTS,
      })
      return override.replace(/\/+$/, '')
    }

    Errors.assertExposable(
      !!config.AI_ANALYSIS.ASSISTANT_URL,
      ErrorKeyEnum.analysisAssistantUnavailable,
      null,
      'The analysis service is not configured',
    )
    return config.AI_ANALYSIS.ASSISTANT_URL.replace(/\/+$/, '')
  },

  async requestReport(baseUrl: string, request: IProposalAnalysisRequest): Promise<IProposalAnalysisResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.AI_ANALYSIS.ASSISTANT_SECRET}`,
      'Content-Type': 'application/json',
    }
    if (config.AI_ANALYSIS.ASSISTANT_BYPASS_SECRET) {
      headers['x-vercel-protection-bypass'] = config.AI_ANALYSIS.ASSISTANT_BYPASS_SECRET
    }

    let data: unknown
    try {
      const response = await axios.post(`${baseUrl}/analysis/proposal`, request, {
        headers,
        timeout: config.AI_ANALYSIS.TIMEOUT_MS,
      })
      data = response.data
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: { code?: string } }>
      const status = axiosError.response?.status
      const code = axiosError.response?.data?.error?.code
      // Vercel's bot challenge answers with a 429 checkpoint page and this header. The call never
      // reached the assistant: the bypass secret is missing or wrong on this backend.
      const mitigated = axiosError.response?.headers?.['x-vercel-mitigated'] as string | undefined
      logger.warn(
        'Assistant analysis call failed',
        llo({ proposalId: request.factPack.proposal.id, status, code, mitigated, error: axiosError.message }),
      )

      Errors.assertExposable(code !== 'contract_version_mismatch', ErrorKeyEnum.analysisContractMismatch, null, null, {
        expected: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
      })
      Errors.assertExposable(
        !mitigated,
        ErrorKeyEnum.analysisAssistantUnavailable,
        null,
        'The analysis service is behind a bot challenge; set AI_ANALYSIS_ASSISTANT_BYPASS_SECRET on this backend',
        { status, mitigated },
      )
      Errors.throwExposable(ErrorKeyEnum.analysisAssistantUnavailable, null, null, { status, code })
    }

    Errors.assertExposable(
      (data as Partial<IProposalAnalysisResponse>)?.contractVersion === PROPOSAL_ANALYSIS_CONTRACT_VERSION,
      ErrorKeyEnum.analysisContractMismatch,
      null,
      null,
      { expected: PROPOSAL_ANALYSIS_CONTRACT_VERSION, received: (data as any)?.contractVersion ?? null },
    )
    const wellFormed = isResponse(data)
    Errors.assertExposable(
      wellFormed,
      ErrorKeyEnum.analysisAssistantUnavailable,
      null,
      'The analysis service returned a malformed report',
    )

    return data as IProposalAnalysisResponse
  },
}

export default ProposalAnalysisAssistantClient
