import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const ContractDetailsSchema = {
  getContractDetails: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    address: ValidationSchema.joiAddress.required(),
  }),
  decodeActionData: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    to: ValidationSchema.joiAddress.required(),
    data: Joi.string().required(),
    value: Joi.any().allow(null),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
  }),
}

export default ContractDetailsSchema
