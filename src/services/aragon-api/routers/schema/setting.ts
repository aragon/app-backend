import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const SettingSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      daoAddress: ValidationSchema.joiAddress.optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
    }),
  ),
}

export default SettingSchema
