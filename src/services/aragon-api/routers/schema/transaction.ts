import Joi from 'joi'
import { ITransactionCategory, NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'

const TransactionSchema = {
  getExtraParams: Joi.object({
    daoAddress: ValidationSchema.joiAddress.optional(),
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
