import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const ContractDetailsSchema = {
  getContractDetails: Joi.object({
    network: Joi.string().required(),
    address: ValidationSchema.joiAddress.required(),
  }),
}

export default ContractDetailsSchema
