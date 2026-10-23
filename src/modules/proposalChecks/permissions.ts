import { Models } from '@dbModels'
import KnownAbi from '@modules/proposalChecks/abi'
import {
  type HexAddress,
  type IAssessmentFlatAction,
  IEventLogPermission,
  type IPermissionGrant,
  type IPermissionTable,
  type NetworksEnum,
} from '@types'
import { getAddress, id as keccakId } from 'ethers'

export const ANY_ADDR = getAddress('0xffffffffffffffffffffffffffffffffffffffff')

/** Permission names OSx and its plugins use; the id is keccak of the name. */
export const PERMISSION_NAMES = [
  'ROOT_PERMISSION',
  'EXECUTE_PERMISSION',
  'UPGRADE_DAO_PERMISSION',
  'SET_METADATA_PERMISSION',
  'SET_TRUSTED_FORWARDER_PERMISSION',
  'SET_SIGNATURE_VALIDATOR_PERMISSION',
  'REGISTER_STANDARD_CALLBACK_PERMISSION',
  'VALIDATE_SIGNATURE_PERMISSION',
  'EXECUTE_PROPOSAL_PERMISSION',
  'CREATE_PROPOSAL_PERMISSION',
  'MINT_PERMISSION',
  'UPGRADE_PLUGIN_PERMISSION',
  'UPDATE_VOTING_SETTINGS_PERMISSION',
  'UPDATE_MULTISIG_SETTINGS_PERMISSION',
  'UPDATE_ADDRESSES_PERMISSION',
  'UPDATE_STAGES_PERMISSION',
  'UPDATE_RULES_PERMISSION',
  'SET_TARGET_CONFIG_PERMISSION',
  'CANCEL_PERMISSION',
  'EDIT_PERMISSION',
  'ADVANCE_PERMISSION',
  'APPLY_INSTALLATION_PERMISSION',
  'APPLY_UPDATE_PERMISSION',
  'APPLY_UNINSTALLATION_PERMISSION',
] as const

const idsByName = new Map<string, string>(PERMISSION_NAMES.map(name => [name, keccakId(name).toLowerCase()]))
const namesById = new Map<string, string>([...idsByName].map(([name, id]) => [id, name]))

/** Permissions that let the holder control the DAO, execute, change governance, upgrade or mint. */
export const POWERFUL_PERMISSIONS = new Set(
  [
    'ROOT_PERMISSION',
    'EXECUTE_PERMISSION',
    'UPGRADE_DAO_PERMISSION',
    'UPGRADE_PLUGIN_PERMISSION',
    'MINT_PERMISSION',
    'EXECUTE_PROPOSAL_PERMISSION',
    'UPDATE_VOTING_SETTINGS_PERMISSION',
    'UPDATE_MULTISIG_SETTINGS_PERMISSION',
    'UPDATE_ADDRESSES_PERMISSION',
    'UPDATE_STAGES_PERMISSION',
    'UPDATE_RULES_PERMISSION',
    'SET_TARGET_CONFIG_PERMISSION',
    'APPLY_INSTALLATION_PERMISSION',
    'APPLY_UPDATE_PERMISSION',
    'APPLY_UNINSTALLATION_PERMISSION',
    'CANCEL_PERMISSION',
    'EDIT_PERMISSION',
    'ADVANCE_PERMISSION',
  ].map(name => keccakId(name).toLowerCase()),
)

const PERMISSION_NAMES_OF_CALLS = new Set([
  'grant',
  'grantWithCondition',
  'revoke',
  'applySingleTargetPermissions',
  'applyMultiTargetPermissions',
])

/** One grant or revoke the proposal asks for, in execution order. */
export interface IPermissionOp {
  path: string
  op: 'grant' | 'revoke'
  where: string
  who: string
  permissionId: string
  condition: string | null
}

/**
 * The DAO's permission table and the changes a proposal makes to it. The table is folded from
 * the indexed Granted/Revoked events up to the evidence block; the changes are decoded from the
 * calls the proposal makes on the DAO itself, in order, with batch calls expanded.
 */
const PermissionState = {
  key(where: string, who: string, permissionId: string): string {
    return `${where.toLowerCase()}|${who.toLowerCase()}|${permissionId.toLowerCase()}`
  },

  idOf(name: string): string {
    return idsByName.get(name) ?? ''
  },

  nameOf(permissionId: string): string {
    return namesById.get(permissionId.toLowerCase()) ?? permissionId
  },

  async load(daoAddress: HexAddress, network: NetworksEnum, block: number): Promise<IPermissionTable> {
    const events = await Models.DaoPermission.find(
      { daoAddress, network, blockNumber: { $lte: block } },
      {
        event: 1,
        whereAddress: 1,
        whoAddress: 1,
        permissionId: 1,
        conditionAddress: 1,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
      },
      { sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 } },
    )
    const grants: Record<string, IPermissionGrant> = {}
    for (const event of events) {
      const key = PermissionState.key(event.whereAddress, event.whoAddress, event.permissionId)
      if (event.event === IEventLogPermission.Granted) {
        grants[key] = {
          where: event.whereAddress,
          who: event.whoAddress,
          permissionId: event.permissionId,
          condition: event.conditionAddress ?? null,
        }
      } else if (event.event === IEventLogPermission.Revoked) {
        delete grants[key]
      }
    }
    return { available: events.length > 0, grants }
  },

  isPermissionCall(action: IAssessmentFlatAction): boolean {
    return !!action.decoded && action.abi?.source === 'builtin' && PERMISSION_NAMES_OF_CALLS.has(action.decoded.name)
  },

  /** The grants and revokes an action asks for; the DAO's own condition-less grant sets condition null. */
  opsOf(action: IAssessmentFlatAction): IPermissionOp[] {
    const parsed = KnownAbi.parse(action.data)
    if (!parsed || !PERMISSION_NAMES_OF_CALLS.has(parsed.name)) return []
    const a = parsed.args
    const at = (n: number) => (n === 0 ? action.path : `${action.path}#${n}`)
    switch (parsed.name) {
      case 'grant':
        return [{ path: at(0), op: 'grant', where: a.where, who: a.who, permissionId: a.permissionId, condition: null }]
      case 'grantWithCondition':
        return [
          {
            path: at(0),
            op: 'grant',
            where: a.where,
            who: a.who,
            permissionId: a.permissionId,
            condition: a.condition,
          },
        ]
      case 'revoke':
        return [
          { path: at(0), op: 'revoke', where: a.where, who: a.who, permissionId: a.permissionId, condition: null },
        ]
      case 'applySingleTargetPermissions':
        return [...a.items].map((item: any, n: number) => ({
          path: at(n),
          op: Number(item.operation) === 1 ? 'revoke' : 'grant',
          where: a.where,
          who: item.who,
          permissionId: item.permissionId,
          condition: null,
        }))
      case 'applyMultiTargetPermissions':
        return [...a.items].map((item: any, n: number) => ({
          path: at(n),
          op: Number(item.operation) === 1 ? 'revoke' : 'grant',
          where: item.where,
          who: item.who,
          permissionId: item.permissionId,
          condition: Number(item.operation) === 2 && item.condition !== ANY_ADDR ? item.condition : null,
        }))
      default:
        return []
    }
  },
}

export default PermissionState
