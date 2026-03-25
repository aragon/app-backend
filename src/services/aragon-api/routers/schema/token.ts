import ValidationSchema from '@helpers/validationSchema'
import { ITokenType, NetworksEnum } from '@types'
import Joi from 'joi'

const TokenSchema = {
  getExtraParams: Joi.object({
    onlyActive: Joi.boolean().optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    type: Joi.string()
      .valid(...Object.values(ITokenType))
      .optional(),
    isGovernance: Joi.boolean().optional(),
  }),

  getTokenByAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  getGovernanceRewardsParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  getGovernanceRewardsQuery: Joi.object({
    lookbackDate: Joi.string().isoDate().required(),
    rewardTotalAmount: Joi.string().pattern(/^\d+$/).required(),
  }),
}

export default TokenSchema
