import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const DaoSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getDaoByPermalink: Joi.object({
    permalink: Joi.string()
      .required()
      .custom((value, helpers) => {
        try {
          const regex = /([a-z]+)-([0-9a-fA-Fx]+)/
          const match = value.match(regex)

          if (!match || match.length !== 3) {
            return value
          }

          const [, network, address] = match
          const checksumAddress = getAddress(address)

          const formattedValue = `${network}-${checksumAddress}`
          return formattedValue
        } catch (error) {
          return value
        }
      }, 'Permalink Address Validation'),
  }),

  getDaoPlugin: Joi.object({
    permalink: Joi.string().required(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
  }),

  getDaoMembersWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getProposalsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getAssetsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
    }),
  ),

  getTransactionsWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
    }),
  ),
}

export default DaoSchema
