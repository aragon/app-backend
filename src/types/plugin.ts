export interface IPluginInfo {
  type: IPluginInterfaceType
  proxy: boolean
  implementationAddress: string | null
}

export enum IPluginProposalType {
  Approval = 'Approval',
  Veto = 'Veto',
}

export enum IPluginSubdomain {
  multisig = 'multisig',
  token = 'token-voting',
  address = 'address-list-voting',
  admin = 'admin',
  // subdaoPlugin = 'pattern-subdao-plugin',
}

export enum IPluginRawStatus {
  install = 'install',
  update = 'update',
  uninstall = 'uninstall',
}

export enum IPluginStatus {
  installed = 'installed',
  deprecated = 'deprecated',
  uninstalled = 'uninstalled',
}

export enum IPluginInterfaceType {
  tokenVoting = 'tokenVoting',
  multisig = 'multisig',
  spp = 'spp',
  unknown = 'unknown',
}

export enum ISettingStatus {
  active = 'active',
  inactive = 'inactive',
}
