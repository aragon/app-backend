/**
 * Proposal analysis controller.
 *
 * Thin by design: validation lives in the router schema, the work in `ProposalAnalysisModule`.
 * The call is synchronous like `SimulationController.simulateProposal` - the client waits for the
 * report - and the module is the seam a queue consumer will call later.
 */

import ProposalAnalysisModule from '@modules/proposalAnalysis'
import { type IProposalAnalysisGenerateOptions, type IProposalAnalysisResult } from '@types'

class ProposalAnalysisController {
  static async generate(
    proposalId: string,
    options: IProposalAnalysisGenerateOptions = {},
  ): Promise<IProposalAnalysisResult> {
    return await ProposalAnalysisModule.generate(proposalId, options)
  }
}

export default ProposalAnalysisController
