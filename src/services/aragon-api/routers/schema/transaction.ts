import Joi from 'joi'
import { ITransactionCategory, NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'

const TransactionSchema = {
  getExtraParams: Joi.object({
    fromAddress: ValidationSchema.joiAddress.optional(),
    toAddress: ValidationSchema.joiAddress.optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    category: Joi.string()
      .valid(...Object.values(ITransactionCategory))
      .optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.optional(),
  }),
}

export default TransactionSchema
