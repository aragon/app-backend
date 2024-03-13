import Joi from 'joi'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const TokenSchema = {
  getToken: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: Joi.string()
      .required()
      .custom((value, helpers) => {
        try {
          return getAddress(value)
        } catch (error) {
          return helpers.error('string.invalid', { value })
        }
      }, 'Ethereum Address Validation'),
  }),
}

export default TokenSchema
