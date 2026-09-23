import config from '@config'
import ProposalAnalysisAssistantClient from '@modules/proposalAnalysis/assistantClient'
import {
  type IProposalAnalysisRequest,
  type IProposalAnalysisResponse,
  NetworksEnum,
  PROPOSAL_ANALYSIS_CONTRACT_VERSION,
} from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const request = (): IProposalAnalysisRequest => ({
  contractVersion: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
  factPack: {
    contractVersion: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
    proposal: {
      id: 'proposal-1',
      network: NetworksEnum.ethereumMainnet,
      daoAddress: '0x1111111111111111111111111111111111111111',
      daoName: 'Test DAO',
      pluginAddress: '0x2222222222222222222222222222222222222222',
      pluginSubdomain: null,
      creatorAddress: '0x3333333333333333333333333333333333333333',
      startDate: 1,
      endDate: 2,
      isSubProposal: false,
      executed: false,
      hasTitle: true,
      hasSummary: false,
      hasDescription: true,
    },
    governance: {
      votingMode: null,
      supportThreshold: null,
      minParticipation: null,
      minDuration: null,
      minApprovals: null,
      onlyListed: null,
      stages: [],
    },
    treasury: { tvlUsd: null, outflowUsd: null, outflowShare: null },
    actions: [],
    simulation: { status: null, runAt: null },
    integrity: {
      decoding: false,
      rawActionsCount: 0,
      topLevelActionsCount: 0,
      undecodedActionsCount: 0,
      actionsCountMismatch: false,
    },
  },
  findings: [],
  text: { title: 'Title', summary: null, description: 'Description' },
})

const response = (overrides: Record<string, any> = {}): IProposalAnalysisResponse =>
  ({
    contractVersion: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
    rulesSeverity: 'routine',
    model: 'mock-model',
    promptVersion: 'v1',
    report: {
      headline: 'Does a thing.',
      whatItDoes: [{ text: 'Does it.', actionRefs: [0] }],
      intentMismatch: { verdict: 'aligned', explanation: 'Matches.', actionRefs: [] },
      whyItMatters: 'Because.',
      openQuestions: [],
      severity: 'routine',
    },
    ...overrides,
  }) as IProposalAnalysisResponse

const axiosFailure = (status: number, code?: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: code ? { error: { code, message: 'x' } } : {} },
  })

