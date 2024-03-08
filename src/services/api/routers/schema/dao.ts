import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum, EnumPluginType } from '@types'

const DaoSchema = {
  getWithPagination: (params: any) =>
    Joi.object(
      Object.assign(ValidationSchema.generateJoiPagination(params.fromDate), {
        network: Joi.string()
          .valid(...Object.values(NetworksEnum))
          .optional(),
        plugin: Joi.string()
          .valid(...Object.values(EnumPluginType))
          .optional(),
      }),
    ),
}

export default DaoSchema
