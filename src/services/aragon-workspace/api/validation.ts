import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import WorkspaceConfig from '@workspace/config'
import { IWorkspaceAccountType } from '@workspace/types/workspace'
import Joi from 'joi'

const WorkspaceSchema = {
  createWorkspace: Joi.object({
    name: Joi.string().min(1).max(120).required(),
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
  }),
}

export default WorkspaceSchema