describe('Module: proposalAnalysis/assistantClient', () => {
  let sandbox: SinonSandbox
  const originalConfig = { ...config.AI_ANALYSIS }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    Object.assign(config.AI_ANALYSIS, {
      ASSISTANT_URL: 'https://dev.assistant.aragon.org/',
      ASSISTANT_SECRET: 'secret',
      ASSISTANT_BYPASS_SECRET: '',
      ASSISTANT_ALLOWED_HOSTS: ['localhost', '.vercel.app', '.aragon.org'],
      TIMEOUT_MS: 1234,
    })
  })

  afterEach(() => {
    sandbox.restore()
    Object.assign(config.AI_ANALYSIS, originalConfig)
  })

  describe('resolveUrl', () => {
    it('uses the configured assistant without a trailing slash when no override is given', () => {
      expect(ProposalAnalysisAssistantClient.resolveUrl()).to.equal('https://dev.assistant.aragon.org')
      expect(ProposalAnalysisAssistantClient.resolveUrl(undefined)).to.equal('https://dev.assistant.aragon.org')
    })

    it('fails with 502 when nothing is configured and no override is given', () => {
      config.AI_ANALYSIS.ASSISTANT_URL = ''

      const thrown: any = (() => {
        try {
          return ProposalAnalysisAssistantClient.resolveUrl()
        } catch (error) {
          return error
        }
      })()

      expect(thrown.message).to.equal('analysisAssistantUnavailable')
      expect(thrown.status).to.equal(502)
    })

    it('accepts overrides on allowed hosts: exact host or configured suffix', () => {
      expect(ProposalAnalysisAssistantClient.resolveUrl('http://localhost:4000/')).to.equal('http://localhost:4000')
      expect(ProposalAnalysisAssistantClient.resolveUrl('https://assistant-abc-aragon-app.vercel.app')).to.equal(
        'https://assistant-abc-aragon-app.vercel.app',
      )
      expect(ProposalAnalysisAssistantClient.resolveUrl('https://Dev.Assistant.Aragon.org')).to.equal(
        'https://Dev.Assistant.Aragon.org',
      )
    })

    it('refuses overrides outside the allowed hosts, other schemes and unparsable values', () => {
      for (const url of [
        'https://evil.example.com',
        'https://aragon.org.evil.com',
        'https://notlocalhost',
        'ftp://localhost',
        'not a url',
      ]) {
        const thrown: any = (() => {
          try {
            return ProposalAnalysisAssistantClient.resolveUrl(url)
          } catch (error) {
            return error
          }
        })()

        expect(thrown.message, url).to.equal('analysisAssistantUrlNotAllowed')
        expect(thrown.status, url).to.equal(400)
        expect(thrown.exposeMeta, url).to.deep.equal({ allowedHosts: ['localhost', '.vercel.app', '.aragon.org'] })
      }
    })
  })

  describe('requestReport', () => {
    it('posts the request with the bearer secret and the configured timeout and returns the report', async () => {
      const post = sandbox.stub(axios, 'post').resolves({ data: response() })

      const result = await ProposalAnalysisAssistantClient.requestReport('https://assistant.test', request())

      expect(result).to.deep.equal(response())
      expect(post.calledOnce).to.be.true
      const [url, body, options] = post.firstCall.args
      expect(url).to.equal('https://assistant.test/analysis/proposal')
      expect(body).to.deep.equal(request())
      expect(options?.timeout).to.equal(1234)
      expect(options?.headers).to.deep.equal({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' })
    })

    it('adds the Vercel protection bypass header when configured', async () => {
      config.AI_ANALYSIS.ASSISTANT_BYPASS_SECRET = 'bypass'
      const post = sandbox.stub(axios, 'post').resolves({ data: response() })

      await ProposalAnalysisAssistantClient.requestReport('https://assistant.test', request())

      expect(post.firstCall.args[2]?.headers).to.include({ 'x-vercel-protection-bypass': 'bypass' })
    })

    it('maps a contract version rejection to analysisContractMismatch', async () => {
      sandbox.stub(axios, 'post').rejects(axiosFailure(400, 'contract_version_mismatch'))

      const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(e => e)

      expect(thrown.message).to.equal('analysisContractMismatch')
      expect(thrown.status).to.equal(502)
      expect(thrown.exposeMeta).to.deep.equal({ expected: PROPOSAL_ANALYSIS_CONTRACT_VERSION })
    })

    it('maps any other transport or upstream failure to analysisAssistantUnavailable with the status', async () => {
      sandbox.stub(axios, 'post').rejects(axiosFailure(401, 'unauthorized'))

      const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(e => e)

      expect(thrown.message).to.equal('analysisAssistantUnavailable')
      expect(thrown.status).to.equal(502)
      expect(thrown.exposeMeta).to.deep.equal({ status: 401, code: 'unauthorized' })
    })

    it('names the missing bypass secret when Vercel answers with its bot challenge', async () => {
      const challenge = Object.assign(new Error('Request failed with status code 429'), {
        isAxiosError: true,
        response: { status: 429, data: '<!DOCTYPE html>', headers: { 'x-vercel-mitigated': 'challenge' } },
      })
      sandbox.stub(axios, 'post').rejects(challenge)

      const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(e => e)

      expect(thrown.message).to.equal('analysisAssistantUnavailable')
      expect(thrown.status).to.equal(502)
      expect(thrown.description).to.equal(
        'The analysis service is behind a bot challenge; set AI_ANALYSIS_ASSISTANT_BYPASS_SECRET on this backend',
      )
      expect(thrown.exposeMeta).to.deep.equal({ status: 429, mitigated: 'challenge' })
    })

    it('treats a timeout as unavailable', async () => {
      sandbox
        .stub(axios, 'post')
        .rejects(Object.assign(new Error('timeout of 1234ms exceeded'), { code: 'ECONNABORTED' }))

      const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(e => e)

      expect(thrown.message).to.equal('analysisAssistantUnavailable')
      expect(thrown.exposeMeta).to.deep.equal({ status: undefined, code: undefined })
    })

    it('rejects a reply written against another contract version', async () => {
      sandbox.stub(axios, 'post').resolves({ data: response({ contractVersion: 99 }) })

      const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(e => e)

      expect(thrown.message).to.equal('analysisContractMismatch')
      expect(thrown.exposeMeta).to.deep.equal({ expected: PROPOSAL_ANALYSIS_CONTRACT_VERSION, received: 99 })
    })

    it('rejects a malformed report: unknown severity, missing fields, bad action refs', async () => {
      const cases: Array<Record<string, any>> = [
        { report: { ...response().report, severity: 'critical' } },
        { report: { ...response().report, whatItDoes: [{ text: 'x', actionRefs: [-1] }] } },
        { report: { ...response().report, intentMismatch: { verdict: 'unsure', explanation: 'x', actionRefs: [] } } },
        { report: { ...response().report, openQuestions: [42] } },
        { rulesSeverity: 'severe' },
        { model: undefined },
      ]

      for (const overrides of cases) {
        sandbox.restore()
        sandbox = sinon.createSandbox()
        sandbox.stub(axios, 'post').resolves({ data: response(overrides) })

        const thrown: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request()).catch(
          e => e,
        )

        expect(thrown.message, JSON.stringify(overrides)).to.equal('analysisAssistantUnavailable')
        expect(thrown.description).to.equal('The analysis service returned a malformed report')
      }
    })

    it('keeps extra fields a newer assistant may add', async () => {
      sandbox.stub(axios, 'post').resolves({ data: { ...response(), extra: true } })

      const result: any = await ProposalAnalysisAssistantClient.requestReport('https://a.test', request())

      expect(result.extra).to.be.true
    })
  })
})
