import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const SimulationSchema = {
  simulate: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: ValidationSchema.joiNetworks.required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          data: Joi.string().required(),
          value: Joi.string().default('0'),
        }),
      )
      .min(1)
      .required(),
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
