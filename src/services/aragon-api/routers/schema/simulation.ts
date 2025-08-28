import Joi from 'joi'

const SimulationSchema = {
  simulate: Joi.object({
    action: Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required(),
      data: Joi.string().required(),
      value: Joi.string().default('0'),
    }).required(),
    network: Joi.string().required(),
  }),

  getSimulationByProposalId: Joi.object({
    proposalId: Joi.string().required(),
  }),

  // POST /:network/proposal/:proposalId
  simulateProposal: Joi.object({
    proposalId: Joi.string().required(),
    network: Joi.string().required(),
  }),

  // GET /:simulationId/share
  getShareableUrl: Joi.object({
    simulationId: Joi.string().required(),
  }),
}

export default SimulationSchema
