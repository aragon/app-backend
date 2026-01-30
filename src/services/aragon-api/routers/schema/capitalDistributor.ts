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

  getPrepareMessage: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  prepareCampaignFromGauge: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    gaugePluginAddress: ValidationSchema.joiAddress.required(),
    capitalDistributorAddress: ValidationSchema.joiAddress.required(),
    tokenAddress: ValidationSchema.joiAddress.required(),
    totalAmount: Joi.string()
      .pattern(/^[0-9]+$/)
      .required(),
    metadataUri: Joi.string()
      .pattern(/^ipfs:\/\/.+$/)
      .required(),
    nonce: Joi.string().required(),
    signature: Joi.string()
      .pattern(/^0x[0-9a-fA-F]{130}$/)
      .required(),
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
