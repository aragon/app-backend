import ValidationSchema from '@helpers/validationSchema'
import { IEventLogPluginType, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import Joi from 'joi'

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
      .valid(...Object.values(IPluginStatus))
      .optional(),
    isProcess: Joi.boolean().optional(),
    isSupported: Joi.boolean().optional(),
  }),

  getLogPluginSetupProcessor: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    event: Joi.string()
      .valid(...Object.values(IEventLogPluginType))
      .required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default PluginSchema
