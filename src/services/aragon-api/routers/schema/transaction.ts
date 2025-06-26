import Joi from 'joi'
import { ITransactionCategory, ITransactionIndexCheckType, NetworksEnum } from '@types'
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

  getTransactionIndexingStatus: Joi.object({
    transactionHash: Joi.string().required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    type: Joi.string()
      .valid(...Object.values(ITransactionIndexCheckType))
      .required(),
  }),
}

export default TransactionSchema
