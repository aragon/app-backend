import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum, EnumPluginType } from '@types'

const DaoSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      plugin: Joi.string()
        .valid(...Object.values(EnumPluginType))
        .optional(),
    }),
  ),

  getDaoByAddressAndNetwork: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    address: ValidationSchema.joiAddress.required(),
  }),

  getDaoMultisigMembersWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiDaoPluginPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      address: ValidationSchema.joiAddress.required(),
    }),
  ),

  getDaoTokenVotingMembersWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiDaoPluginPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      address: ValidationSchema.joiAddress.required(),
    }),
  ),
}

export default DaoSchema
