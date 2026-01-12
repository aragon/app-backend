import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const ContractDetailsSchema = {
  getContractDetails: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    address: ValidationSchema.joiAddress.required(),
  }),

  getContractDetailsV2: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
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

  decodeActionDataV2: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    to: ValidationSchema.joiAddress.required(),
    data: Joi.string().required(),
    value: Joi.any().allow(null),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  decodeActionBatchV3: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          data: Joi.string().required(),
          value: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).default('0'),
        }),
      )
      .min(1)
      .max(20)
      .required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default ContractDetailsSchema
