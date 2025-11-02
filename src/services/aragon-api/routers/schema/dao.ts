import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const DaoSchema = {
  getExtraParams: Joi.object({
    networks: ValidationSchema.joiNetworks.optional(),
    address: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    daoIds: Joi.array().items(ValidationSchema.joiDaoId).optional(),
    daoAddresses: Joi.array().items(ValidationSchema.joiAddress).optional(),
  }),

  getExtraParamsV2: Joi.object({
    networks: ValidationSchema.joiNetworks.optional(), // 改为可选
    address: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    daoIds: Joi.array().items(ValidationSchema.joiDaoId).optional(),
    daoAddresses: Joi.array().items(ValidationSchema.joiAddress).optional(),
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
  }),

  getDaoByAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  getDaoByEns: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    ens: ValidationSchema.joiEns.required(),
  }),
}

export default DaoSchema
