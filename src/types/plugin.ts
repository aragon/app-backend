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

export enum ISettingStatus {
  active = 'active',
  inactive = 'inactive',
}
