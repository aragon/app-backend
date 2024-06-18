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
      address: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getDaoById: Joi.object({
    id: Joi.string()
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
      }, 'Dao Id validation'),
  }),
}

export default DaoSchema
