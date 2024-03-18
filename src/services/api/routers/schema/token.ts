import Joi from 'joi'
import { NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'

const TokenSchema = {
  getToken: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),
}

export default TokenSchema
