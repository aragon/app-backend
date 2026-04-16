import ValidationSchema from '@helpers/validationSchema'
import { IGaugeStatus, NetworksEnum } from '@types'
import Joi from 'joi'

const GaugeSchema = {
  getGaugeParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  getGaugeQuery: Joi.object({
    status: Joi.string()
      .valid(...Object.values(IGaugeStatus))
      .optional(),
  }),

  getRewardDistributionParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    epochId: Joi.number().integer().min(0).required(),
    rewardTotalAmount: Joi.string().pattern(/^\d+$/).required(),
  }),

  getGaugeRewardDistributionByGaugeParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    epochId: Joi.number().integer().min(0).required(),
    rewardTotalAmount: Joi.string().pattern(/^\d+$/).required(),
  }),

  getGaugeEpochMetricsParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    memberAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default GaugeSchema
