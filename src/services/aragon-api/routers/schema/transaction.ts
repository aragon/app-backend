import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { ITransactionCategory, NetworksEnum } from '@types'

const TransactionSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      daoAddress: ValidationSchema.joiAddress.optional(),
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      category: Joi.string()
        .valid(...Object.values(ITransactionCategory))
        .optional(),
    }),
  ),
}

export default TransactionSchema
