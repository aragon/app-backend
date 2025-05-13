export interface IPluginInfo {
  type: IPluginInterfaceType
  proxy: boolean
  implementationAddress: string | null
  hasTarget: boolean
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
}

export enum IPluginSlug {
  tokenvoting = 'tokenvoting',
  multisig = 'multisig',
  admin = 'admin',
  gauge = 'gauge',
  spp = 'core',
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
