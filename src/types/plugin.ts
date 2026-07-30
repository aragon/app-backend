export interface IVotingEscrowInfo {
  proxy: boolean
  implementationAddress: string | null
  status: boolean
}

export interface IPluginInfo {
  type: IPluginInterfaceType
  proxy: boolean
  implementationAddress: string | null
  hasTarget: boolean
  isObjection?: boolean
}

export interface IMultiSigSettings {
  onlyListed: boolean
  minApprovals: bigint
}

export enum IPluginActionType {
  preInstall = 'pre-install',
  installed = 'installed',
  updated = 'updated',
  uninstalled = 'uninstalled',
}

export enum IPluginRawStatus {
  install = 'install',
  update = 'update',
  uninstall = 'uninstall',
}

export enum IPluginStatus {
  preInstall = 'preInstall',
  installed = 'installed',
  deprecated = 'deprecated',
  uninstalled = 'uninstalled',
  abandoned = 'abandoned',
}

export enum IPluginSlug {
  locktovote = 'locktovote',
  tokenvoting = 'tokenvoting',
  multisig = 'multisig',
  admin = 'admin',
  gauge = 'gauge',
  spp = 'core',
  capitalDistributor = 'capitalDistributor',
  router = 'router',
  claimer = 'claimer',
  crossChainController = 'crosschain',
}

export enum IEventLogPluginSettings {
  MultisigSettingsUpdated = 'MultisigSettingsUpdated',
  VotingSettingsUpdated = 'VotingSettingsUpdated',
  StagesUpdated = 'StagesUpdated',
}

export enum IPluginInterfaceType {
  tokenVoting = 'tokenVoting',
  multisig = 'multisig',
  admin = 'admin',
  spp = 'spp',
  gauge = 'gauge',
  unknown = 'unknown',
  lockToVote = 'lockToVote',
  capitalDistributor = 'capitalDistributor',
  router = 'router',
  claimer = 'claimer',
  crossChainController = 'crossChainController',
}

/**
 * Events emitted by `CrossChainController` that mutate its stored configuration.
 * The message-lifecycle events (MessageForwarded/Received/...) are intentionally
 * NOT here: only configuration is persisted on the Setting document.
 */
export enum IEventLogCrossChainSettings {
  ConfigUpdated = 'ConfigUpdated',
  ExecutorUpdated = 'ExecutorUpdated',
  MinFailedMessageGasUpdated = 'MinFailedMessageGasUpdated',
}

export interface ISettingVotingEscrow {
  minDeposit: string
  minLockTime: number
  cooldown: number
  maxTime: number
  slope: string
  bias: string
  feePercent: string
  minFeePercent: string
  minCooldown: number
}

export enum ISettingStatus {
  active = 'active',
  inactive = 'inactive',
}

export enum IMetadataType {
  plugin = 'plugin',
  dao = 'dao',
}

export enum IReportResultType {
  None,
  Approval,
  Veto,
}

export enum VotingBodyBrandIdentity {
  EOA = 'eoa',
  SAFE = 'safe',
  OTHER = 'other',
}

export enum IMetadataTargetField {
  daoAddress = 'daoAddress',
  pluginAddress = 'pluginAddress',
}
