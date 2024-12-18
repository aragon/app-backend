import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { ITransferSide, ITransferType, NetworksEnum } from '@types'

const DelegateSchema = {
  getExtraParams: Joi.object({
    excludeZeroAddress: Joi.boolean().optional(),
    memberAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    side: Joi.string()
      .valid(...Object.values(ITransferSide))
      .optional(),
    type: Joi.string()
      .valid(...Object.values(ITransferType))
      .optional(),
  }),
}

export default DelegateSchema
