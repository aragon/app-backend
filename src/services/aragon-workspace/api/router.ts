import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import WorkspaceSchema from '@workspace/api/validation'
import WorkspaceScanner from '@workspace/modules/scanner'
import WorkspaceService from '@workspace/modules/workspaceService'
import type { IWorkspaceCapabilityView, IWorkspaceSummaryView, IWorkspaceView } from '@workspace/types/workspace'
import type { HexAddress } from '@types'

const WorkspaceRouter = {
  create: async function (ctx: RouterContext) {
    const params = await ValidationSchema.validateParams(WorkspaceSchema.createWorkspace, ctx.request.body)

    const workspace = await WorkspaceService.create(params)

    // Fire and forget: scanning takes minutes, the client polls GET for status.
    WorkspaceScanner.scanInBackground(workspace.id)

    ctx.status = 202
    ctx.body = {
      id: workspace.id,
      name: workspace.name,
      creator: workspace.creator,
      network: workspace.network,
      status: workspace.status,
    }
  },

  /** A creator's workspaces. Pass `name` to get the one, since names are unique. */
  list: async function (ctx: RouterContext) {
    const { creator, name } = await ValidationSchema.validateParams(WorkspaceSchema.listWorkspaces, {
      creator: ctx.query.creator,
      name: ctx.query.name,
    })

    const workspaces = await WorkspaceService.listByCreator(creator, name)

    const body: IWorkspaceSummaryView[] = workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      creator: workspace.creator,
      network: workspace.network,
      status: workspace.status,
      targets: workspace.targets.length,
      createdAt: (workspace as any).createdAt,
    }))

    ctx.body = body
  },

  /**
   * The workspace and what protects each of its targets.
   *
   * One representation only: a gate already carries its holders and the selectors
   * it guards. The per-account view of the same facts is /capabilities, which can
   * be filtered — duplicating it here would leave a client choosing which copy to
   * believe.
   */
  get: async function (ctx: RouterContext) {
    const { workspaceId } = await ValidationSchema.validateParams(WorkspaceSchema.workspaceId, ctx.params)

    const { workspace, targets, capabilities } = await WorkspaceService.get(workspaceId)

    const body: IWorkspaceView = {
      id: workspace.id,
      name: workspace.name,
      creator: workspace.creator,
      network: workspace.network,
      status: workspace.status,
      error: workspace.error,
      counts: {
        targets: targets.length,
        gates: targets.reduce((total, target) => total + target.gates.length, 0),
        accounts: new Set(capabilities.map(capability => capability.account)).size,
        capabilities: capabilities.length,
      },
      targets: targets.map(target => ({
        address: target.address,
        status: target.status,
        schemes: target.schemes,
        owner: target.owner,
        pendingOwner: target.pendingOwner,
        authority: target.authority,
        gates: target.gates,
        error: target.error,
      })),
    }

    ctx.body = body
  },

  targets: async function (ctx: RouterContext) {
    const { workspaceId } = await ValidationSchema.validateParams(WorkspaceSchema.workspaceId, ctx.params)

    ctx.body = await WorkspaceService.listTargets(workspaceId)
  },

  capabilities: async function (ctx: RouterContext) {
    const { workspaceId, accountType, account } = await ValidationSchema.validateParams(WorkspaceSchema.capabilities, {
      workspaceId: ctx.params.workspaceId,
      accountType: ctx.query.accountType,
      account: ctx.query.account,
    })

    const capabilities = await WorkspaceService.listCapabilities(workspaceId, accountType, account)

    const body: Array<
      IWorkspaceCapabilityView & { account: HexAddress; accountType: string; accountRef: string | null }
    > = capabilities.map(capability => ({
      account: capability.account,
      accountType: capability.accountType,
      accountRef: capability.accountRef,
      target: capability.target,
      selector: capability.selector,
      functionName: capability.functionName,
      viaRole: capability.viaRole,
      roleName: capability.roleName,
    }))

    ctx.body = body
  },

  router(): Router {
    const router = new Router()

    // Mounted under /workspace by the main router, so these are relative.
    router.post('/', WorkspaceRouter.create)
    router.get('/', WorkspaceRouter.list)
    router.get('/:workspaceId', WorkspaceRouter.get)
    router.get('/:workspaceId/targets', WorkspaceRouter.targets)
    router.get('/:workspaceId/capabilities', WorkspaceRouter.capabilities)

    return router
  },
}

export default WorkspaceRouter
