import Utils from '@helpers/utils'
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
    onlyActive: Joi.boolean().optional(),
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

  uploadCampaignMembersParams: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    capitalDistributorAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    fileUrl: Joi.string()
      .uri({ scheme: ['https'] })
      .custom((value, helpers) => {
        const { hostname } = new URL(value)
        if (!Utils.isAllowedFileUrlHost(hostname)) {
          return helpers.error('any.invalid')
        }
        return value
      })
      .optional(),
  }),

  uploadCampaignMembersBody: Joi.array()
    .items(
      Joi.object({
        address: ValidationSchema.joiAddress.required(),
        amount: Joi.string().pattern(/^\d+$/).required(),
      }),
    )
    .min(1)
    .required(),

  getCampaignPrepareStatusParams: Joi.object({
    capitalDistributorAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    campaignId: Joi.string().required(),
  }),
}

export default CapitalDistributorSchema
