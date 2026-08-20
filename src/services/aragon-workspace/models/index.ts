import type { ReturnModelType } from '@typegoose/typegoose'
import { getModelForClass } from '@typegoose/typegoose'
import Workspace from './workspace'
import WorkspaceCapability from './workspaceCapability'
import WorkspaceTarget from './workspaceTarget'

/**
 * The service's own model registry.
 *
 * The shared loader in src/models/utils/setModels.ts scans only
 * src/models/schema/ and registers everything it finds into the global `Models`.
 * Registering here instead keeps the POC's collections out of that namespace —
 * same Mongo connection, separate registry, nothing to unpick if this is deleted.
 *
 * Built in the service's start(), after the connection is up, mirroring how
 * ModelProxy.setMongoModels is called for the shared models.
 */
export const WorkspaceModels = {} as {
  Workspace: ReturnModelType<typeof Workspace>
  WorkspaceTarget: ReturnModelType<typeof WorkspaceTarget>
  WorkspaceCapability: ReturnModelType<typeof WorkspaceCapability>
}

export const setWorkspaceModels = (): void => {
  WorkspaceModels.Workspace = getModelForClass(Workspace)
  WorkspaceModels.WorkspaceTarget = getModelForClass(WorkspaceTarget)
  WorkspaceModels.WorkspaceCapability = getModelForClass(WorkspaceCapability)
}
