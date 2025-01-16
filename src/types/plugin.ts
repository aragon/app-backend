export interface IPluginInfo {
  type: IPluginInterfaceType
  proxy: boolean
  implementationAddress: string | null
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
