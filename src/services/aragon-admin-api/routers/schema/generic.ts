import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const GenericSchema = {
  defaultParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  daoTransactionParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    daoAddress: ValidationSchema.joiAddress.required(),
    reset: Joi.boolean().optional(),
    resetExecutions: Joi.boolean().optional(),
  }),

  setDaoVisibilityStatusParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
    status: Joi.boolean().required(),
  }),

  queueProposalMetrics: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    proposalIndex: Joi.string().required(),
  }),

  recalculateProposalActions: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    incrementalId: Joi.number().required(),
  }),

  delegateChangedSync: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),

  eventReplayParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    txHash: Joi.string()
      .pattern(/^0x[0-9a-fA-F]{64}$/)
      .required(),
  }),
}

export default GenericSchema
