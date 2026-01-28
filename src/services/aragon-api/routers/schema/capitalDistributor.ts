import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const CapitalDistributorSchema = {
  getCampaignsExtraParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    userAddress: ValidationSchema.joiAddress.optional(),
    status: Joi.string().valid('claimed', 'claimable').optional(),
  }),

  prepareCampaignFromGauge: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    gaugePluginAddress: ValidationSchema.joiAddress.required(),
    tokenAddress: ValidationSchema.joiAddress.required(),
    totalAmount: Joi.string()
      .pattern(/^[0-9]+$/)
      .required(),
    capitalDistributorAddress: ValidationSchema.joiAddress.optional(),
    epochId: Joi.string().optional(),
    metadata: Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().optional(),
      resources: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            url: Joi.string().uri().required(),
          }),
        )
        .optional(),
    }).optional(),
  }),

  getPrepareStatus: Joi.object({
    prepareId: Joi.string().required(),
  }),

  getCampaignStatsParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    userAddress: ValidationSchema.joiAddress.required(),
  }),

  getUserCampaignStatusParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    userAddress: ValidationSchema.joiAddress.required(),
  }),

  getUserCampaignRewardParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    userAddress: ValidationSchema.joiAddress.required(),
    campaignId: Joi.string().required(),
  }),
}

export default CapitalDistributorSchema
