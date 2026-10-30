import Joi from 'joi'

const ProposalAssessmentSchema = {
  latest: Joi.object({
    proposalId: Joi.string().required(),
  }),
}

export default ProposalAssessmentSchema
