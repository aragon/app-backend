import Joi from 'joi'

const SimulationSchema = {
  simulateBundle: Joi.object({
    actions: Joi.array()
      .items(
        Joi.object({
          from: Joi.string().optional(),
          to: Joi.string().required(),
          data: Joi.string().default('0x'),
          value: Joi.string().default('0'),
        }),
      )
      .min(1)
      .required(),
    network: Joi.string().required(),
  }),

  getSimulationByProposalId: Joi.object({
    proposalId: Joi.string().required(),
  }),

  getSimulationByActions: Joi.object({
    actions: Joi.array()
      .items(
        Joi.object({
          to: Joi.string().required(),
          data: Joi.string().default('0x'),
          value: Joi.string().default('0'),
        }),
      )
      .min(1)
      .required(),
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
