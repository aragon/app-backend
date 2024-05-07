export const PluginRepo = {
  _format: 'hh-sol-artifact-1',
  contractName: 'PluginRepo',
  sourceName: 'src/framework/plugin/repo/PluginRepo.sol',
  abi: [
    {
      inputs: [],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      inputs: [],
      name: 'AnyAddressDisallowedForWhoAndWhere',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'contract IPermissionCondition',
          name: 'condition',
          type: 'address',
        },
      ],
      name: 'ConditionInterfacNotSupported',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'contract IPermissionCondition',
          name: 'condition',
          type: 'address',
        },
      ],
      name: 'ConditionNotAContract',
      type: 'error',
    },
    {
      inputs: [],
      name: 'EmptyReleaseMetadata',
      type: 'error',
    },
    {
      inputs: [],
      name: 'GrantWithConditionNotSupported',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidPluginSetupInterface',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint8',
          name: 'latestRelease',
          type: 'uint8',
        },
        {
          internalType: 'uint8',
          name: 'newRelease',
          type: 'uint8',
        },
      ],
      name: 'InvalidReleaseIncrement',
      type: 'error',
    },
    {
      inputs: [
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
          internalType: 'bytes32',
          name: 'permissionId',
          type: 'bytes32',
        },
        {
          internalType: 'address',
          name: 'currentCondition',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'newCondition',
          type: 'address',
        },
      ],
      name: 'PermissionAlreadyGrantedForDifferentCondition',
      type: 'error',
    },
    {
      inputs: [],
      name: 'PermissionsForAnyAddressDisallowed',
      type: 'error',
    },
    {
      inputs: [
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
        {
          internalType: 'address',
          name: 'pluginSetup',
          type: 'address',
        },
      ],
      name: 'PluginSetupAlreadyInPreviousRelease',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ReleaseDoesNotExist',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ReleaseZeroNotAllowed',
      type: 'error',
    },
    {
      inputs: [
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
          internalType: 'bytes32',
          name: 'permissionId',
          type: 'bytes32',
        },
      ],
      name: 'Unauthorized',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'versionHash',
          type: 'bytes32',
        },
      ],
      name: 'VersionHashDoesNotExist',
      type: 'error',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'previousAdmin',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'newAdmin',
          type: 'address',
        },
      ],
      name: 'AdminChanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'beacon',
          type: 'address',
        },
      ],
      name: 'BeaconUpgraded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'bytes32',
          name: 'permissionId',
          type: 'bytes32',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'here',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'who',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'condition',
          type: 'address',
        },
      ],
      name: 'Granted',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint8',
          name: 'version',
          type: 'uint8',
        },
      ],
      name: 'Initialized',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint8',
          name: 'release',
          type: 'uint8',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'releaseMetadata',
          type: 'bytes',
        },
      ],
      name: 'ReleaseMetadataUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'bytes32',
          name: 'permissionId',
          type: 'bytes32',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'here',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'who',
          type: 'address',
        },
      ],
      name: 'Revoked',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'implementation',
          type: 'address',
        },
      ],
      name: 'Upgraded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint8',
          name: 'release',
          type: 'uint8',
        },
        {
          indexed: false,
          internalType: 'uint16',
          name: 'build',
          type: 'uint16',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'pluginSetup',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'buildMetadata',
          type: 'bytes',
        },
      ],
      name: 'VersionCreated',
      type: 'event',
    },
    {
      inputs: [],
      name: 'MAINTAINER_PERMISSION_ID',
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
      name: 'ROOT_PERMISSION_ID',
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
      name: 'UPGRADE_REPO_PERMISSION_ID',
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
          name: '_items',
          type: 'tuple[]',
        },
      ],
      name: 'applyMultiTargetPermissions',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_where',
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
              name: 'who',
              type: 'address',
            },
            {
              internalType: 'bytes32',
              name: 'permissionId',
              type: 'bytes32',
            },
          ],
          internalType: 'struct PermissionLib.SingleTargetPermission[]',
          name: 'items',
          type: 'tuple[]',
        },
      ],
      name: 'applySingleTargetPermissions',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint8',
          name: '_release',
          type: 'uint8',
        },
      ],
      name: 'buildCount',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint8',
          name: '_release',
          type: 'uint8',
        },
        {
          internalType: 'address',
          name: '_pluginSetup',
          type: 'address',
        },
        {
          internalType: 'bytes',
          name: '_buildMetadata',
          type: 'bytes',
        },
        {
          internalType: 'bytes',
          name: '_releaseMetadata',
          type: 'bytes',
        },
      ],
      name: 'createVersion',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_pluginSetup',
          type: 'address',
        },
      ],
      name: 'getLatestVersion',
      outputs: [
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
              name: 'tag',
              type: 'tuple',
            },
            {
              internalType: 'address',
              name: 'pluginSetup',
              type: 'address',
            },
            {
              internalType: 'bytes',
              name: 'buildMetadata',
              type: 'bytes',
            },
          ],
          internalType: 'struct PluginRepo.Version',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint8',
          name: '_release',
          type: 'uint8',
        },
      ],
      name: 'getLatestVersion',
      outputs: [
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
              name: 'tag',
              type: 'tuple',
            },
            {
              internalType: 'address',
              name: 'pluginSetup',
              type: 'address',
            },
            {
              internalType: 'bytes',
              name: 'buildMetadata',
              type: 'bytes',
            },
          ],
          internalType: 'struct PluginRepo.Version',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: '_tagHash',
          type: 'bytes32',
        },
      ],
      name: 'getVersion',
      outputs: [
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
              name: 'tag',
              type: 'tuple',
            },
            {
              internalType: 'address',
              name: 'pluginSetup',
              type: 'address',
            },
            {
              internalType: 'bytes',
              name: 'buildMetadata',
              type: 'bytes',
            },
          ],
          internalType: 'struct PluginRepo.Version',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
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
          name: '_tag',
          type: 'tuple',
        },
      ],
      name: 'getVersion',
      outputs: [
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
              name: 'tag',
              type: 'tuple',
            },
            {
              internalType: 'address',
              name: 'pluginSetup',
              type: 'address',
            },
            {
              internalType: 'bytes',
              name: 'buildMetadata',
              type: 'bytes',
            },
          ],
          internalType: 'struct PluginRepo.Version',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_where',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_who',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: '_permissionId',
          type: 'bytes32',
        },
      ],
      name: 'grant',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_where',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_who',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: '_permissionId',
          type: 'bytes32',
        },
        {
          internalType: 'contract IPermissionCondition',
          name: '_condition',
          type: 'address',
        },
      ],
      name: 'grantWithCondition',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'initialOwner',
          type: 'address',
        },
      ],
      name: 'initialize',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_where',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_who',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: '_permissionId',
          type: 'bytes32',
        },
        {
          internalType: 'bytes',
          name: '_data',
          type: 'bytes',
        },
      ],
      name: 'isGranted',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'latestRelease',
      outputs: [
        {
          internalType: 'uint8',
          name: '',
          type: 'uint8',
        },
      ],
      stateMutability: 'view',
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
      name: 'proxiableUUID',
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
          name: '_where',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_who',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: '_permissionId',
          type: 'bytes32',
        },
      ],
      name: 'revoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes4',
          name: '_interfaceId',
          type: 'bytes4',
        },
      ],
      name: 'supportsInterface',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint8',
          name: '_release',
          type: 'uint8',
        },
        {
          internalType: 'bytes',
          name: '_releaseMetadata',
          type: 'bytes',
        },
      ],
      name: 'updateReleaseMetadata',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'newImplementation',
          type: 'address',
        },
      ],
      name: 'upgradeTo',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'newImplementation',
          type: 'address',
        },
        {
          internalType: 'bytes',
          name: 'data',
          type: 'bytes',
        },
      ],
      name: 'upgradeToAndCall',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
  ],
  bytecode:
    '0x60a0604052306080523480156200001557600080fd5b506200002062000026565b620000e7565b600054610100900460ff1615620000935760405162461bcd60e51b815260206004820152602760248201527f496e697469616c697a61626c653a20636f6e747261637420697320696e697469604482015266616c697a696e6760c81b606482015260840160405180910390fd5b60005460ff90811614620000e5576000805460ff191660ff9081179091556040519081527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b565b608051612f9c6200011f60003960008181610a1b01528181610ab601528181610bbd01528181610c530152610d980152612f9c6000f3fe6080604052600436106101805760003560e01c80639aaf9f08116100d6578063d68bad2c1161007f578063e0589bd311610059578063e0589bd31461047d578063e978afe51461049d578063fc054427146104bd57600080fd5b8063d68bad2c14610409578063d96054c414610429578063df1d6c441461044957600080fd5b8063c4d66de8116100b0578063c4d66de814610395578063c9dbc2a4146103b5578063cc98b8f5146103d557600080fd5b80639aaf9f08146103215780639af3e90914610341578063afe5eb781461036157600080fd5b80632ae9c6001161013857806350abe9101161011257806350abe910146102b357806352d1902d146102e05780637be0ca5e146102f557600080fd5b80632ae9c6001461025e5780633659cfe6146102805780634f1ef286146102a057600080fd5b806322844d041161016957806322844d04146101fc5780632675fdd01461021e57806328375f671461023e57600080fd5b806301ffc9a71461018557806309e56b14146101ba575b600080fd5b34801561019157600080fd5b506101a56101a0366004612546565b6104dd565b60405190151581526020015b60405180910390f35b3480156101c657600080fd5b506101ee7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3381565b6040519081526020016101b1565b34801561020857600080fd5b5061021c61021736600461259d565b6105a9565b005b34801561022a57600080fd5b506101a56102393660046126c8565b6106c5565b34801561024a57600080fd5b5061021c610259366004612793565b6108c1565b34801561026a57600080fd5b506102736109e7565b6040516101b191906127e6565b34801561028c57600080fd5b5061021c61029b36600461281a565b610a11565b61021c6102ae366004612837565b610bb3565b3480156102bf57600080fd5b506102d36102ce36600461281a565b610d41565b6040516101b191906128d7565b3480156102ec57600080fd5b506101ee610d8b565b34801561030157600080fd5b5060cc5461030f9060ff1681565b60405160ff90911681526020016101b1565b34801561032d57600080fd5b506102d361033c366004612923565b610e50565b34801561034d57600080fd5b506102d361035c36600461293c565b610fa7565b34801561036d57600080fd5b506101ee7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea81565b3480156103a157600080fd5b5061021c6103b036600461281a565b610fed565b3480156103c157600080fd5b5061021c6103d0366004612954565b611164565b3480156103e157600080fd5b506101ee7f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b81565b34801561041557600080fd5b5061021c6104243660046129a7565b61119a565b34801561043557600080fd5b5061021c6104443660046129a7565b6111d5565b34801561045557600080fd5b506101ee6104643660046129e8565b60ff16600090815260c9602052604090205461ffff1690565b34801561048957600080fd5b506102d36104983660046129e8565b61120a565b3480156104a957600080fd5b5061021c6104b8366004612a03565b611273565b3480156104c957600080fd5b5061021c6104d8366004612a78565b61137a565b60007fffffffff0000000000000000000000000000000000000000000000000000000082167fd4321b4000000000000000000000000000000000000000000000000000000000148061057057507fffffffff0000000000000000000000000000000000000000000000000000000082167f2ae9c60000000000000000000000000000000000000000000000000000000000145b806105a357506301ffc9a760e01b7fffffffff000000000000000000000000000000000000000000000000000000008316145b92915050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336105d3816117a6565b60005b828110156106be5760008484838181106105f2576105f2612b0b565b9050606002018036038101906106089190612b30565b905060008151600281111561061f5761061f612b99565b0361063c57610637868260200151836040015161182e565b6106b5565b60018151600281111561065157610651612b99565b03610669576106378682602001518360400151611987565b60028151600281111561067e5761067e612b99565b036106b5576040517fd4d3bef700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b506001016105d6565b5050505050565b60008060976000610737888888604051692822a926a4a9a9a4a7a760b11b60208201526bffffffffffffffffffffffff19606084811b8216602a84015285901b16603e820152605281018290526000906072016040516020818303038152906040528051906020012090509392505050565b81526020810191909152604001600020546001600160a01b031690507ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe81016107845760019150506108b9565b6001600160a01b038116156107a8576107a08187878787611a7b565b9150506108b9565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19602a8301819052606089901b16603e830152605280830187905283518084039091018152607290920183528151918101919091206000908152609790915220546001600160a01b0316801561082e576107a08187878787611a7b565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088901b8116602a840152603e830152605280830187905283518084039091018152607290920183528151918101919091206000908152609790915220546001600160a01b031680156108b3576107a08187878787611a7b565b50600090505b949350505050565b7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea6108eb816117a6565b8360ff16600003610928576040517f76f52ffa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60cc5460ff908116908516111561096b576040517f11c6e3ab00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008290036109a6576040517f88bc3fe700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b7f8ff94c32efcef376eb02508cba5536e0634c1d6ad4b51ffa0f7306c78edaf5f78484846040516109d993929190612bda565b60405180910390a150505050565b6109ef612528565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610ab45760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084015b60405180910390fd5b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610b0f7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610b8b5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610aab565b610b9481611b26565b60408051600080825260208201909252610bb091839190611b50565b50565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610c515760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610aab565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610cac7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610d285760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610aab565b610d3182611b26565b610d3d82826001611b50565b5050565b6040805160a081018252600060608083018281526080840183905283526020808401839052838501919091526001600160a01b038516825260cb905291909120546105a390610e50565b6000306001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001614610e2b5760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c00000000000000006064820152608401610aab565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b6040805160a0810182526000606080830182815260808401839052835260208084018390528385019190915284825260ca905291822080549192909160ff169003610eca576040517f8d0aeeb100000000000000000000000000000000000000000000000000000000815260048101849052602401610aab565b6040805160a081018252825460ff81166060830190815261010090910461ffff166080830152815260018301546001600160a01b03166020820152600283018054919284929084019190610f1d90612bf7565b80601f0160208091040260200160405190810160405280929190818152602001828054610f4990612bf7565b8015610f965780601f10610f6b57610100808354040283529160200191610f96565b820191906000526020600020905b815481529060010190602001808311610f7957829003601f168201915b505050505081525050915050919050565b6040805160a081018252600060608083018281526080840183905283526020830191909152918101919091526105a361033c610fe836859003850185612c2b565b611cf5565b600054610100900460ff161580801561100d5750600054600160ff909116105b806110275750303b158015611027575060005460ff166001145b6110995760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a65640000000000000000000000000000000000006064820152608401610aab565b6000805460ff1916600117905580156110bc576000805461ff0019166101001790555b6110c582611d84565b6110f030837fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea61182e565b61111b30837f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b61182e565b8015610d3d576000805461ff0019169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361118e816117a6565b6106be85858585611e0a565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336111c4816117a6565b6111cf84848461182e565b50505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336111ff816117a6565b6111cf848484611987565b6040805160a0810182526000606080830182815260808401839052835260208084018390528385019190915260ff851680835260c982529184902054845180860190955291845261ffff909116908301819052909161126c9061033c90611cf5565b9392505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361129d816117a6565b60005b828110156111cf5760008484838181106112bc576112bc612b0b565b905060a002018036038101906112d29190612c8f565b90506000815160028111156112e9576112e9612b99565b0361130a5761130581602001518260400151836080015161182e565b611371565b60018151600281111561131f5761131f612b99565b0361133b57611305816020015182604001518360800151611987565b60028151600281111561135057611350612b99565b03611371576113718160200151826040015183608001518460600151611e0a565b506001016112a0565b7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea6113a4816117a6565b6113d76001600160a01b0387167f99718b500000000000000000000000000000000000000000000000000000000061217a565b61140d576040517f9d145ceb00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8660ff1660000361144a576040517f76f52ffa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60cc5460019061145d9060ff1689612d34565b60ff1611156114a95760cc546040517f53db7b7b00000000000000000000000000000000000000000000000000000000815260ff91821660048201529088166024820152604401610aab565b60cc5460ff90811690881611156115045760cc805460ff191660ff89161790556000829003611504576040517f88bc3fe700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b038616600090815260cb6020908152604080832054835260ca9091529020805460ff16158015906115435750805460ff898116911614155b1561159f5780546040517fff9f367400000000000000000000000000000000000000000000000000000000815260ff8216600482015261010090910461ffff1660248201526001600160a01b0388166044820152606401610aab565b60ff8816600090815260c960205260408120805482906115c29061ffff16612d4d565b91906101000a81548161ffff021916908361ffff16021790559050600060405180604001604052808b60ff1681526020018361ffff168152509050600061160882611cf5565b905060405180606001604052808381526020018b6001600160a01b031681526020018a8a8080601f016020809104026020016040519081016040528093929190818152602001838380828437600092018290525093909452505083815260ca60209081526040918290208451805182549184015161ffff16610100027fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000090921660ff90911617178155908401516001820180546001600160a01b0390921673ffffffffffffffffffffffffffffffffffffffff199092169190911790559083015190915060028201906116fb9082612dbc565b5050506001600160a01b038a16600081815260cb602052604090819020839055517feb4bce5025c5200f6a074dd28fe7754955dfdca0eb2dcbaa16ccc292655e66699061174f908e9087908e908e90612e7c565b60405180910390a28515611799577f8ff94c32efcef376eb02508cba5536e0634c1d6ad4b51ffa0f7306c78edaf5f78b888860405161179093929190612bda565b60405180910390a15b5050505050505050505050565b6117e93033836000368080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152506106c592505050565b610bb0576040517f1e09743f00000000000000000000000000000000000000000000000000000000815230600482015233602482015260448101829052606401610aab565b6001600160a01b03838116148061184d57506001600160a01b03828116145b15611884576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e830152605280830185905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316806106be57600082815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916600290811790915582516001600160a01b0389811682529281019190915290861691339186917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a45050505050565b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e830152605280830185905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316156111cf57600081815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916905590516001600160a01b038681168252851691339185917f3ca48185ec3f6e47e24db18b13f1c65b1ce05da1659f9c1c4fe717dda5f67524910160405180910390a450505050565b6040517f2675fdd00000000000000000000000000000000000000000000000000000000081526000906001600160a01b03871690632675fdd090611ac9908890889088908890600401612ea3565b602060405180830381865afa925050508015611b02575060408051601f3d908101601f19168201909252611aff91810190612ed5565b60015b15611b19578015611b17576001915050611b1d565b505b5060005b95945050505050565b7f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b610d3d816117a6565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff1615611b8857611b8383612196565b505050565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015611be2575060408051601f3d908101601f19168201909252611bdf91810190612ef7565b60015b611c545760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f7420555550530000000000000000000000000000000000006064820152608401610aab565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc8114611ce95760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c655555494400000000000000000000000000000000000000000000006064820152608401610aab565b50611b83838383612261565b600081600001518260200151604051602001611d6792919060f89290921b7fff0000000000000000000000000000000000000000000000000000000000000016825260f01b7fffff00000000000000000000000000000000000000000000000000000000000016600182015260030190565b604051602081830303815290604052805190602001209050919050565b600054610100900460ff16611e015760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610aab565b610bb081612286565b806001600160a01b0381163b611e57576040517f48359af60000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610aab565b6040516301ffc9a760e01b81527f2675fdd00000000000000000000000000000000000000000000000000000000060048201526001600160a01b038216906301ffc9a790602401602060405180830381865afa158015611ebb573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611edf9190612ed5565b611f20576040517f740b71160000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610aab565b6001600160a01b03858116148015611f4057506001600160a01b03848116145b15611f77576040517f85f1ba9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b038581161480611f9657506001600160a01b03848116145b15611ffe577f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33831480611fc7575060005b15611ffe576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088811b8216602a85015289901b16603e830152605280830187905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316806120fc57600082815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0387811691821790925583518b8316815292830152881691339188917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a4612171565b826001600160a01b0316816001600160a01b031614612171576040517f0b98789e0000000000000000000000000000000000000000000000000000000081526001600160a01b03808916600483015280881660248301526044820187905280831660648301528416608482015260a401610aab565b50505050505050565b6000612185836122b1565b801561126c575061126c83836122fc565b6001600160a01b0381163b6122135760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e7472616374000000000000000000000000000000000000006064820152608401610aab565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b61226a836123b2565b6000825111806122775750805b15611b83576111cf83836123f2565b610bb030827f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361182e565b60006122c4826301ffc9a760e01b6122fc565b80156105a357506122f5827fffffffff000000000000000000000000000000000000000000000000000000006122fc565b1592915050565b604080517fffffffff000000000000000000000000000000000000000000000000000000008316602480830191909152825180830390910181526044909101909152602080820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff166301ffc9a760e01b178152825160009392849283928392918391908a617530fa92503d9150600051905082801561239b575060208210155b80156123a75750600081115b979650505050505050565b6123bb81612196565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b606061126c8383604051806060016040528060278152602001612f40602791396060600080856001600160a01b03168560405161242f9190612f10565b600060405180830381855af49150503d806000811461246a576040519150601f19603f3d011682016040523d82523d6000602084013e61246f565b606091505b50915091506124808683838761248a565b9695505050505050565b606083156124f95782516000036124f2576001600160a01b0385163b6124f25760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e74726163740000006044820152606401610aab565b50816108b9565b6108b9838381511561250e5781518083602001fd5b8060405162461bcd60e51b8152600401610aab9190612f2c565b60405180606001604052806003906020820280368337509192915050565b60006020828403121561255857600080fd5b81357fffffffff000000000000000000000000000000000000000000000000000000008116811461126c57600080fd5b6001600160a01b0381168114610bb057600080fd5b6000806000604084860312156125b257600080fd5b83356125bd81612588565b9250602084013567ffffffffffffffff808211156125da57600080fd5b818601915086601f8301126125ee57600080fd5b8135818111156125fd57600080fd5b87602060608302850101111561261257600080fd5b6020830194508093505050509250925092565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261264c57600080fd5b813567ffffffffffffffff8082111561266757612667612625565b604051601f8301601f19908116603f0116810190828211818310171561268f5761268f612625565b816040528381528660208588010111156126a857600080fd5b836020870160208301376000602085830101528094505050505092915050565b600080600080608085870312156126de57600080fd5b84356126e981612588565b935060208501356126f981612588565b925060408501359150606085013567ffffffffffffffff81111561271c57600080fd5b6127288782880161263b565b91505092959194509250565b803560ff8116811461274557600080fd5b919050565b60008083601f84011261275c57600080fd5b50813567ffffffffffffffff81111561277457600080fd5b60208301915083602082850101111561278c57600080fd5b9250929050565b6000806000604084860312156127a857600080fd5b6127b184612734565b9250602084013567ffffffffffffffff8111156127cd57600080fd5b6127d98682870161274a565b9497909650939450505050565b60608101818360005b600381101561281157815160ff168352602092830192909101906001016127ef565b50505092915050565b60006020828403121561282c57600080fd5b813561126c81612588565b6000806040838503121561284a57600080fd5b823561285581612588565b9150602083013567ffffffffffffffff81111561287157600080fd5b61287d8582860161263b565b9150509250929050565b60005b838110156128a257818101518382015260200161288a565b50506000910152565b600081518084526128c3816020860160208601612887565b601f01601f19169290920160200192915050565b602081526000825160ff815116602084015261ffff6020820151166040840152506001600160a01b03602084015116606083015260408301516080808401526108b960a08401826128ab565b60006020828403121561293557600080fd5b5035919050565b60006040828403121561294e57600080fd5b50919050565b6000806000806080858703121561296a57600080fd5b843561297581612588565b9350602085013561298581612588565b925060408501359150606085013561299c81612588565b939692955090935050565b6000806000606084860312156129bc57600080fd5b83356129c781612588565b925060208401356129d781612588565b929592945050506040919091013590565b6000602082840312156129fa57600080fd5b61126c82612734565b60008060208385031215612a1657600080fd5b823567ffffffffffffffff80821115612a2e57600080fd5b818501915085601f830112612a4257600080fd5b813581811115612a5157600080fd5b86602060a083028501011115612a6657600080fd5b60209290920196919550909350505050565b60008060008060008060808789031215612a9157600080fd5b612a9a87612734565b95506020870135612aaa81612588565b9450604087013567ffffffffffffffff80821115612ac757600080fd5b612ad38a838b0161274a565b90965094506060890135915080821115612aec57600080fd5b50612af989828a0161274a565b979a9699509497509295939492505050565b634e487b7160e01b600052603260045260246000fd5b80356003811061274557600080fd5b600060608284031215612b4257600080fd5b6040516060810181811067ffffffffffffffff82111715612b6557612b65612625565b604052612b7183612b21565b81526020830135612b8181612588565b60208201526040928301359281019290925250919050565b634e487b7160e01b600052602160045260246000fd5b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60ff84168152604060208201526000611b1d604083018486612baf565b600181811c90821680612c0b57607f821691505b60208210810361294e57634e487b7160e01b600052602260045260246000fd5b600060408284031215612c3d57600080fd5b6040516040810181811067ffffffffffffffff82111715612c6057612c60612625565b604052612c6c83612734565b8152602083013561ffff81168114612c8357600080fd5b60208201529392505050565b600060a08284031215612ca157600080fd5b60405160a0810181811067ffffffffffffffff82111715612cc457612cc4612625565b604052612cd083612b21565b81526020830135612ce081612588565b60208201526040830135612cf381612588565b60408201526060830135612d0681612588565b60608201526080928301359281019290925250919050565b634e487b7160e01b600052601160045260246000fd5b60ff82811682821603908111156105a3576105a3612d1e565b600061ffff808316818103612d6457612d64612d1e565b6001019392505050565b601f821115611b8357600081815260208120601f850160051c81016020861015612d955750805b601f850160051c820191505b81811015612db457828155600101612da1565b505050505050565b815167ffffffffffffffff811115612dd657612dd6612625565b612dea81612de48454612bf7565b84612d6e565b602080601f831160018114612e1f5760008415612e075750858301515b600019600386901b1c1916600185901b178555612db4565b600085815260208120601f198616915b82811015612e4e57888601518255948401946001909101908401612e2f565b5085821015612e6c5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b60ff8516815261ffff84166020820152606060408201526000612480606083018486612baf565b60006001600160a01b0380871683528086166020840152508360408301526080606083015261248060808301846128ab565b600060208284031215612ee757600080fd5b8151801515811461126c57600080fd5b600060208284031215612f0957600080fd5b5051919050565b60008251612f22818460208701612887565b9190910192915050565b60208152600061126c60208301846128ab56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a2646970667358221220dbc31212c0aa42b48c0d141517f578c0c0b41c30d3ce80361a8b667cc6cd18c264736f6c63430008110033',
  deployedBytecode:
    '0x6080604052600436106101805760003560e01c80639aaf9f08116100d6578063d68bad2c1161007f578063e0589bd311610059578063e0589bd31461047d578063e978afe51461049d578063fc054427146104bd57600080fd5b8063d68bad2c14610409578063d96054c414610429578063df1d6c441461044957600080fd5b8063c4d66de8116100b0578063c4d66de814610395578063c9dbc2a4146103b5578063cc98b8f5146103d557600080fd5b80639aaf9f08146103215780639af3e90914610341578063afe5eb781461036157600080fd5b80632ae9c6001161013857806350abe9101161011257806350abe910146102b357806352d1902d146102e05780637be0ca5e146102f557600080fd5b80632ae9c6001461025e5780633659cfe6146102805780634f1ef286146102a057600080fd5b806322844d041161016957806322844d04146101fc5780632675fdd01461021e57806328375f671461023e57600080fd5b806301ffc9a71461018557806309e56b14146101ba575b600080fd5b34801561019157600080fd5b506101a56101a0366004612546565b6104dd565b60405190151581526020015b60405180910390f35b3480156101c657600080fd5b506101ee7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3381565b6040519081526020016101b1565b34801561020857600080fd5b5061021c61021736600461259d565b6105a9565b005b34801561022a57600080fd5b506101a56102393660046126c8565b6106c5565b34801561024a57600080fd5b5061021c610259366004612793565b6108c1565b34801561026a57600080fd5b506102736109e7565b6040516101b191906127e6565b34801561028c57600080fd5b5061021c61029b36600461281a565b610a11565b61021c6102ae366004612837565b610bb3565b3480156102bf57600080fd5b506102d36102ce36600461281a565b610d41565b6040516101b191906128d7565b3480156102ec57600080fd5b506101ee610d8b565b34801561030157600080fd5b5060cc5461030f9060ff1681565b60405160ff90911681526020016101b1565b34801561032d57600080fd5b506102d361033c366004612923565b610e50565b34801561034d57600080fd5b506102d361035c36600461293c565b610fa7565b34801561036d57600080fd5b506101ee7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea81565b3480156103a157600080fd5b5061021c6103b036600461281a565b610fed565b3480156103c157600080fd5b5061021c6103d0366004612954565b611164565b3480156103e157600080fd5b506101ee7f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b81565b34801561041557600080fd5b5061021c6104243660046129a7565b61119a565b34801561043557600080fd5b5061021c6104443660046129a7565b6111d5565b34801561045557600080fd5b506101ee6104643660046129e8565b60ff16600090815260c9602052604090205461ffff1690565b34801561048957600080fd5b506102d36104983660046129e8565b61120a565b3480156104a957600080fd5b5061021c6104b8366004612a03565b611273565b3480156104c957600080fd5b5061021c6104d8366004612a78565b61137a565b60007fffffffff0000000000000000000000000000000000000000000000000000000082167fd4321b4000000000000000000000000000000000000000000000000000000000148061057057507fffffffff0000000000000000000000000000000000000000000000000000000082167f2ae9c60000000000000000000000000000000000000000000000000000000000145b806105a357506301ffc9a760e01b7fffffffff000000000000000000000000000000000000000000000000000000008316145b92915050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336105d3816117a6565b60005b828110156106be5760008484838181106105f2576105f2612b0b565b9050606002018036038101906106089190612b30565b905060008151600281111561061f5761061f612b99565b0361063c57610637868260200151836040015161182e565b6106b5565b60018151600281111561065157610651612b99565b03610669576106378682602001518360400151611987565b60028151600281111561067e5761067e612b99565b036106b5576040517fd4d3bef700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b506001016105d6565b5050505050565b60008060976000610737888888604051692822a926a4a9a9a4a7a760b11b60208201526bffffffffffffffffffffffff19606084811b8216602a84015285901b16603e820152605281018290526000906072016040516020818303038152906040528051906020012090509392505050565b81526020810191909152604001600020546001600160a01b031690507ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe81016107845760019150506108b9565b6001600160a01b038116156107a8576107a08187878787611a7b565b9150506108b9565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19602a8301819052606089901b16603e830152605280830187905283518084039091018152607290920183528151918101919091206000908152609790915220546001600160a01b0316801561082e576107a08187878787611a7b565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088901b8116602a840152603e830152605280830187905283518084039091018152607290920183528151918101919091206000908152609790915220546001600160a01b031680156108b3576107a08187878787611a7b565b50600090505b949350505050565b7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea6108eb816117a6565b8360ff16600003610928576040517f76f52ffa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60cc5460ff908116908516111561096b576040517f11c6e3ab00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008290036109a6576040517f88bc3fe700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b7f8ff94c32efcef376eb02508cba5536e0634c1d6ad4b51ffa0f7306c78edaf5f78484846040516109d993929190612bda565b60405180910390a150505050565b6109ef612528565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610ab45760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084015b60405180910390fd5b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610b0f7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610b8b5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610aab565b610b9481611b26565b60408051600080825260208201909252610bb091839190611b50565b50565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610c515760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610aab565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610cac7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610d285760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610aab565b610d3182611b26565b610d3d82826001611b50565b5050565b6040805160a081018252600060608083018281526080840183905283526020808401839052838501919091526001600160a01b038516825260cb905291909120546105a390610e50565b6000306001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001614610e2b5760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c00000000000000006064820152608401610aab565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b6040805160a0810182526000606080830182815260808401839052835260208084018390528385019190915284825260ca905291822080549192909160ff169003610eca576040517f8d0aeeb100000000000000000000000000000000000000000000000000000000815260048101849052602401610aab565b6040805160a081018252825460ff81166060830190815261010090910461ffff166080830152815260018301546001600160a01b03166020820152600283018054919284929084019190610f1d90612bf7565b80601f0160208091040260200160405190810160405280929190818152602001828054610f4990612bf7565b8015610f965780601f10610f6b57610100808354040283529160200191610f96565b820191906000526020600020905b815481529060010190602001808311610f7957829003601f168201915b505050505081525050915050919050565b6040805160a081018252600060608083018281526080840183905283526020830191909152918101919091526105a361033c610fe836859003850185612c2b565b611cf5565b600054610100900460ff161580801561100d5750600054600160ff909116105b806110275750303b158015611027575060005460ff166001145b6110995760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a65640000000000000000000000000000000000006064820152608401610aab565b6000805460ff1916600117905580156110bc576000805461ff0019166101001790555b6110c582611d84565b6110f030837fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea61182e565b61111b30837f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b61182e565b8015610d3d576000805461ff0019169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361118e816117a6565b6106be85858585611e0a565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336111c4816117a6565b6111cf84848461182e565b50505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336111ff816117a6565b6111cf848484611987565b6040805160a0810182526000606080830182815260808401839052835260208084018390528385019190915260ff851680835260c982529184902054845180860190955291845261ffff909116908301819052909161126c9061033c90611cf5565b9392505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361129d816117a6565b60005b828110156111cf5760008484838181106112bc576112bc612b0b565b905060a002018036038101906112d29190612c8f565b90506000815160028111156112e9576112e9612b99565b0361130a5761130581602001518260400151836080015161182e565b611371565b60018151600281111561131f5761131f612b99565b0361133b57611305816020015182604001518360800151611987565b60028151600281111561135057611350612b99565b03611371576113718160200151826040015183608001518460600151611e0a565b506001016112a0565b7fa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea6113a4816117a6565b6113d76001600160a01b0387167f99718b500000000000000000000000000000000000000000000000000000000061217a565b61140d576040517f9d145ceb00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8660ff1660000361144a576040517f76f52ffa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60cc5460019061145d9060ff1689612d34565b60ff1611156114a95760cc546040517f53db7b7b00000000000000000000000000000000000000000000000000000000815260ff91821660048201529088166024820152604401610aab565b60cc5460ff90811690881611156115045760cc805460ff191660ff89161790556000829003611504576040517f88bc3fe700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b038616600090815260cb6020908152604080832054835260ca9091529020805460ff16158015906115435750805460ff898116911614155b1561159f5780546040517fff9f367400000000000000000000000000000000000000000000000000000000815260ff8216600482015261010090910461ffff1660248201526001600160a01b0388166044820152606401610aab565b60ff8816600090815260c960205260408120805482906115c29061ffff16612d4d565b91906101000a81548161ffff021916908361ffff16021790559050600060405180604001604052808b60ff1681526020018361ffff168152509050600061160882611cf5565b905060405180606001604052808381526020018b6001600160a01b031681526020018a8a8080601f016020809104026020016040519081016040528093929190818152602001838380828437600092018290525093909452505083815260ca60209081526040918290208451805182549184015161ffff16610100027fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000090921660ff90911617178155908401516001820180546001600160a01b0390921673ffffffffffffffffffffffffffffffffffffffff199092169190911790559083015190915060028201906116fb9082612dbc565b5050506001600160a01b038a16600081815260cb602052604090819020839055517feb4bce5025c5200f6a074dd28fe7754955dfdca0eb2dcbaa16ccc292655e66699061174f908e9087908e908e90612e7c565b60405180910390a28515611799577f8ff94c32efcef376eb02508cba5536e0634c1d6ad4b51ffa0f7306c78edaf5f78b888860405161179093929190612bda565b60405180910390a15b5050505050505050505050565b6117e93033836000368080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152506106c592505050565b610bb0576040517f1e09743f00000000000000000000000000000000000000000000000000000000815230600482015233602482015260448101829052606401610aab565b6001600160a01b03838116148061184d57506001600160a01b03828116145b15611884576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e830152605280830185905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316806106be57600082815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916600290811790915582516001600160a01b0389811682529281019190915290861691339186917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a45050505050565b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e830152605280830185905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316156111cf57600081815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916905590516001600160a01b038681168252851691339185917f3ca48185ec3f6e47e24db18b13f1c65b1ce05da1659f9c1c4fe717dda5f67524910160405180910390a450505050565b6040517f2675fdd00000000000000000000000000000000000000000000000000000000081526000906001600160a01b03871690632675fdd090611ac9908890889088908890600401612ea3565b602060405180830381865afa925050508015611b02575060408051601f3d908101601f19168201909252611aff91810190612ed5565b60015b15611b19578015611b17576001915050611b1d565b505b5060005b95945050505050565b7f5aa4f06bdc18535eff05128093a2315c2c960a2722e20021cbff28da04760f5b610d3d816117a6565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff1615611b8857611b8383612196565b505050565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015611be2575060408051601f3d908101601f19168201909252611bdf91810190612ef7565b60015b611c545760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f7420555550530000000000000000000000000000000000006064820152608401610aab565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc8114611ce95760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c655555494400000000000000000000000000000000000000000000006064820152608401610aab565b50611b83838383612261565b600081600001518260200151604051602001611d6792919060f89290921b7fff0000000000000000000000000000000000000000000000000000000000000016825260f01b7fffff00000000000000000000000000000000000000000000000000000000000016600182015260030190565b604051602081830303815290604052805190602001209050919050565b600054610100900460ff16611e015760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610aab565b610bb081612286565b806001600160a01b0381163b611e57576040517f48359af60000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610aab565b6040516301ffc9a760e01b81527f2675fdd00000000000000000000000000000000000000000000000000000000060048201526001600160a01b038216906301ffc9a790602401602060405180830381865afa158015611ebb573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611edf9190612ed5565b611f20576040517f740b71160000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610aab565b6001600160a01b03858116148015611f4057506001600160a01b03848116145b15611f77576040517f85f1ba9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b038581161480611f9657506001600160a01b03848116145b15611ffe577f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33831480611fc7575060005b15611ffe576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088811b8216602a85015289901b16603e830152605280830187905283518084039091018152607290920190925280519101206000906000818152609760205260409020549091506001600160a01b0316806120fc57600082815260976020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0387811691821790925583518b8316815292830152881691339188917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a4612171565b826001600160a01b0316816001600160a01b031614612171576040517f0b98789e0000000000000000000000000000000000000000000000000000000081526001600160a01b03808916600483015280881660248301526044820187905280831660648301528416608482015260a401610aab565b50505050505050565b6000612185836122b1565b801561126c575061126c83836122fc565b6001600160a01b0381163b6122135760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e7472616374000000000000000000000000000000000000006064820152608401610aab565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b61226a836123b2565b6000825111806122775750805b15611b83576111cf83836123f2565b610bb030827f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361182e565b60006122c4826301ffc9a760e01b6122fc565b80156105a357506122f5827fffffffff000000000000000000000000000000000000000000000000000000006122fc565b1592915050565b604080517fffffffff000000000000000000000000000000000000000000000000000000008316602480830191909152825180830390910181526044909101909152602080820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff166301ffc9a760e01b178152825160009392849283928392918391908a617530fa92503d9150600051905082801561239b575060208210155b80156123a75750600081115b979650505050505050565b6123bb81612196565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b606061126c8383604051806060016040528060278152602001612f40602791396060600080856001600160a01b03168560405161242f9190612f10565b600060405180830381855af49150503d806000811461246a576040519150601f19603f3d011682016040523d82523d6000602084013e61246f565b606091505b50915091506124808683838761248a565b9695505050505050565b606083156124f95782516000036124f2576001600160a01b0385163b6124f25760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e74726163740000006044820152606401610aab565b50816108b9565b6108b9838381511561250e5781518083602001fd5b8060405162461bcd60e51b8152600401610aab9190612f2c565b60405180606001604052806003906020820280368337509192915050565b60006020828403121561255857600080fd5b81357fffffffff000000000000000000000000000000000000000000000000000000008116811461126c57600080fd5b6001600160a01b0381168114610bb057600080fd5b6000806000604084860312156125b257600080fd5b83356125bd81612588565b9250602084013567ffffffffffffffff808211156125da57600080fd5b818601915086601f8301126125ee57600080fd5b8135818111156125fd57600080fd5b87602060608302850101111561261257600080fd5b6020830194508093505050509250925092565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261264c57600080fd5b813567ffffffffffffffff8082111561266757612667612625565b604051601f8301601f19908116603f0116810190828211818310171561268f5761268f612625565b816040528381528660208588010111156126a857600080fd5b836020870160208301376000602085830101528094505050505092915050565b600080600080608085870312156126de57600080fd5b84356126e981612588565b935060208501356126f981612588565b925060408501359150606085013567ffffffffffffffff81111561271c57600080fd5b6127288782880161263b565b91505092959194509250565b803560ff8116811461274557600080fd5b919050565b60008083601f84011261275c57600080fd5b50813567ffffffffffffffff81111561277457600080fd5b60208301915083602082850101111561278c57600080fd5b9250929050565b6000806000604084860312156127a857600080fd5b6127b184612734565b9250602084013567ffffffffffffffff8111156127cd57600080fd5b6127d98682870161274a565b9497909650939450505050565b60608101818360005b600381101561281157815160ff168352602092830192909101906001016127ef565b50505092915050565b60006020828403121561282c57600080fd5b813561126c81612588565b6000806040838503121561284a57600080fd5b823561285581612588565b9150602083013567ffffffffffffffff81111561287157600080fd5b61287d8582860161263b565b9150509250929050565b60005b838110156128a257818101518382015260200161288a565b50506000910152565b600081518084526128c3816020860160208601612887565b601f01601f19169290920160200192915050565b602081526000825160ff815116602084015261ffff6020820151166040840152506001600160a01b03602084015116606083015260408301516080808401526108b960a08401826128ab565b60006020828403121561293557600080fd5b5035919050565b60006040828403121561294e57600080fd5b50919050565b6000806000806080858703121561296a57600080fd5b843561297581612588565b9350602085013561298581612588565b925060408501359150606085013561299c81612588565b939692955090935050565b6000806000606084860312156129bc57600080fd5b83356129c781612588565b925060208401356129d781612588565b929592945050506040919091013590565b6000602082840312156129fa57600080fd5b61126c82612734565b60008060208385031215612a1657600080fd5b823567ffffffffffffffff80821115612a2e57600080fd5b818501915085601f830112612a4257600080fd5b813581811115612a5157600080fd5b86602060a083028501011115612a6657600080fd5b60209290920196919550909350505050565b60008060008060008060808789031215612a9157600080fd5b612a9a87612734565b95506020870135612aaa81612588565b9450604087013567ffffffffffffffff80821115612ac757600080fd5b612ad38a838b0161274a565b90965094506060890135915080821115612aec57600080fd5b50612af989828a0161274a565b979a9699509497509295939492505050565b634e487b7160e01b600052603260045260246000fd5b80356003811061274557600080fd5b600060608284031215612b4257600080fd5b6040516060810181811067ffffffffffffffff82111715612b6557612b65612625565b604052612b7183612b21565b81526020830135612b8181612588565b60208201526040928301359281019290925250919050565b634e487b7160e01b600052602160045260246000fd5b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60ff84168152604060208201526000611b1d604083018486612baf565b600181811c90821680612c0b57607f821691505b60208210810361294e57634e487b7160e01b600052602260045260246000fd5b600060408284031215612c3d57600080fd5b6040516040810181811067ffffffffffffffff82111715612c6057612c60612625565b604052612c6c83612734565b8152602083013561ffff81168114612c8357600080fd5b60208201529392505050565b600060a08284031215612ca157600080fd5b60405160a0810181811067ffffffffffffffff82111715612cc457612cc4612625565b604052612cd083612b21565b81526020830135612ce081612588565b60208201526040830135612cf381612588565b60408201526060830135612d0681612588565b60608201526080928301359281019290925250919050565b634e487b7160e01b600052601160045260246000fd5b60ff82811682821603908111156105a3576105a3612d1e565b600061ffff808316818103612d6457612d64612d1e565b6001019392505050565b601f821115611b8357600081815260208120601f850160051c81016020861015612d955750805b601f850160051c820191505b81811015612db457828155600101612da1565b505050505050565b815167ffffffffffffffff811115612dd657612dd6612625565b612dea81612de48454612bf7565b84612d6e565b602080601f831160018114612e1f5760008415612e075750858301515b600019600386901b1c1916600185901b178555612db4565b600085815260208120601f198616915b82811015612e4e57888601518255948401946001909101908401612e2f565b5085821015612e6c5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b60ff8516815261ffff84166020820152606060408201526000612480606083018486612baf565b60006001600160a01b0380871683528086166020840152508360408301526080606083015261248060808301846128ab565b600060208284031215612ee757600080fd5b8151801515811461126c57600080fd5b600060208284031215612f0957600080fd5b5051919050565b60008251612f22818460208701612887565b9190910192915050565b60208152600061126c60208301846128ab56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a2646970667358221220dbc31212c0aa42b48c0d141517f578c0c0b41c30d3ce80361a8b667cc6cd18c264736f6c63430008110033',
  linkReferences: {},
  deployedLinkReferences: {},
}
