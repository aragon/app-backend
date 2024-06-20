import Joi from 'joi'
import { ITokenType, NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'

const TokenSchema = {
  getExtraParams: Joi.object({
    onlyActive: Joi.boolean().optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    type: Joi.string()
      .valid(...Object.values(ITokenType))
      .optional(),
  }),

  getTokenByAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),
}

export default TokenSchema
