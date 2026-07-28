import type { HexAddress } from './networks'

export enum IPermission {
  EXECUTE_PROPOSAL_PERMISSION = 'EXECUTE_PROPOSAL_PERMISSION',
  EXECUTE_PERMISSION = 'EXECUTE_PERMISSION',
  MINT_PERMISSION = 'MINT_PERMISSION',
  CREATE_PROPOSAL_PERMISSION = 'CREATE_PROPOSAL_PERMISSION',
  PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID = 'PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID',
  SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID = 'SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID',
}

export type PermissionEntityLayer =
  | 'dao'
  | 'topLevelPlugin'
  | 'processInternal'
  | 'condition'
  | 'externalActor'
  | 'historicalPlugin'
  | 'contract'
  | 'unknown'

export interface IPermissionEntityRef {
  address: HexAddress
  layer: PermissionEntityLayer
  label?: string
  interfaceType?: string
  status?: 'installed' | 'uninstalled' | 'historical' | 'unknown'
  parentPluginAddress?: HexAddress
  parentPluginName?: string
  parentInterfaceType?: string
  stageIndex?: number
  role?: 'who' | 'where' | 'condition'
  avatarSrc?: string
}
