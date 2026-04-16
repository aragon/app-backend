import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const PolicySchema = {
  getPoliciesByDaoUrlParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    daoAddress: ValidationSchema.joiAddress.required(),
    onlyParent: Joi.boolean().optional(),
  }),
}

export default PolicySchema
