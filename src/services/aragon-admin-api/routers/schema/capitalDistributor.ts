import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const CapitalDistributorSchema = {
  campaignParams: Joi.object({
    campaignId: Joi.string().required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  addMembersListParams: Joi.object({
    campaignId: Joi.string().required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  addMembersListBody: Joi.array()
    .items(
      Joi.object({
        address: ValidationSchema.joiAddress.required(),
        amount: Joi.string().pattern(/^\d+$/).required(),
      }),
    )
    .min(1)
    .required(),
}

export default CapitalDistributorSchema
