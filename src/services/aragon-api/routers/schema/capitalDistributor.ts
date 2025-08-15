import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const CapitalDistributorSchema = {
  getCampaignsExtraParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    userAddress: ValidationSchema.joiAddress.optional(),
    status: Joi.string().valid('claimed', 'claimable').optional(),
  }),
}

export default CapitalDistributorSchema
