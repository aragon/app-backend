import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const ProposalSchema = {
  getExtraParams: Joi.object({
    proposalIndex: Joi.number().integer().min(0).optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    creatorAddress: ValidationSchema.joiAddress.optional(),
    daoInfo: Joi.boolean().optional(),
  }),

  getProposalById: Joi.object({
    id: Joi.string().required(),
  }),

  getProposalByTransactionHash: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    transactionHash: ValidationSchema.joiTransactionHash.required(),
  }),
  canCreateProposal: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    memberAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default ProposalSchema
