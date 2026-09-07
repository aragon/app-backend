import ValidationSchema from '@helpers/validationSchema'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import Joi from 'joi'

const network = Joi.string().valid(...Object.values(NetworksEnum))
const address = ValidationSchema.joiAddress
const accounts = Joi.array().items(Joi.object({ network, address })).max(100).required()

const pagination = (sort: string) =>
  Joi.object({
    page: Joi.number().integer().min(1).max(10000).optional().default(1),
    pageSize: Joi.number().integer().min(1).max(50).optional().default(10),
    order: Joi.string().valid('asc', 'desc').optional().default('desc'),
    sort: Joi.string().valid(sort).optional().default(sort),
    search: Joi.string().max(256).allow('').optional(),
  })
    .optional()
    .default()

const WorkspaceSchema = {
  accounts: Joi.object({ accounts }),

  assets: Joi.object({
    accounts,
    filters: Joi.object({
      network: network.optional(),
      tokenAddress: address.optional(),
      includeSpam: Joi.boolean().optional().default(false),
    })
      .with('tokenAddress', 'network')
      .optional()
      .default(),
    pagination: pagination('amountUsd'),
  }),

  transactions: Joi.object({
    accounts,
    filters: Joi.object({
      network: network.optional(),
      tokenAddress: address.optional(),
      fromAddress: address.optional(),
      toAddress: address.optional(),
      side: Joi.string()
        .valid(...Object.values(ITransactionSide))
        .optional(),
      type: Joi.string()
        .valid(...Object.values(ITransactionType))
        .optional(),
      includeSpam: Joi.boolean().optional().default(false),
    })
      .with('tokenAddress', 'network')
      .optional()
      .default(),
    pagination: pagination('blockTimestamp'),
  }),

  proposals: Joi.object({
    accounts,
    filters: Joi.object({
      network: network.optional(),
      pluginAddress: address.optional(),
      creatorAddress: address.optional(),
      isExecuted: Joi.boolean().optional(),
      isSubProposal: Joi.boolean().optional().default(false),
    })
      .with('pluginAddress', 'network')
      .optional()
      .default(),
    pagination: pagination('blockTimestamp'),
  }),

  members: Joi.object({
    accounts,
    filters: Joi.object({
      network: network.optional(),
      memberAddress: address.optional(),
      role: Joi.string().valid('member', 'owner').optional(),
    })
      .optional()
      .default(),
    pagination: pagination('address'),
  }),
}

export default WorkspaceSchema
