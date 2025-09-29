import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'

const PluginSchema = {
  getInstallationData: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  getPluginsByDaoUrlParams: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  getPluginsByDaoQueryParams: Joi.object({
    interfaceType: Joi.string()
      .valid(...Object.values(IPluginInterfaceType))
      .optional(),
    status: Joi.string()
      .valid(...Object.values(IPluginStatus), 'all')
      .optional()
      .default('all'),
    isProcess: Joi.boolean().optional(),
    isSupported: Joi.boolean().optional(),
  }),
}

export default PluginSchema
