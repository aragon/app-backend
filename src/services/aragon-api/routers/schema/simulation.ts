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
    network: Joi.string().optional(),
  }),
  
  // For backward compatibility
  simulationBundle: Joi.object({
    simulations: Joi.array()
      .items(
        Joi.object({
          network_id: Joi.string().required(),
          save: Joi.boolean().default(true),
          save_if_fails: Joi.boolean().default(true),
          simulation_type: Joi.string().default('full'),
          from: Joi.string().optional(),
          to: Joi.string().required(),
          input: Joi.string().optional(),
          value: Joi.string().optional(),
          gas: Joi.number().optional(),
          gas_price: Joi.string().optional(),
          state_objects: Joi.object()
            .pattern(
              Joi.string(),
              Joi.object({
                storage: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
                balance: Joi.string().optional(),
                code: Joi.string().optional(),
                nonce: Joi.number().optional(),
              }),
            )
            .optional(),
        }),
      )
      .min(1)
      .required(),
  }),
  
  getSimulationByProposalId: Joi.object({
    proposalId: Joi.string().required(),
  }),
  
  getSimulationById: Joi.object({
    simulationId: Joi.string().required(),
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

  runSimulationByProposalId: Joi.object({
    proposalId: Joi.string().required(),
  }),

  runSimulationForActions: Joi.object({
    actions: Joi.array()
      .items(
        Joi.object({
          to: Joi.string().required(),
          value: Joi.string().default('0'),
          data: Joi.string().default('0x'),
        }),
      )
      .min(1)
      .required(),
  }),
}

export default SimulationSchema
