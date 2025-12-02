import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const PolicySchema = {
  getPoliciesByDaoUrlParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    daoAddress: ValidationSchema.joiAddress.required(),
  }),
}

export default PolicySchema
