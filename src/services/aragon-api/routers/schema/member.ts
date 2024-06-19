import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const MemberSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      onlyActive: Joi.boolean().optional(),
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      daoAddress: ValidationSchema.joiAddress.optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getMemberById: Joi.object({
    id: ValidationSchema.joiAddress.optional(),
  }),
}

export default MemberSchema
