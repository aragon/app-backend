import AssessmentContextBuilder from '@modules/proposalChecks/context'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { type IAssessmentContext, PROPOSAL_CHECKS_RULES_VERSION } from '@types'

/** A context with the DeCats-shaped captured revision and no other inputs. */
export const fakeAssessmentContext = (overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const request = fakeProposalAssessment()
  return {
    request: {
      id: request.id,
      proposalId: request.proposalId,
      network: request.network,
      daoAddress: request.daoAddress,
      pluginAddress: request.pluginAddress,
      revisionId: request.revisionId,
      rulesVersion: PROPOSAL_CHECKS_RULES_VERSION,
      creatorAddress: null,
    },
    captured: request.captured,
    actions: AssessmentContextBuilder._flatten(request.captured.rawActions, request.daoAddress),
    simulation: {
      status: 'unsupported',
      reason: 'not simulated in this test',
      simulationId: null,
      block: request.captured.evidenceBlock.number,
      movements: [],
      approvals: [],
      executions: [],
    },
    recipients: {},
    tokens: {},
    treasury: { pricedAt: 0, totalUsd: null, assets: {} },
    permissions: { available: false, grants: {} },
    plugins: [],
    sppStages: {},
    upgrades: {},
    pluginSetups: {},
    components: {},
    allowances: {},
    ownership: {},
    votingSettings: {},
    memberships: {},
    stages: {},
    votingEvidence: {
      status: 'unsupported',
      reason: 'not read in this test',
      block: request.captured.evidenceBlock.number,
      chain: null,
      indexed: {
        votingMode: null,
        supportThreshold: null,
        minParticipation: null,
        startDate: null,
        endDate: null,
        totalSupply: null,
        tally: null,
      },
    },
    stageEvidence: {
      status: 'unsupported',
      reason: 'not read in this test',
      block: request.captured.evidenceBlock.number,
      chain: null,
      indexed: { stageIndex: null, lastStageTransition: null },
      stage: null,
      bodies: [],
    },
    metadata: {
      uri: request.captured.metadataUri,
      uriKind: 'ipfs',
      indexed: { title: 'Withdraw funds', summary: null, description: null },
      fetched: null,
      fetchStatus: 'skipped',
    },
    creator: {
      address: null,
      priorProposals: null,
      powerAppearedAt: null,
      powerAgeSeconds: null,
      votesCast: 0,
      largestVoterShare: null,
      largestVoter: null,
      limits: ['not read in this test'],
    },
    previous: null,
    validation: {
      status: 'unsupported',
      reason: 'not validated in this test',
      simulationId: null,
      block: request.captured.evidenceBlock.number,
    },
    ...overrides,
  }
}
