import Joi from 'joi'

const cidV0 = /^Qm[a-zA-Z0-9]{44}$/
const cidV1 = /^b[a-z2-7]{58}$/

const IpfsSchema = {
  getDelegateStatement: Joi.object({
    cid: Joi.string()
      .custom((value, helpers) => {
        if (!cidV0.test(value) && !cidV1.test(value)) {
          return helpers.error('string.invalid', { value })
        }
        return value
      }, 'CID Validation')
      .messages({
        'string.invalid': '{{#label}} is not a valid CID',
      })
      .required(),
  }),
}

export default IpfsSchema
