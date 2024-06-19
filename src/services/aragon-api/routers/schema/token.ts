import Joi from 'joi'
import { ITokenType, NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'

const TokenSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      type: Joi.string()
        .valid(...Object.values(ITokenType))
        .optional(),
    }),
  ),

  getToken: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),
}

export default TokenSchema
