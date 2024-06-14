import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const DaoSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getDaoByPermalink: Joi.object({
    permalink: Joi.string().required(),
  }),

  getDaoPlugin: Joi.object({
    permalink: Joi.string().required(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
  }),

  getDaoMembersWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getProposalsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getAssetsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
    }),
  ),

  getTransactionsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
    }),
  ),
}

export default DaoSchema
