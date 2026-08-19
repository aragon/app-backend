import { assertExposable } from '@errors'
import logger from '@logger'
import { ErrorKeyEnum, type HexAddress } from '@types'
import { WorkspaceModels } from '@workspace/models'
import {
  type IWorkspaceAccountType,
  type IWorkspaceCreateParams,
  IWorkspaceStatus,
  IWorkspaceTargetStatus,
} from '@workspace/types/workspace'
import { randomUUID } from 'crypto'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'workspace:WorkspaceService' })

const WorkspaceService = {
  /**
   * Persists a workspace and its targets, then hands back immediately. Scanning
   * is slow — an explorer lookup and up to MAX_PROBES eth_calls per target — so
   * the caller polls `get` rather than waiting.
   */
  create: async (params: IWorkspaceCreateParams) => {
    const { name, network } = params
    // Checksummed once here so every downstream $match and id is consistent.
    const targets = [...new Set(params.targets.map(target => getAddress(target) as HexAddress))]
    const creator = getAddress(params.creator) as HexAddress

    const existing = await WorkspaceModels.Workspace.findOne({ name })
    assertExposable(!existing, ErrorKeyEnum.alreadyExists)

    const id = randomUUID()

    const workspace = await WorkspaceModels.Workspace.create({
      id,
      name,
      creator,
      network,
      targets,
      status: IWorkspaceStatus.pending,
    })

    await WorkspaceModels.WorkspaceTarget.insertMany(
      targets.map(address => ({
        id: `${id}-${address}`,
        workspaceId: id,
        address,
        network,
        status: IWorkspaceTargetStatus.pending,
      })),
    )

    logger.info('Workspace created', llo({ workspaceId: id, creator, network, targets: targets.length }))

    return workspace
  },

  /** A creator's workspaces, newest first. `name` narrows it to the one. */
  listByCreator: async (creator: HexAddress, name?: string) =>
    WorkspaceModels.Workspace.find({
      creator: getAddress(creator) as HexAddress,
      ...(name ? { name } : {}),
    }).sort({ createdAt: -1 }),

  get: async (workspaceId: string) => {
    const workspace = await WorkspaceModels.Workspace.findOne({ id: workspaceId })
    assertExposable(!!workspace, ErrorKeyEnum.notFound)

    const [targets, capabilities] = await Promise.all([
      WorkspaceModels.WorkspaceTarget.find({ workspaceId }).sort({ address: 1 }),
      WorkspaceModels.WorkspaceCapability.find({ workspaceId }).sort({ account: 1, target: 1, selector: 1 }),
    ])

    // assertExposable throws above, but it is not an assertion signature so it
    // does not narrow the type for the caller.
    return { workspace: workspace!, targets, capabilities }
  },

  listTargets: async (workspaceId: string) => {
    const workspace = await WorkspaceModels.Workspace.findOne({ id: workspaceId })
    assertExposable(!!workspace, ErrorKeyEnum.notFound)

    return WorkspaceModels.WorkspaceTarget.find({ workspaceId }).sort({ address: 1 })
  },

  /**
   * The workspace's answer: who can call what.
   *
   * `accountType` narrows it to the first integration's question — pass
   * 'dao' or 'safe' to get only the accounts we already know about.
   */
  listCapabilities: async (workspaceId: string, accountType?: IWorkspaceAccountType) => {
    const workspace = await WorkspaceModels.Workspace.findOne({ id: workspaceId })
    assertExposable(!!workspace, ErrorKeyEnum.notFound)

    return WorkspaceModels.WorkspaceCapability.find({
      workspaceId,
      ...(accountType ? { accountType } : {}),
    }).sort({ account: 1, target: 1, selector: 1 })
  },
}

export default WorkspaceService
