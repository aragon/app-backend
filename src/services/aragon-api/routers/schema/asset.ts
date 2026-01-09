import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const AssetSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    onlyParent: Joi.boolean().optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.optional(),
  }),
}

export default AssetSchema
