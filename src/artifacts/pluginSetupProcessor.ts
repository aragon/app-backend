export const PluginSetupProcessor = {
  _format: 'hh-sol-artifact-1',
  contractName: 'PluginSetupProcessor',
  sourceName: 'src/framework/plugin/setup/PluginSetupProcessor.sol',
  abi: [
    {
      inputs: [
        {
          internalType: 'contract PluginRepoRegistry',
          name: '_repoRegistry',
          type: 'address',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
      ],
      name: 'IPluginNotSupported',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'currentAppliedSetupId',
          type: 'bytes32',
        },
        {
          internalType: 'bytes32',
          name: 'appliedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'InvalidAppliedSetupId',
      type: 'error',
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: 'uint8',
              name: 'release',
              type: 'uint8',
            },
            {
              internalType: 'uint16',
              name: 'build',
              type: 'uint16',
            },
          ],
          internalType: 'struct PluginRepo.Tag',
          name: 'currentVersionTag',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'uint8',
              name: 'release',
              type: 'uint8',
            },
            {
              internalType: 'uint16',
              name: 'build',
              type: 'uint16',
            },
          ],
          internalType: 'struct PluginRepo.Tag',
          name: 'newVersionTag',
          type: 'tuple',
        },
      ],
      name: 'InvalidUpdateVersion',
      type: 'error',
    },
    {
      inputs: [],
      name: 'PluginAlreadyInstalled',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
      ],
      name: 'PluginNonupgradeable',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'proxy',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'implementation',
          type: 'address',
        },
        {
          internalType: 'bytes',
          name: 'initData',
          type: 'bytes',
        },
      ],
      name: 'PluginProxyUpgradeFailed',
      type: 'error',
    },
    {
      inputs: [],
      name: 'PluginRepoNonexistent',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'SetupAlreadyPrepared',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'caller',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: 'permissionId',
          type: 'bytes32',
        },
      ],
      name: 'SetupApplicationUnauthorized',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'SetupNotApplicable',
      type: 'error',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'appliedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'InstallationApplied',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
        {
          indexed: true,
          internalType: 'contract PluginRepo',
          name: 'pluginSetupRepo',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'uint8',
              name: 'release',
              type: 'uint8',
            },
            {
              internalType: 'uint16',
              name: 'build',
              type: 'uint16',
            },
          ],
          indexed: false,
          internalType: 'struct PluginRepo.Tag',
          name: 'versionTag',
          type: 'tuple',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'data',
          type: 'bytes',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'address[]',
              name: 'helpers',
              type: 'address[]',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
          ],
          indexed: false,
          internalType: 'struct IPluginSetup.PreparedSetupData',
          name: 'preparedSetupData',
          type: 'tuple',
        },
      ],
      name: 'InstallationPrepared',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'UninstallationApplied',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
        {
          indexed: true,
          internalType: 'contract PluginRepo',
          name: 'pluginSetupRepo',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'uint8',
              name: 'release',
              type: 'uint8',
            },
            {
              internalType: 'uint16',
              name: 'build',
              type: 'uint16',
            },
          ],
          indexed: false,
          internalType: 'struct PluginRepo.Tag',
          name: 'versionTag',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'plugin',
              type: 'address',
            },
            {
              internalType: 'address[]',
              name: 'currentHelpers',
              type: 'address[]',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          indexed: false,
          internalType: 'struct IPluginSetup.SetupPayload',
          name: 'setupPayload',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'enum PermissionLib.Operation',
              name: 'operation',
              type: 'uint8',
            },
            {
              internalType: 'address',
              name: 'where',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'who',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'condition',
              type: 'address',
            },
            {
              internalType: 'bytes32',
              name: 'permissionId',
              type: 'bytes32',
            },
          ],
          indexed: false,
          internalType: 'struct PermissionLib.MultiTargetPermission[]',
          name: 'permissions',
          type: 'tuple[]',
        },
      ],
      name: 'UninstallationPrepared',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'appliedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'UpdateApplied',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'dao',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
        {
          indexed: true,
          internalType: 'contract PluginRepo',
          name: 'pluginSetupRepo',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'uint8',
              name: 'release',
              type: 'uint8',
            },
            {
              internalType: 'uint16',
              name: 'build',
              type: 'uint16',
            },
          ],
          indexed: false,
          internalType: 'struct PluginRepo.Tag',
          name: 'versionTag',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'plugin',
              type: 'address',
            },
            {
              internalType: 'address[]',
              name: 'currentHelpers',
              type: 'address[]',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          indexed: false,
          internalType: 'struct IPluginSetup.SetupPayload',
          name: 'setupPayload',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'address[]',
              name: 'helpers',
              type: 'address[]',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
          ],
          indexed: false,
          internalType: 'struct IPluginSetup.PreparedSetupData',
          name: 'preparedSetupData',
          type: 'tuple',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'initData',
          type: 'bytes',
        },
      ],
      name: 'UpdatePrepared',
      type: 'event',
    },
    {
      inputs: [],
      name: 'APPLY_INSTALLATION_PERMISSION_ID',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'APPLY_UNINSTALLATION_PERMISSION_ID',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'APPLY_UPDATE_PERMISSION_ID',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              components: [
                {
                  components: [
                    {
                      internalType: 'uint8',
                      name: 'release',
                      type: 'uint8',
                    },
                    {
                      internalType: 'uint16',
                      name: 'build',
                      type: 'uint16',
                    },
                  ],
                  internalType: 'struct PluginRepo.Tag',
                  name: 'versionTag',
                  type: 'tuple',
                },
                {
                  internalType: 'contract PluginRepo',
                  name: 'pluginSetupRepo',
                  type: 'address',
                },
              ],
              internalType: 'struct PluginSetupRef',
              name: 'pluginSetupRef',
              type: 'tuple',
            },
            {
              internalType: 'address',
              name: 'plugin',
              type: 'address',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
            {
              internalType: 'bytes32',
              name: 'helpersHash',
              type: 'bytes32',
            },
          ],
          internalType: 'struct PluginSetupProcessor.ApplyInstallationParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'applyInstallation',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'plugin',
              type: 'address',
            },
            {
              components: [
                {
                  components: [
                    {
                      internalType: 'uint8',
                      name: 'release',
                      type: 'uint8',
                    },
                    {
                      internalType: 'uint16',
                      name: 'build',
                      type: 'uint16',
                    },
                  ],
                  internalType: 'struct PluginRepo.Tag',
                  name: 'versionTag',
                  type: 'tuple',
                },
                {
                  internalType: 'contract PluginRepo',
                  name: 'pluginSetupRepo',
                  type: 'address',
                },
              ],
              internalType: 'struct PluginSetupRef',
              name: 'pluginSetupRef',
              type: 'tuple',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
          ],
          internalType: 'struct PluginSetupProcessor.ApplyUninstallationParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'applyUninstallation',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'plugin',
              type: 'address',
            },
            {
              components: [
                {
                  components: [
                    {
                      internalType: 'uint8',
                      name: 'release',
                      type: 'uint8',
                    },
                    {
                      internalType: 'uint16',
                      name: 'build',
                      type: 'uint16',
                    },
                  ],
                  internalType: 'struct PluginRepo.Tag',
                  name: 'versionTag',
                  type: 'tuple',
                },
                {
                  internalType: 'contract PluginRepo',
                  name: 'pluginSetupRepo',
                  type: 'address',
                },
              ],
              internalType: 'struct PluginSetupRef',
              name: 'pluginSetupRef',
              type: 'tuple',
            },
            {
              internalType: 'bytes',
              name: 'initData',
              type: 'bytes',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
            {
              internalType: 'bytes32',
              name: 'helpersHash',
              type: 'bytes32',
            },
          ],
          internalType: 'struct PluginSetupProcessor.ApplyUpdateParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'applyUpdate',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              components: [
                {
                  components: [
                    {
                      internalType: 'uint8',
                      name: 'release',
                      type: 'uint8',
                    },
                    {
                      internalType: 'uint16',
                      name: 'build',
                      type: 'uint16',
                    },
                  ],
                  internalType: 'struct PluginRepo.Tag',
                  name: 'versionTag',
                  type: 'tuple',
                },
                {
                  internalType: 'contract PluginRepo',
                  name: 'pluginSetupRepo',
                  type: 'address',
                },
              ],
              internalType: 'struct PluginSetupRef',
              name: 'pluginSetupRef',
              type: 'tuple',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          internalType: 'struct PluginSetupProcessor.PrepareInstallationParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'prepareInstallation',
      outputs: [
        {
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'address[]',
              name: 'helpers',
              type: 'address[]',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
          ],
          internalType: 'struct IPluginSetup.PreparedSetupData',
          name: 'preparedSetupData',
          type: 'tuple',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              components: [
                {
                  components: [
                    {
                      internalType: 'uint8',
                      name: 'release',
                      type: 'uint8',
                    },
                    {
                      internalType: 'uint16',
                      name: 'build',
                      type: 'uint16',
                    },
                  ],
                  internalType: 'struct PluginRepo.Tag',
                  name: 'versionTag',
                  type: 'tuple',
                },
                {
                  internalType: 'contract PluginRepo',
                  name: 'pluginSetupRepo',
                  type: 'address',
                },
              ],
              internalType: 'struct PluginSetupRef',
              name: 'pluginSetupRef',
              type: 'tuple',
            },
            {
              components: [
                {
                  internalType: 'address',
                  name: 'plugin',
                  type: 'address',
                },
                {
                  internalType: 'address[]',
                  name: 'currentHelpers',
                  type: 'address[]',
                },
                {
                  internalType: 'bytes',
                  name: 'data',
                  type: 'bytes',
                },
              ],
              internalType: 'struct IPluginSetup.SetupPayload',
              name: 'setupPayload',
              type: 'tuple',
            },
          ],
          internalType: 'struct PluginSetupProcessor.PrepareUninstallationParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'prepareUninstallation',
      outputs: [
        {
          components: [
            {
              internalType: 'enum PermissionLib.Operation',
              name: 'operation',
              type: 'uint8',
            },
            {
              internalType: 'address',
              name: 'where',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'who',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'condition',
              type: 'address',
            },
            {
              internalType: 'bytes32',
              name: 'permissionId',
              type: 'bytes32',
            },
          ],
          internalType: 'struct PermissionLib.MultiTargetPermission[]',
          name: 'permissions',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              components: [
                {
                  internalType: 'uint8',
                  name: 'release',
                  type: 'uint8',
                },
                {
                  internalType: 'uint16',
                  name: 'build',
                  type: 'uint16',
                },
              ],
              internalType: 'struct PluginRepo.Tag',
              name: 'currentVersionTag',
              type: 'tuple',
            },
            {
              components: [
                {
                  internalType: 'uint8',
                  name: 'release',
                  type: 'uint8',
                },
                {
                  internalType: 'uint16',
                  name: 'build',
                  type: 'uint16',
                },
              ],
              internalType: 'struct PluginRepo.Tag',
              name: 'newVersionTag',
              type: 'tuple',
            },
            {
              internalType: 'contract PluginRepo',
              name: 'pluginSetupRepo',
              type: 'address',
            },
            {
              components: [
                {
                  internalType: 'address',
                  name: 'plugin',
                  type: 'address',
                },
                {
                  internalType: 'address[]',
                  name: 'currentHelpers',
                  type: 'address[]',
                },
                {
                  internalType: 'bytes',
                  name: 'data',
                  type: 'bytes',
                },
              ],
              internalType: 'struct IPluginSetup.SetupPayload',
              name: 'setupPayload',
              type: 'tuple',
            },
          ],
          internalType: 'struct PluginSetupProcessor.PrepareUpdateParams',
          name: '_params',
          type: 'tuple',
        },
      ],
      name: 'prepareUpdate',
      outputs: [
        {
          internalType: 'bytes',
          name: 'initData',
          type: 'bytes',
        },
        {
          components: [
            {
              internalType: 'address[]',
              name: 'helpers',
              type: 'address[]',
            },
            {
              components: [
                {
                  internalType: 'enum PermissionLib.Operation',
                  name: 'operation',
                  type: 'uint8',
                },
                {
                  internalType: 'address',
                  name: 'where',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'who',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'condition',
                  type: 'address',
                },
                {
                  internalType: 'bytes32',
                  name: 'permissionId',
                  type: 'bytes32',
                },
              ],
              internalType: 'struct PermissionLib.MultiTargetPermission[]',
              name: 'permissions',
              type: 'tuple[]',
            },
          ],
          internalType: 'struct IPluginSetup.PreparedSetupData',
          name: 'preparedSetupData',
          type: 'tuple',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'protocolVersion',
      outputs: [
        {
          internalType: 'uint8[3]',
          name: '',
          type: 'uint8[3]',
        },
      ],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [],
      name: 'repoRegistry',
      outputs: [
        {
          internalType: 'contract PluginRepoRegistry',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      name: 'states',
      outputs: [
        {
          internalType: 'uint256',
          name: 'blockNumber',
          type: 'uint256',
        },
        {
          internalType: 'bytes32',
          name: 'currentAppliedSetupId',
          type: 'bytes32',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'pluginInstallationId',
          type: 'bytes32',
        },
        {
          internalType: 'bytes32',
          name: 'preparedSetupId',
          type: 'bytes32',
        },
      ],
      name: 'validatePreparedSetupId',
      outputs: [],
      stateMutability: 'view',
      type: 'function',
    },
  ],
  bytecode:
    '0x60806040523480156200001157600080fd5b5060405162002ffc38038062002ffc83398101604081905262000034916200005a565b600180546001600160a01b0319166001600160a01b03929092169190911790556200008c565b6000602082840312156200006d57600080fd5b81516001600160a01b03811681146200008557600080fd5b9392505050565b612f60806200009c6000396000f3fe608060405234801561001057600080fd5b50600436106100df5760003560e01c8063851d11f81161008c578063d759812211610066578063d759812214610219578063fafc79da1461023a578063fbdc1ef11461024d578063fe6c34741461028957600080fd5b8063851d11f8146101b85780639665861a146101cb578063ca211f7f146101f257600080fd5b80633c8c01d1116100bd5780633c8c01d114610137578063483d209e14610158578063747e5ec11461018357600080fd5b806322e12c63146100e45780632ae9c600146100f95780632fb0433614610117575b600080fd5b6100f76100f2366004611dc5565b61029c565b005b6101016106be565b60405161010e9190611e1c565b60405180910390f35b61012a610125366004611e68565b6106e8565b60405161010e9190611f87565b61014a610145366004611e68565b6109ff565b60405161010e92919061202d565b60015461016b906001600160a01b031681565b6040516001600160a01b03909116815260200161010e565b6101aa7ff796b89427c6552c1ac705d833bfb7909f8eb5ce502c1db97f85fabc6ad8354881565b60405190815260200161010e565b6100f76101c6366004612057565b610d40565b6101aa7fb03cf3d518f6d49560b7f5bece1ccb8fd50ea7370f02f5e5210edba04be3c4f781565b6101aa7fbd4dbacf5ba6d9793f600403b3293d6ecd695fcc703a2b5edcf245f45fda6cfa81565b61022c6102273660046120b5565b610efd565b60405161010e92919061214b565b6100f7610248366004612179565b611587565b61027461025b36600461219b565b6000602081905290815260409020805460019091015482565b6040805192835260208301919091520161010e565b6100f76102973660046120b5565b6115e5565b817fb03cf3d518f6d49560b7f5bece1ccb8fd50ea7370f02f5e5210edba04be3c4f76102c88282611827565b60006102e0856102db60208701876121b4565b611927565b60008181526020818152604082209293506103bc90610307903689900389019089016122fb565b61036d61031760a08a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b828210156103635761035460a08302860136819003810190612395565b81526020019060010190610337565b505050505061196a565b60c089013561037f60808b018b612426565b8080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152506002925061199a915050565b90506103c88382611587565b60006103e96103df36899003890160208a016122fb565b8860c001356119e2565b43845560018401819055905060006104076080890160608a016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e909906104389060208c019060040161249a565b600060405180830381865afa158015610455573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261047d9190810190612520565b9050600061048e60208a018a6121b4565b6001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156104cb573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104ef91906125ea565b9050600082602001516001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa158015610535573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061055991906125ea565b9050806001600160a01b0316826001600160a01b0316146105cc576105cc61058460208c018c6121b4565b8261059260808e018e612426565b8080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250611a2992505050565b60006105db60a08c018c61233f565b9050111561064f576001600160a01b038b1663e978afe56105ff60a08d018d61233f565b6040518363ffffffff1660e01b815260040161061c929190612607565b600060405180830381600087803b15801561063657600080fd5b505af115801561064a573d6000803e3d6000fd5b505050505b61065c60208b018b6121b4565b6001600160a01b03168b6001600160a01b03167f24565610ddf61ee73e8501d7f0454657c71f5944882f5c586d7246bf43e13cda87876040516106a9929190918252602082015260400190565b60405180910390a35050505050505050505050565b6106c6611d8f565b5060408051606081018252600181526004602082015260009181019190915290565b6060600061070a846106fc858501866126aa565b6102db9060208101906121b4565b600081815260208190526040812091925061078761072d368790038701876122fb565b61078261073d60608901896126aa565b61074b9060208101906126e8565b80806020026020016040519081016040528093929190818152602001838360200280828437600092019190915250611bb292505050565b6119e2565b9050808260010154146107db5760018201546040517f73a4eaa00000000000000000000000000000000000000000000000000000000081526004810191909152602481018290526044015b60405180910390fd5b60006107ed60608701604088016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e9099061081b90899060040161249a565b600060405180830381865afa158015610838573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526108609190810190612520565b60208101519091506001600160a01b0316639cb0a1248861088460608a018a6126aa565b6040518363ffffffff1660e01b81526004016108a1929190612876565b6000604051808303816000875af11580156108c0573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526108e89190810190612995565b9450600061093f6108fe368990038901896122fb565b6109078861196a565b6040805160208101909152600081527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e56390600361199a565b60008181526002860160205260409020548554919250111561097757604051630559b4b760e31b8152600481018290526024016107d2565b60008181526002850160205260409081902043905561099c90606089019089016121b4565b6001600160a01b03908116908916337f5fdcd271ff15db84cbc94365956df5504f6d756e111654144648433c11a44530848b6109db60608201826126aa565b8c6040516109ec94939291906129ca565b60405180910390a4505050505092915050565b6000610a1e604051806040016040528060608152602001606081525090565b6000610a3060608501604086016121b4565b6001546040517ff29ee1250000000000000000000000000000000000000000000000000000000081526001600160a01b03808416600483015292935091169063f29ee12590602401602060405180830381865afa158015610a95573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610ab99190612a02565b610aef576040517f0d4feab400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604051639af3e90960e01b81526000906001600160a01b03831690639af3e90990610b1e90889060040161249a565b600060405180830381865afa158015610b3b573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f19168201604052610b639190810190612520565b60208101519091506001600160a01b031663f10832f187610b876060890189612426565b6040518463ffffffff1660e01b8152600401610ba593929190612a24565b6000604051808303816000875af1158015610bc4573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f19168201604052610bec9190810190612b26565b90945092506000610bfd8786611927565b90506000610c42610c13368990038901896122fb565b610c20876020015161196a565b8751610c2b90611bb2565b60405180602001604052806000815250600161199a565b600083815260208190526040902060018101549192509015610c90576040517fd2e44eb600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600082815260028201602052604090205481541015610cc557604051630559b4b760e31b8152600481018390526024016107d2565b600082815260028201602052604090204390556001600160a01b03808616908a16337f8ea69cee01fd9fc24e6b9614ea0896c5a1eac8fd8aba383285248cd0e1d8503a858c610d176060820182612426565b8e8e604051610d2b96959493929190612b6d565b60405180910390a450505050505b9250929050565b817fbd4dbacf5ba6d9793f600403b3293d6ecd695fcc703a2b5edcf245f45fda6cfa610d6c8282611827565b6000610d7f856102db60208701876121b4565b6000818152602081815260408220929350610e0290610da6903689900389019089016122fb565b610907610db660808a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b8282101561036357610df360a08302860136819003810190612395565b81526020019060010190610dd6565b9050610e0e8382611587565b438255600060018301819055610e27608088018861233f565b90501115610e9b576001600160a01b03871663e978afe5610e4b608089018961233f565b6040518363ffffffff1660e01b8152600401610e68929190612607565b600060405180830381600087803b158015610e8257600080fd5b505af1158015610e96573d6000803e3d6000fd5b505050505b610ea860208701876121b4565b6001600160a01b0316876001600160a01b03167fa0e5d4ce6420a0e7a5f0ac10c47b3a672fb661c11f5609bb21b68644d81e17aa83604051610eec91815260200190565b60405180910390a350505050505050565b6060610f1c604051806040016040528060608152602001606081525090565b610f2c6060840160408501612bb5565b60ff16610f3c6020850185612bb5565b60ff16141580610f725750610f576080840160608501612bd2565b61ffff16610f6b6040850160208601612bd2565b61ffff1610155b15610fb057604080517f80d4e9070000000000000000000000000000000000000000000000000000000081526107d291859190820190600401612bef565b6000610fc3856106fc60a08701876126aa565b6000818152602081905260408120919250610fe461073d60a08801886126aa565b9050600061103060405180604001604052808960000180360381019061100a9190612c0a565b815260200161101f60a08b0160808c016121b4565b6001600160a01b03169052836119e2565b90508083600101541461107f5760018301546040517f73a4eaa00000000000000000000000000000000000000000000000000000000081526004810191909152602481018290526044016107d2565b600061109160a0890160808a016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e909906110bf908b9060040161249a565b600060405180830381865afa1580156110dc573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526111049190810190612520565b9050600061111860a08a0160808b016121b4565b6001600160a01b0316639af3e9098a6040016040518263ffffffff1660e01b8152600401611146919061249a565b600060405180830381865afa158015611163573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261118b9190810190612520565b9050600081602001516001600160a01b031683602001516001600160a01b0316036112825761122c60405180604001604052808c6040018036038101906111d29190612c0a565b81526020016111e760a08e0160808f016121b4565b6001600160a01b031690526040805160208101909152600081527f569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd908890600261199a565b905061123b60a08b018b6126aa565b6112499060208101906126e8565b80806020026020016040519081016040528093929190818152602001838360200280828437600092019190915250505090895250611524565b6112d07f41de6830000000000000000000000000000000000000000000000000000000006112b360a08d018d6126aa565b6112c19060208101906121b4565b6001600160a01b031690611bc5565b61132d576112e160a08b018b6126aa565b6112ef9060208101906121b4565b6040517f8174ff550000000000000000000000000000000000000000000000000000000081526001600160a01b0390911660048201526024016107d2565b600061133c60a08c018c6126aa565b61134a9060208101906121b4565b6001600160a01b03166341de68306040518163ffffffff1660e01b8152600401602060405180830381865afa158015611387573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906113ab9190612c26565b60028111156113bc576113bc611eb8565b1461141a576113ce60a08b018b6126aa565b6113dc9060208101906121b4565b6040517fe4356c940000000000000000000000000000000000000000000000000000000081526001600160a01b0390911660048201526024016107d2565b81602001516001600160a01b031663a8a9c29e8c8c60000160200160208101906114449190612bd2565b61145160a08f018f6126aa565b6040518463ffffffff1660e01b815260040161146f93929190612c43565b6000604051808303816000875af115801561148e573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526114b69190810190612c6f565b809950819a50505061152160405180604001604052808c6040018036038101906114e09190612c0a565b81526020016114f560a08e0160808f016121b4565b6001600160a01b031681525061150e8a6020015161196a565b8a5161151990611bb2565b8c600261199a565b90505b60008181526002870160205260409020548654101561155957604051630559b4b760e31b8152600481018290526024016107d2565b600081815260028701602052604090204390556115798b828c8b8d611be8565b505050505050509250929050565b60008281526020818152604080832084845260028101909252909120548154106115e0576040517f59730ce6000000000000000000000000000000000000000000000000000000008152600481018390526024016107d2565b505050565b817ff796b89427c6552c1ac705d833bfb7909f8eb5ce502c1db97f85fabc6ad835486116118282611827565b6000611627856102db60808701606088016121b4565b60008181526020819052604081209192506116c261164a368890038801886122fb565b6116a661165a60808a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b828210156103635761169760a08302860136819003810190612395565b8152602001906001019061167a565b8860a0013560405180602001604052806000815250600161199a565b600183015490915015611701576040517fd2e44eb600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b61170b8382611587565b600061172961171f368990038901896122fb565b8860a001356119e2565b6001840181905543845590506000611744608089018961233f565b905011156117b8576001600160a01b03881663e978afe561176860808a018a61233f565b6040518363ffffffff1660e01b8152600401611785929190612607565b600060405180830381600087803b15801561179f57600080fd5b505af11580156117b3573d6000803e3d6000fd5b505050505b6117c860808801606089016121b4565b6001600160a01b0316886001600160a01b03167f74e616c7264536b98a5ec234d051ae6ce1305bf05c85f9ddc112364440ccf1298484604051611815929190918252602082015260400190565b60405180910390a35050505050505050565b336001600160a01b038316148015906118d45750604080516020810182526000815290517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0384169163fdef91069161189191309133918791600401612cc9565b602060405180830381865afa1580156118ae573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906118d29190612a02565b155b15611923576040517f15d68ee00000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152336024820152604481018290526064016107d2565b5050565b604080516001600160a01b0380851660208301528316918101919091526000906060015b6040516020818303038152906040528051906020012090505b92915050565b60008160405160200161197d9190611f87565b604051602081830303815290604052805190602001209050919050565b84516020808701518451858301206040516000946119c1949093928a928a92899101612d05565b60405160208183030381529060405280519060200120905095945050505050565b815160208084015160408051845160ff1681850152929093015161ffff16928201929092526001600160a01b0390911660608201526080810182905260009060a00161194b565b805115611b6b576040517f4f1ef2860000000000000000000000000000000000000000000000000000000081526001600160a01b03841690634f1ef28690611a779085908590600401612d60565b600060405180830381600087803b158015611a9157600080fd5b505af1925050508015611aa2575060015b6115e057611aae612d82565b806308c379a003611b015750611ac2612d9e565b80611acd5750611b03565b806040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107d29190612e46565b505b3d808015611b2d576040519150601f19603f3d011682016040523d82523d6000602084013e611b32565b606091505b508383836040517f96e9e31b0000000000000000000000000000000000000000000000000000000081526004016107d293929190612e59565b6040517f3659cfe60000000000000000000000000000000000000000000000000000000081526001600160a01b038381166004830152841690633659cfe690602401611a77565b60008160405160200161197d9190612e85565b6000611bd083611c5c565b8015611be15750611be18383611cc0565b9392505050565b611bf860a08401608085016121b4565b6001600160a01b03908116908616337f3686138d92841c8549b2fe39fda23881fef6aa9b347352114c0869bf5af3e3f28760408801611c3a60a08a018a6126aa565b8888604051611c4d959493929190612ed2565b60405180910390a45050505050565b6000611c88827f01ffc9a700000000000000000000000000000000000000000000000000000000611cc0565b80156119645750611cb9827fffffffff00000000000000000000000000000000000000000000000000000000611cc0565b1592915050565b604080517fffffffff000000000000000000000000000000000000000000000000000000008316602480830191909152825180830390910181526044909101909152602080820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f01ffc9a700000000000000000000000000000000000000000000000000000000178152825160009392849283928392918391908a617530fa92503d91506000519050828015611d78575060208210155b8015611d845750600081115b979650505050505050565b60405180606001604052806003906020820280368337509192915050565b6001600160a01b0381168114611dc257600080fd5b50565b60008060408385031215611dd857600080fd5b8235611de381611dad565b9150602083013567ffffffffffffffff811115611dff57600080fd5b830160e08186031215611e1157600080fd5b809150509250929050565b60608101818360005b6003811015611e4757815160ff16835260209283019290910190600101611e25565b50505092915050565b600060808284031215611e6257600080fd5b50919050565b60008060408385031215611e7b57600080fd5b8235611e8681611dad565b9150602083013567ffffffffffffffff811115611ea257600080fd5b611eae85828601611e50565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602160045260246000fd5b60038110611ef757611ef7611eb8565b9052565b611f06828251611ee7565b6020818101516001600160a01b0390811691840191909152604080830151821690840152606080830151909116908301526080908101519082015260a00190565b600081518084526020808501945080840160005b83811015611f7c57611f6e878351611efb565b965090820190600101611f5b565b509495945050505050565b602081526000611be16020830184611f47565b805160408084528151908401819052600091602091908201906060860190845b81811015611fdf5783516001600160a01b031683529284019291840191600101611fba565b50508483015186820387850152805180835290840192506000918401905b8083101561202257612010828551611efb565b91508484019350600183019250611ffd565b509695505050505050565b6001600160a01b038316815260406020820152600061204f6040830184611f9a565b949350505050565b6000806040838503121561206a57600080fd5b823561207581611dad565b9150602083013567ffffffffffffffff81111561209157600080fd5b830160a08186031215611e1157600080fd5b600060c08284031215611e6257600080fd5b600080604083850312156120c857600080fd5b82356120d381611dad565b9150602083013567ffffffffffffffff8111156120ef57600080fd5b611eae858286016120a3565b60005b838110156121165781810151838201526020016120fe565b50506000910152565b600081518084526121378160208601602086016120fb565b601f01601f19169290920160200192915050565b60408152600061215e604083018561211f565b82810360208401526121708185611f9a565b95945050505050565b6000806040838503121561218c57600080fd5b50508035926020909101359150565b6000602082840312156121ad57600080fd5b5035919050565b6000602082840312156121c657600080fd5b8135611be181611dad565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6040810181811067ffffffffffffffff82111715612220576122206121d1565b60405250565b6060810181811067ffffffffffffffff82111715612220576122206121d1565b60a0810181811067ffffffffffffffff82111715612220576122206121d1565b601f19601f830116810181811067ffffffffffffffff8211171561228c5761228c6121d1565b6040525050565b60ff81168114611dc257600080fd5b61ffff81168114611dc257600080fd5b6000604082840312156122c457600080fd5b6040516122d081612200565b80915082356122de81612293565b815260208301356122ee816122a2565b6020919091015292915050565b60006060828403121561230d57600080fd5b60405161231981612200565b61232384846122b2565b8152604083013561233381611dad565b60208201529392505050565b6000808335601e1984360301811261235657600080fd5b83018035915067ffffffffffffffff82111561237157600080fd5b602001915060a081023603821315610d3957600080fd5b60038110611dc257600080fd5b600060a082840312156123a757600080fd5b60405160a0810181811067ffffffffffffffff821117156123ca576123ca6121d1565b60405282356123d881612388565b815260208301356123e881611dad565b602082015260408301356123fb81611dad565b6040820152606083013561240e81611dad565b60608201526080928301359281019290925250919050565b6000808335601e1984360301811261243d57600080fd5b83018035915067ffffffffffffffff82111561245857600080fd5b602001915036819003821315610d3957600080fd5b803561247881612293565b60ff168252602081013561248b816122a2565b61ffff81166020840152505050565b60408101611964828461246d565b80516124b381611dad565b919050565b600082601f8301126124c957600080fd5b815167ffffffffffffffff8111156124e3576124e36121d1565b6040516124fa6020601f19601f8501160182612266565b81815284602083860101111561250f57600080fd5b61204f8260208301602087016120fb565b60006020828403121561253257600080fd5b815167ffffffffffffffff8082111561254a57600080fd5b90830190818503608081121561255f57600080fd5b60405161256b81612226565b604082121561257957600080fd5b604051915061258782612200565b835161259281612293565b825260208401516125a2816122a2565b60208301528181526125b6604085016124a8565b602082015260608401519150828211156125cf57600080fd5b6125db878386016124b8565b60408201529695505050505050565b6000602082840312156125fc57600080fd5b8151611be181611dad565b6020808252818101839052600090604080840186845b8781101561269d57813561263081612388565b61263a8482611ee7565b508482013561264881611dad565b6001600160a01b0390811684870152828501359061266582611dad565b908116848601526060908382013561267c81611dad565b16908401526080828101359084015260a0928301929091019060010161261d565b5090979650505050505050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa18336030181126126de57600080fd5b9190910192915050565b6000808335601e198436030181126126ff57600080fd5b83018035915067ffffffffffffffff82111561271a57600080fd5b6020019150600581901b3603821315610d3957600080fd5b6000808335601e1984360301811261274957600080fd5b830160208101925035905067ffffffffffffffff81111561276957600080fd5b803603821315610d3957600080fd5b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60006060830182356127b481611dad565b6001600160a01b0380821686526020915081850135601e198636030181126127db57600080fd5b8501828101903567ffffffffffffffff8111156127f757600080fd5b8060051b360382131561280957600080fd5b6060888501529384905292600090608088015b8183101561284557853561282f81611dad565b841681529484019460019290920191840161281c565b6128526040890189612732565b9650945088810360408a0152612869818787612778565b9998505050505050505050565b6001600160a01b038316815260406020820152600061204f60408301846127a3565b600067ffffffffffffffff8211156128b2576128b26121d1565b5060051b60200190565b600082601f8301126128cd57600080fd5b815160206128da82612898565b604080516128e88382612266565b84815260a0948502870184019484820193508886111561290757600080fd5b8488015b868110156129875781818b0312156129235760008081fd5b835161292e81612246565b815161293981612388565b81528187015161294881611dad565b818801528185015161295981611dad565b8186015260608281015161296c81611dad565b9082015260808281015190820152855293850193810161290b565b509098975050505050505050565b6000602082840312156129a757600080fd5b815167ffffffffffffffff8111156129be57600080fd5b61204f848285016128bc565b8481526129da602082018561246d565b60a0606082015260006129f060a08301856127a3565b8281036080840152611d848185611f47565b600060208284031215612a1457600080fd5b81518015158114611be157600080fd5b6001600160a01b0384168152604060208201526000612170604083018486612778565b600060408284031215612a5957600080fd5b604051612a6581612200565b809150825167ffffffffffffffff80821115612a8057600080fd5b818501915085601f830112612a9457600080fd5b81516020612aa182612898565b604051612aae8282612266565b83815260059390931b8501820192828101915089841115612ace57600080fd5b948201945b83861015612af5578551612ae681611dad565b82529482019490820190612ad3565b86525086810151935082841115612b0b57600080fd5b612b17888589016128bc565b81860152505050505092915050565b60008060408385031215612b3957600080fd5b8251612b4481611dad565b602084015190925067ffffffffffffffff811115612b6157600080fd5b611eae85828601612a47565b868152612b7d602082018761246d565b60c060608201526000612b9460c083018688612778565b6001600160a01b038516608084015282810360a08401526128698185611f9a565b600060208284031215612bc757600080fd5b8135611be181612293565b600060208284031215612be457600080fd5b8135611be1816122a2565b60808101612bfd828561246d565b611be1604083018461246d565b600060408284031215612c1c57600080fd5b611be183836122b2565b600060208284031215612c3857600080fd5b8151611be181612388565b6001600160a01b038416815261ffff8316602082015260606040820152600061217060608301846127a3565b60008060408385031215612c8257600080fd5b825167ffffffffffffffff80821115612c9a57600080fd5b612ca6868387016124b8565b93506020850151915080821115612cbc57600080fd5b50611eae85828601612a47565b60006001600160a01b03808716835280861660208401525083604083015260806060830152612cfb608083018461211f565b9695505050505050565b865160ff16815260208088015161ffff169082015260e081016001600160a01b03871660408301528560608301528460808301528360a083015260048310612d4f57612d4f611eb8565b8260c0830152979650505050505050565b6001600160a01b038316815260406020820152600061204f604083018461211f565b600060033d1115612d9b5760046000803e5060005160e01c5b90565b600060443d1015612dac5790565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc803d016004833e81513d67ffffffffffffffff8160248401118184111715612dfa57505050505090565b8285019150815181811115612e125750505050505090565b843d8701016020828501011115612e2c5750505050505090565b612e3b60208286010187612266565b509095945050505050565b602081526000611be1602083018461211f565b60006001600160a01b03808616835280851660208401525060606040830152612170606083018461211f565b6020808252825182820181905260009190848201906040850190845b81811015612ec65783516001600160a01b031683529284019291840191600101612ea1565b50909695505050505050565b858152612ee2602082018661246d565b60c060608201526000612ef860c08301866127a3565b8281036080840152612f0a8186611f9a565b905082810360a0840152612f1e818561211f565b9897505050505050505056fea26469706673582212203b6b8d20db43d1ba9383deaef531021d2d2de99e1b497c49ff4cada6680428f364736f6c63430008110033',
  deployedBytecode:
    '0x608060405234801561001057600080fd5b50600436106100df5760003560e01c8063851d11f81161008c578063d759812211610066578063d759812214610219578063fafc79da1461023a578063fbdc1ef11461024d578063fe6c34741461028957600080fd5b8063851d11f8146101b85780639665861a146101cb578063ca211f7f146101f257600080fd5b80633c8c01d1116100bd5780633c8c01d114610137578063483d209e14610158578063747e5ec11461018357600080fd5b806322e12c63146100e45780632ae9c600146100f95780632fb0433614610117575b600080fd5b6100f76100f2366004611dc5565b61029c565b005b6101016106be565b60405161010e9190611e1c565b60405180910390f35b61012a610125366004611e68565b6106e8565b60405161010e9190611f87565b61014a610145366004611e68565b6109ff565b60405161010e92919061202d565b60015461016b906001600160a01b031681565b6040516001600160a01b03909116815260200161010e565b6101aa7ff796b89427c6552c1ac705d833bfb7909f8eb5ce502c1db97f85fabc6ad8354881565b60405190815260200161010e565b6100f76101c6366004612057565b610d40565b6101aa7fb03cf3d518f6d49560b7f5bece1ccb8fd50ea7370f02f5e5210edba04be3c4f781565b6101aa7fbd4dbacf5ba6d9793f600403b3293d6ecd695fcc703a2b5edcf245f45fda6cfa81565b61022c6102273660046120b5565b610efd565b60405161010e92919061214b565b6100f7610248366004612179565b611587565b61027461025b36600461219b565b6000602081905290815260409020805460019091015482565b6040805192835260208301919091520161010e565b6100f76102973660046120b5565b6115e5565b817fb03cf3d518f6d49560b7f5bece1ccb8fd50ea7370f02f5e5210edba04be3c4f76102c88282611827565b60006102e0856102db60208701876121b4565b611927565b60008181526020818152604082209293506103bc90610307903689900389019089016122fb565b61036d61031760a08a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b828210156103635761035460a08302860136819003810190612395565b81526020019060010190610337565b505050505061196a565b60c089013561037f60808b018b612426565b8080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152506002925061199a915050565b90506103c88382611587565b60006103e96103df36899003890160208a016122fb565b8860c001356119e2565b43845560018401819055905060006104076080890160608a016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e909906104389060208c019060040161249a565b600060405180830381865afa158015610455573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261047d9190810190612520565b9050600061048e60208a018a6121b4565b6001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156104cb573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104ef91906125ea565b9050600082602001516001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa158015610535573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061055991906125ea565b9050806001600160a01b0316826001600160a01b0316146105cc576105cc61058460208c018c6121b4565b8261059260808e018e612426565b8080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250611a2992505050565b60006105db60a08c018c61233f565b9050111561064f576001600160a01b038b1663e978afe56105ff60a08d018d61233f565b6040518363ffffffff1660e01b815260040161061c929190612607565b600060405180830381600087803b15801561063657600080fd5b505af115801561064a573d6000803e3d6000fd5b505050505b61065c60208b018b6121b4565b6001600160a01b03168b6001600160a01b03167f24565610ddf61ee73e8501d7f0454657c71f5944882f5c586d7246bf43e13cda87876040516106a9929190918252602082015260400190565b60405180910390a35050505050505050505050565b6106c6611d8f565b5060408051606081018252600181526004602082015260009181019190915290565b6060600061070a846106fc858501866126aa565b6102db9060208101906121b4565b600081815260208190526040812091925061078761072d368790038701876122fb565b61078261073d60608901896126aa565b61074b9060208101906126e8565b80806020026020016040519081016040528093929190818152602001838360200280828437600092019190915250611bb292505050565b6119e2565b9050808260010154146107db5760018201546040517f73a4eaa00000000000000000000000000000000000000000000000000000000081526004810191909152602481018290526044015b60405180910390fd5b60006107ed60608701604088016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e9099061081b90899060040161249a565b600060405180830381865afa158015610838573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526108609190810190612520565b60208101519091506001600160a01b0316639cb0a1248861088460608a018a6126aa565b6040518363ffffffff1660e01b81526004016108a1929190612876565b6000604051808303816000875af11580156108c0573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526108e89190810190612995565b9450600061093f6108fe368990038901896122fb565b6109078861196a565b6040805160208101909152600081527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e56390600361199a565b60008181526002860160205260409020548554919250111561097757604051630559b4b760e31b8152600481018290526024016107d2565b60008181526002850160205260409081902043905561099c90606089019089016121b4565b6001600160a01b03908116908916337f5fdcd271ff15db84cbc94365956df5504f6d756e111654144648433c11a44530848b6109db60608201826126aa565b8c6040516109ec94939291906129ca565b60405180910390a4505050505092915050565b6000610a1e604051806040016040528060608152602001606081525090565b6000610a3060608501604086016121b4565b6001546040517ff29ee1250000000000000000000000000000000000000000000000000000000081526001600160a01b03808416600483015292935091169063f29ee12590602401602060405180830381865afa158015610a95573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610ab99190612a02565b610aef576040517f0d4feab400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604051639af3e90960e01b81526000906001600160a01b03831690639af3e90990610b1e90889060040161249a565b600060405180830381865afa158015610b3b573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f19168201604052610b639190810190612520565b60208101519091506001600160a01b031663f10832f187610b876060890189612426565b6040518463ffffffff1660e01b8152600401610ba593929190612a24565b6000604051808303816000875af1158015610bc4573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f19168201604052610bec9190810190612b26565b90945092506000610bfd8786611927565b90506000610c42610c13368990038901896122fb565b610c20876020015161196a565b8751610c2b90611bb2565b60405180602001604052806000815250600161199a565b600083815260208190526040902060018101549192509015610c90576040517fd2e44eb600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600082815260028201602052604090205481541015610cc557604051630559b4b760e31b8152600481018390526024016107d2565b600082815260028201602052604090204390556001600160a01b03808616908a16337f8ea69cee01fd9fc24e6b9614ea0896c5a1eac8fd8aba383285248cd0e1d8503a858c610d176060820182612426565b8e8e604051610d2b96959493929190612b6d565b60405180910390a450505050505b9250929050565b817fbd4dbacf5ba6d9793f600403b3293d6ecd695fcc703a2b5edcf245f45fda6cfa610d6c8282611827565b6000610d7f856102db60208701876121b4565b6000818152602081815260408220929350610e0290610da6903689900389019089016122fb565b610907610db660808a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b8282101561036357610df360a08302860136819003810190612395565b81526020019060010190610dd6565b9050610e0e8382611587565b438255600060018301819055610e27608088018861233f565b90501115610e9b576001600160a01b03871663e978afe5610e4b608089018961233f565b6040518363ffffffff1660e01b8152600401610e68929190612607565b600060405180830381600087803b158015610e8257600080fd5b505af1158015610e96573d6000803e3d6000fd5b505050505b610ea860208701876121b4565b6001600160a01b0316876001600160a01b03167fa0e5d4ce6420a0e7a5f0ac10c47b3a672fb661c11f5609bb21b68644d81e17aa83604051610eec91815260200190565b60405180910390a350505050505050565b6060610f1c604051806040016040528060608152602001606081525090565b610f2c6060840160408501612bb5565b60ff16610f3c6020850185612bb5565b60ff16141580610f725750610f576080840160608501612bd2565b61ffff16610f6b6040850160208601612bd2565b61ffff1610155b15610fb057604080517f80d4e9070000000000000000000000000000000000000000000000000000000081526107d291859190820190600401612bef565b6000610fc3856106fc60a08701876126aa565b6000818152602081905260408120919250610fe461073d60a08801886126aa565b9050600061103060405180604001604052808960000180360381019061100a9190612c0a565b815260200161101f60a08b0160808c016121b4565b6001600160a01b03169052836119e2565b90508083600101541461107f5760018301546040517f73a4eaa00000000000000000000000000000000000000000000000000000000081526004810191909152602481018290526044016107d2565b600061109160a0890160808a016121b4565b604051639af3e90960e01b81526001600160a01b039190911690639af3e909906110bf908b9060040161249a565b600060405180830381865afa1580156110dc573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526111049190810190612520565b9050600061111860a08a0160808b016121b4565b6001600160a01b0316639af3e9098a6040016040518263ffffffff1660e01b8152600401611146919061249a565b600060405180830381865afa158015611163573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261118b9190810190612520565b9050600081602001516001600160a01b031683602001516001600160a01b0316036112825761122c60405180604001604052808c6040018036038101906111d29190612c0a565b81526020016111e760a08e0160808f016121b4565b6001600160a01b031690526040805160208101909152600081527f569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd908890600261199a565b905061123b60a08b018b6126aa565b6112499060208101906126e8565b80806020026020016040519081016040528093929190818152602001838360200280828437600092019190915250505090895250611524565b6112d07f41de6830000000000000000000000000000000000000000000000000000000006112b360a08d018d6126aa565b6112c19060208101906121b4565b6001600160a01b031690611bc5565b61132d576112e160a08b018b6126aa565b6112ef9060208101906121b4565b6040517f8174ff550000000000000000000000000000000000000000000000000000000081526001600160a01b0390911660048201526024016107d2565b600061133c60a08c018c6126aa565b61134a9060208101906121b4565b6001600160a01b03166341de68306040518163ffffffff1660e01b8152600401602060405180830381865afa158015611387573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906113ab9190612c26565b60028111156113bc576113bc611eb8565b1461141a576113ce60a08b018b6126aa565b6113dc9060208101906121b4565b6040517fe4356c940000000000000000000000000000000000000000000000000000000081526001600160a01b0390911660048201526024016107d2565b81602001516001600160a01b031663a8a9c29e8c8c60000160200160208101906114449190612bd2565b61145160a08f018f6126aa565b6040518463ffffffff1660e01b815260040161146f93929190612c43565b6000604051808303816000875af115801561148e573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f191682016040526114b69190810190612c6f565b809950819a50505061152160405180604001604052808c6040018036038101906114e09190612c0a565b81526020016114f560a08e0160808f016121b4565b6001600160a01b031681525061150e8a6020015161196a565b8a5161151990611bb2565b8c600261199a565b90505b60008181526002870160205260409020548654101561155957604051630559b4b760e31b8152600481018290526024016107d2565b600081815260028701602052604090204390556115798b828c8b8d611be8565b505050505050509250929050565b60008281526020818152604080832084845260028101909252909120548154106115e0576040517f59730ce6000000000000000000000000000000000000000000000000000000008152600481018390526024016107d2565b505050565b817ff796b89427c6552c1ac705d833bfb7909f8eb5ce502c1db97f85fabc6ad835486116118282611827565b6000611627856102db60808701606088016121b4565b60008181526020819052604081209192506116c261164a368890038801886122fb565b6116a661165a60808a018a61233f565b808060200260200160405190810160405280939291908181526020016000905b828210156103635761169760a08302860136819003810190612395565b8152602001906001019061167a565b8860a0013560405180602001604052806000815250600161199a565b600183015490915015611701576040517fd2e44eb600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b61170b8382611587565b600061172961171f368990038901896122fb565b8860a001356119e2565b6001840181905543845590506000611744608089018961233f565b905011156117b8576001600160a01b03881663e978afe561176860808a018a61233f565b6040518363ffffffff1660e01b8152600401611785929190612607565b600060405180830381600087803b15801561179f57600080fd5b505af11580156117b3573d6000803e3d6000fd5b505050505b6117c860808801606089016121b4565b6001600160a01b0316886001600160a01b03167f74e616c7264536b98a5ec234d051ae6ce1305bf05c85f9ddc112364440ccf1298484604051611815929190918252602082015260400190565b60405180910390a35050505050505050565b336001600160a01b038316148015906118d45750604080516020810182526000815290517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0384169163fdef91069161189191309133918791600401612cc9565b602060405180830381865afa1580156118ae573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906118d29190612a02565b155b15611923576040517f15d68ee00000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152336024820152604481018290526064016107d2565b5050565b604080516001600160a01b0380851660208301528316918101919091526000906060015b6040516020818303038152906040528051906020012090505b92915050565b60008160405160200161197d9190611f87565b604051602081830303815290604052805190602001209050919050565b84516020808701518451858301206040516000946119c1949093928a928a92899101612d05565b60405160208183030381529060405280519060200120905095945050505050565b815160208084015160408051845160ff1681850152929093015161ffff16928201929092526001600160a01b0390911660608201526080810182905260009060a00161194b565b805115611b6b576040517f4f1ef2860000000000000000000000000000000000000000000000000000000081526001600160a01b03841690634f1ef28690611a779085908590600401612d60565b600060405180830381600087803b158015611a9157600080fd5b505af1925050508015611aa2575060015b6115e057611aae612d82565b806308c379a003611b015750611ac2612d9e565b80611acd5750611b03565b806040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107d29190612e46565b505b3d808015611b2d576040519150601f19603f3d011682016040523d82523d6000602084013e611b32565b606091505b508383836040517f96e9e31b0000000000000000000000000000000000000000000000000000000081526004016107d293929190612e59565b6040517f3659cfe60000000000000000000000000000000000000000000000000000000081526001600160a01b038381166004830152841690633659cfe690602401611a77565b60008160405160200161197d9190612e85565b6000611bd083611c5c565b8015611be15750611be18383611cc0565b9392505050565b611bf860a08401608085016121b4565b6001600160a01b03908116908616337f3686138d92841c8549b2fe39fda23881fef6aa9b347352114c0869bf5af3e3f28760408801611c3a60a08a018a6126aa565b8888604051611c4d959493929190612ed2565b60405180910390a45050505050565b6000611c88827f01ffc9a700000000000000000000000000000000000000000000000000000000611cc0565b80156119645750611cb9827fffffffff00000000000000000000000000000000000000000000000000000000611cc0565b1592915050565b604080517fffffffff000000000000000000000000000000000000000000000000000000008316602480830191909152825180830390910181526044909101909152602080820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f01ffc9a700000000000000000000000000000000000000000000000000000000178152825160009392849283928392918391908a617530fa92503d91506000519050828015611d78575060208210155b8015611d845750600081115b979650505050505050565b60405180606001604052806003906020820280368337509192915050565b6001600160a01b0381168114611dc257600080fd5b50565b60008060408385031215611dd857600080fd5b8235611de381611dad565b9150602083013567ffffffffffffffff811115611dff57600080fd5b830160e08186031215611e1157600080fd5b809150509250929050565b60608101818360005b6003811015611e4757815160ff16835260209283019290910190600101611e25565b50505092915050565b600060808284031215611e6257600080fd5b50919050565b60008060408385031215611e7b57600080fd5b8235611e8681611dad565b9150602083013567ffffffffffffffff811115611ea257600080fd5b611eae85828601611e50565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602160045260246000fd5b60038110611ef757611ef7611eb8565b9052565b611f06828251611ee7565b6020818101516001600160a01b0390811691840191909152604080830151821690840152606080830151909116908301526080908101519082015260a00190565b600081518084526020808501945080840160005b83811015611f7c57611f6e878351611efb565b965090820190600101611f5b565b509495945050505050565b602081526000611be16020830184611f47565b805160408084528151908401819052600091602091908201906060860190845b81811015611fdf5783516001600160a01b031683529284019291840191600101611fba565b50508483015186820387850152805180835290840192506000918401905b8083101561202257612010828551611efb565b91508484019350600183019250611ffd565b509695505050505050565b6001600160a01b038316815260406020820152600061204f6040830184611f9a565b949350505050565b6000806040838503121561206a57600080fd5b823561207581611dad565b9150602083013567ffffffffffffffff81111561209157600080fd5b830160a08186031215611e1157600080fd5b600060c08284031215611e6257600080fd5b600080604083850312156120c857600080fd5b82356120d381611dad565b9150602083013567ffffffffffffffff8111156120ef57600080fd5b611eae858286016120a3565b60005b838110156121165781810151838201526020016120fe565b50506000910152565b600081518084526121378160208601602086016120fb565b601f01601f19169290920160200192915050565b60408152600061215e604083018561211f565b82810360208401526121708185611f9a565b95945050505050565b6000806040838503121561218c57600080fd5b50508035926020909101359150565b6000602082840312156121ad57600080fd5b5035919050565b6000602082840312156121c657600080fd5b8135611be181611dad565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6040810181811067ffffffffffffffff82111715612220576122206121d1565b60405250565b6060810181811067ffffffffffffffff82111715612220576122206121d1565b60a0810181811067ffffffffffffffff82111715612220576122206121d1565b601f19601f830116810181811067ffffffffffffffff8211171561228c5761228c6121d1565b6040525050565b60ff81168114611dc257600080fd5b61ffff81168114611dc257600080fd5b6000604082840312156122c457600080fd5b6040516122d081612200565b80915082356122de81612293565b815260208301356122ee816122a2565b6020919091015292915050565b60006060828403121561230d57600080fd5b60405161231981612200565b61232384846122b2565b8152604083013561233381611dad565b60208201529392505050565b6000808335601e1984360301811261235657600080fd5b83018035915067ffffffffffffffff82111561237157600080fd5b602001915060a081023603821315610d3957600080fd5b60038110611dc257600080fd5b600060a082840312156123a757600080fd5b60405160a0810181811067ffffffffffffffff821117156123ca576123ca6121d1565b60405282356123d881612388565b815260208301356123e881611dad565b602082015260408301356123fb81611dad565b6040820152606083013561240e81611dad565b60608201526080928301359281019290925250919050565b6000808335601e1984360301811261243d57600080fd5b83018035915067ffffffffffffffff82111561245857600080fd5b602001915036819003821315610d3957600080fd5b803561247881612293565b60ff168252602081013561248b816122a2565b61ffff81166020840152505050565b60408101611964828461246d565b80516124b381611dad565b919050565b600082601f8301126124c957600080fd5b815167ffffffffffffffff8111156124e3576124e36121d1565b6040516124fa6020601f19601f8501160182612266565b81815284602083860101111561250f57600080fd5b61204f8260208301602087016120fb565b60006020828403121561253257600080fd5b815167ffffffffffffffff8082111561254a57600080fd5b90830190818503608081121561255f57600080fd5b60405161256b81612226565b604082121561257957600080fd5b604051915061258782612200565b835161259281612293565b825260208401516125a2816122a2565b60208301528181526125b6604085016124a8565b602082015260608401519150828211156125cf57600080fd5b6125db878386016124b8565b60408201529695505050505050565b6000602082840312156125fc57600080fd5b8151611be181611dad565b6020808252818101839052600090604080840186845b8781101561269d57813561263081612388565b61263a8482611ee7565b508482013561264881611dad565b6001600160a01b0390811684870152828501359061266582611dad565b908116848601526060908382013561267c81611dad565b16908401526080828101359084015260a0928301929091019060010161261d565b5090979650505050505050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa18336030181126126de57600080fd5b9190910192915050565b6000808335601e198436030181126126ff57600080fd5b83018035915067ffffffffffffffff82111561271a57600080fd5b6020019150600581901b3603821315610d3957600080fd5b6000808335601e1984360301811261274957600080fd5b830160208101925035905067ffffffffffffffff81111561276957600080fd5b803603821315610d3957600080fd5b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60006060830182356127b481611dad565b6001600160a01b0380821686526020915081850135601e198636030181126127db57600080fd5b8501828101903567ffffffffffffffff8111156127f757600080fd5b8060051b360382131561280957600080fd5b6060888501529384905292600090608088015b8183101561284557853561282f81611dad565b841681529484019460019290920191840161281c565b6128526040890189612732565b9650945088810360408a0152612869818787612778565b9998505050505050505050565b6001600160a01b038316815260406020820152600061204f60408301846127a3565b600067ffffffffffffffff8211156128b2576128b26121d1565b5060051b60200190565b600082601f8301126128cd57600080fd5b815160206128da82612898565b604080516128e88382612266565b84815260a0948502870184019484820193508886111561290757600080fd5b8488015b868110156129875781818b0312156129235760008081fd5b835161292e81612246565b815161293981612388565b81528187015161294881611dad565b818801528185015161295981611dad565b8186015260608281015161296c81611dad565b9082015260808281015190820152855293850193810161290b565b509098975050505050505050565b6000602082840312156129a757600080fd5b815167ffffffffffffffff8111156129be57600080fd5b61204f848285016128bc565b8481526129da602082018561246d565b60a0606082015260006129f060a08301856127a3565b8281036080840152611d848185611f47565b600060208284031215612a1457600080fd5b81518015158114611be157600080fd5b6001600160a01b0384168152604060208201526000612170604083018486612778565b600060408284031215612a5957600080fd5b604051612a6581612200565b809150825167ffffffffffffffff80821115612a8057600080fd5b818501915085601f830112612a9457600080fd5b81516020612aa182612898565b604051612aae8282612266565b83815260059390931b8501820192828101915089841115612ace57600080fd5b948201945b83861015612af5578551612ae681611dad565b82529482019490820190612ad3565b86525086810151935082841115612b0b57600080fd5b612b17888589016128bc565b81860152505050505092915050565b60008060408385031215612b3957600080fd5b8251612b4481611dad565b602084015190925067ffffffffffffffff811115612b6157600080fd5b611eae85828601612a47565b868152612b7d602082018761246d565b60c060608201526000612b9460c083018688612778565b6001600160a01b038516608084015282810360a08401526128698185611f9a565b600060208284031215612bc757600080fd5b8135611be181612293565b600060208284031215612be457600080fd5b8135611be1816122a2565b60808101612bfd828561246d565b611be1604083018461246d565b600060408284031215612c1c57600080fd5b611be183836122b2565b600060208284031215612c3857600080fd5b8151611be181612388565b6001600160a01b038416815261ffff8316602082015260606040820152600061217060608301846127a3565b60008060408385031215612c8257600080fd5b825167ffffffffffffffff80821115612c9a57600080fd5b612ca6868387016124b8565b93506020850151915080821115612cbc57600080fd5b50611eae85828601612a47565b60006001600160a01b03808716835280861660208401525083604083015260806060830152612cfb608083018461211f565b9695505050505050565b865160ff16815260208088015161ffff169082015260e081016001600160a01b03871660408301528560608301528460808301528360a083015260048310612d4f57612d4f611eb8565b8260c0830152979650505050505050565b6001600160a01b038316815260406020820152600061204f604083018461211f565b600060033d1115612d9b5760046000803e5060005160e01c5b90565b600060443d1015612dac5790565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc803d016004833e81513d67ffffffffffffffff8160248401118184111715612dfa57505050505090565b8285019150815181811115612e125750505050505090565b843d8701016020828501011115612e2c5750505050505090565b612e3b60208286010187612266565b509095945050505050565b602081526000611be1602083018461211f565b60006001600160a01b03808616835280851660208401525060606040830152612170606083018461211f565b6020808252825182820181905260009190848201906040850190845b81811015612ec65783516001600160a01b031683529284019291840191600101612ea1565b50909695505050505050565b858152612ee2602082018661246d565b60c060608201526000612ef860c08301866127a3565b8281036080840152612f0a8186611f9a565b905082810360a0840152612f1e818561211f565b9897505050505050505056fea26469706673582212203b6b8d20db43d1ba9383deaef531021d2d2de99e1b497c49ff4cada6680428f364736f6c63430008110033',
  linkReferences: {},
  deployedLinkReferences: {},
}
