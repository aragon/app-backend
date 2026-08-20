import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import WorkspaceConfig from '@workspace/config'
import { IWorkspaceAccountType } from '@workspace/types/workspace'
import Joi from 'joi'

const WorkspaceSchema = {
  createWorkspace: Joi.object({
    name: Joi.string().min(1).max(120).required(),
    title: Joi.string().min(1).max(120).optional(),
    description: Joi.string().min(1).max(1000).optional(),
    // Only http(s): the value is handed to a browser as an image source, so a
    // data: or javascript: URL has no business being stored here.
    logo: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .max(500)
      .optional(),
    creator: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    targets: Joi.array()
      .items(ValidationSchema.joiAddress.required())
      .min(1)
      .max(WorkspaceConfig.MAX_TARGETS)
      .unique()
      .required(),
    accounts: Joi.array()
      .items(ValidationSchema.joiAddress.required())
      .max(WorkspaceConfig.MAX_ACCOUNTS)
      .unique()
      .optional(),
  }),

  workspaceId: Joi.object({
    workspaceId: Joi.string().required(),
  }),

  listWorkspaces: Joi.object({
    creator: ValidationSchema.joiAddress.required(),
    name: Joi.string().min(1).max(120).optional(),
  }),

  capabilities: Joi.object({
    workspaceId: Joi.string().required(),
    accountType: Joi.string()
      .valid(...Object.values(IWorkspaceAccountType))
      .optional(),
    account: ValidationSchema.joiAddress.optional(),
  }),
}

export default WorkspaceSchema
