import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const PermissionSchema = {
  getPermissionsByDao: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    daoAddress: ValidationSchema.joiAddress.required(),
  }),
}

export default PermissionSchema
