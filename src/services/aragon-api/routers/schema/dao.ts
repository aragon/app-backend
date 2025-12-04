import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const DaoSchema = {
  getExtraParams: Joi.object({
    networks: ValidationSchema.joiNetworks.optional(),
    address: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
  }),

  getDaosByMember: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    networks: ValidationSchema.joiNetworks.optional(),
    memberAddress: Joi.alternatives().try(ValidationSchema.joiAddress.required(), ValidationSchema.joiEns.required()),
    excludeDaoId: Joi.string().optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.required(),
    onlyParent: Joi.boolean().optional(),
  }),

  getDaoByAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
    onlyParent: Joi.boolean().optional(),
  }),

  getDaoByEns: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    ens: ValidationSchema.joiEns.required(),
    onlyParent: Joi.boolean().optional(),
  }),
}

export default DaoSchema
