import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const DaoSchema = {
  getExtraParams: Joi.object({
    networks: Joi.alternatives()
      .try(
        // handle an actual array
        Joi.array()
          .items(Joi.string().valid(...Object.values(NetworksEnum)))
          .single(),

        // or a CSV string that we split
        Joi.string().custom((value, helpers) => {
          const parts = value.split(',').map((v: string) => v.trim())
          // validate each part
          const invalid = parts.find(p => !Object.values(NetworksEnum).includes(p))
          if (invalid) {
            return helpers.error('any.invalid', { invalid })
          }
          return parts
        }),
      )
      .optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    address: ValidationSchema.joiAddress.optional(),
  }),

  getDaosByMember: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
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
