export const DAO = {
  _format: 'hh-sol-artifact-1',
  contractName: 'DAO',
  sourceName: 'src/core/dao/DAO.sol',
  abi: [
    {
      inputs: [],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'index',
          type: 'uint256',
        },
      ],
      name: 'ActionFailed',
      type: 'error',
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
      name: 'FunctionRemoved',
      type: 'error',
    },
    {
      inputs: [],
      name: 'GrantWithConditionNotSupported',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InsufficientGas',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'expected',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'actual',
          type: 'uint256',
        },
      ],
      name: 'NativeTokenDepositAmountMismatch',
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
          internalType: 'uint8[3]',
          name: 'protocolVersion',
          type: 'uint8[3]',
        },
      ],
      name: 'ProtocolVersionUpgradeNotSupported',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ReentrantCall',
      type: 'error',
    },
    {
      inputs: [],
      name: 'TooManyActions',
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
          internalType: 'bytes4',
          name: 'callbackSelector',
          type: 'bytes4',
        },
        {
          internalType: 'bytes4',
          name: 'magicNumber',
          type: 'bytes4',
        },
      ],
      name: 'UnkownCallback',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ZeroAmount',
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
          indexed: false,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'bytes4',
          name: 'sig',
          type: 'bytes4',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'data',
          type: 'bytes',
        },
      ],
      name: 'CallbackReceived',
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
          name: 'token',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'string',
          name: '_reference',
          type: 'string',
        },
      ],
      name: 'Deposited',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'actor',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'callId',
          type: 'bytes32',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'to',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'value',
              type: 'uint256',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'allowFailureMap',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'failureMap',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes[]',
          name: 'execResults',
          type: 'bytes[]',
        },
      ],
      name: 'Executed',
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
          internalType: 'bytes',
          name: 'metadata',
          type: 'bytes',
        },
      ],
      name: 'MetadataSet',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'NativeTokenDeposited',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'string',
          name: 'daoURI',
          type: 'string',
        },
      ],
      name: 'NewURI',
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
          indexed: false,
          internalType: 'bytes4',
          name: 'interfaceId',
          type: 'bytes4',
        },
        {
          indexed: false,
          internalType: 'bytes4',
          name: 'callbackSelector',
          type: 'bytes4',
        },
        {
          indexed: false,
          internalType: 'bytes4',
          name: 'magicNumber',
          type: 'bytes4',
        },
      ],
      name: 'StandardCallbackRegistered',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'forwarder',
          type: 'address',
        },
      ],
      name: 'TrustedForwarderSet',
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
      stateMutability: 'nonpayable',
      type: 'fallback',
    },
    {
      inputs: [],
      name: 'EXECUTE_PERMISSION_ID',
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
      name: 'REGISTER_STANDARD_CALLBACK_PERMISSION_ID',
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
      name: 'SET_METADATA_PERMISSION_ID',
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
      name: 'SET_TRUSTED_FORWARDER_PERMISSION_ID',
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
      name: 'UPGRADE_DAO_PERMISSION_ID',
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
      name: 'VALIDATE_SIGNATURE_PERMISSION_ID',
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
      inputs: [],
      name: 'daoURI',
      outputs: [
        {
          internalType: 'string',
          name: '',
          type: 'string',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_token',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: '_amount',
          type: 'uint256',
        },
        {
          internalType: 'string',
          name: '_reference',
          type: 'string',
        },
      ],
      name: 'deposit',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: '_callId',
          type: 'bytes32',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'to',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'value',
              type: 'uint256',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          internalType: 'struct IDAO.Action[]',
          name: '_actions',
          type: 'tuple[]',
        },
        {
          internalType: 'uint256',
          name: '_allowFailureMap',
          type: 'uint256',
        },
      ],
      name: 'execute',
      outputs: [
        {
          internalType: 'bytes[]',
          name: 'execResults',
          type: 'bytes[]',
        },
        {
          internalType: 'uint256',
          name: 'failureMap',
          type: 'uint256',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getTrustedForwarder',
      outputs: [
        {
          internalType: 'address',
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
      name: 'hasPermission',
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
          internalType: 'bytes',
          name: '_metadata',
          type: 'bytes',
        },
        {
          internalType: 'address',
          name: '_initialOwner',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_trustedForwarder',
          type: 'address',
        },
        {
          internalType: 'string',
          name: 'daoURI_',
          type: 'string',
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
          internalType: 'uint8[3]',
          name: '_previousProtocolVersion',
          type: 'uint8[3]',
        },
        {
          internalType: 'bytes',
          name: '_initData',
          type: 'bytes',
        },
      ],
      name: 'initializeFrom',
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
      inputs: [
        {
          internalType: 'bytes32',
          name: '_hash',
          type: 'bytes32',
        },
        {
          internalType: 'bytes',
          name: '_signature',
          type: 'bytes',
        },
      ],
      name: 'isValidSignature',
      outputs: [
        {
          internalType: 'bytes4',
          name: '',
          type: 'bytes4',
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
          internalType: 'bytes4',
          name: '_interfaceId',
          type: 'bytes4',
        },
        {
          internalType: 'bytes4',
          name: '_callbackSelector',
          type: 'bytes4',
        },
        {
          internalType: 'bytes4',
          name: '_magicNumber',
          type: 'bytes4',
        },
      ],
      name: 'registerStandardCallback',
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
      ],
      name: 'revoke',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'string',
          name: 'newDaoURI',
          type: 'string',
        },
      ],
      name: 'setDaoURI',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes',
          name: '_metadata',
          type: 'bytes',
        },
      ],
      name: 'setMetadata',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      name: 'setSignatureValidator',
      outputs: [],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_newTrustedForwarder',
          type: 'address',
        },
      ],
      name: 'setTrustedForwarder',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'bytes4',
          name: 'interfaceId',
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
    {
      stateMutability: 'payable',
      type: 'receive',
    },
  ],
  bytecode:
    '0x60a0604052306080523480156200001557600080fd5b506200002062000026565b620000e7565b600054610100900460ff1615620000935760405162461bcd60e51b815260206004820152602760248201527f496e697469616c697a61626c653a20636f6e747261637420697320696e697469604482015266616c697a696e6760c81b606482015260840160405180910390fd5b60005460ff90811614620000e5576000805460ff191660ff9081179091556040519081527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b565b608051613c2c6200011f60003960008181610c8c01528181610d220152818161108c01528181611122015261121d0152613c2c6000f3fe6080604052600436106101dc5760003560e01c806352d1902d11610102578063d68bad2c11610095578063e978afe511610064578063e978afe5146106d0578063eafb8b06146106f0578063ee57e36f14610710578063fdef9106146107305761021b565b8063d68bad2c1461063c578063d96054c41461065c578063da7422281461067c578063e306bee71461069c5761021b565b8063c4a50145116100d1578063c4a50145146105a5578063c71bf324146105c5578063c9dbc2a4146105f3578063ce1b815f146106135761021b565b806352d1902d146105275780637034731b1461053c578063829331a11461055e578063bfe07da6146105925761021b565b80632675fdd01161017a5780633e2ab0d9116101495780633e2ab0d9146104a057806342d8e99e146104c05780634ec7ac23146104e05780634f1ef286146105145761021b565b80632675fdd01461040a57806326875b1f1461042a5780632ae9c6001461045e5780633659cfe6146104805761021b565b80631080f99b116101b65780631080f99b1461035b5780631626ba7e1461037d57806322844d04146103b657806324b4d73f146103d65761021b565b806301ffc9a7146102b05780630729d054146102e557806309e56b14146103275761021b565b3661021b57604080513381523460208201527f62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3910160405180910390a1005b34801561022757600080fd5b506000366060600061027b6000356001600160e01b03191685858080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061075092505050565b604080516001600160e01b03198316602082015291925001604051602081830303815290604052915050915050805190602001f35b3480156102bc57600080fd5b506102d06102cb366004612f01565b610827565b60405190151581526020015b60405180910390f35b3480156102f157600080fd5b506103197fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d81565b6040519081526020016102dc565b34801561033357600080fd5b506103197f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3381565b34801561036757600080fd5b5061037b610376366004612f65565b61087c565b005b34801561038957600080fd5b5061039d61039836600461304a565b6108b5565b6040516001600160e01b031990911681526020016102dc565b3480156103c257600080fd5b5061037b6103d13660046130a6565b610940565b3480156103e257600080fd5b506103197f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc81565b34801561041657600080fd5b506102d061042536600461312e565b610a5c565b34801561043657600080fd5b506103197ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc81565b34801561046a57600080fd5b50610473610c58565b6040516102dc919061319a565b34801561048c57600080fd5b5061037b61049b3660046131ce565b610c82565b3480156104ac57600080fd5b5061037b6104bb3660046131ce565b610e1f565b3480156104cc57600080fd5b5061037b6104db3660046131eb565b610e51565b3480156104ec57600080fd5b506103197f968c17ebf04aa1b7544168e69314cdab6b69ba813bb6080d49c0c40a65560f5881565b61037b610522366004613243565b611082565b34801561053357600080fd5b50610319611210565b34801561054857600080fd5b506105516112d5565b6040516102dc91906132cd565b34801561056a57600080fd5b506103197f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c81565b61037b6105a03660046132e0565b611368565b3480156105b157600080fd5b5061037b6105c036600461333c565b6114a2565b3480156105d157600080fd5b506105e56105e036600461337f565b61154c565b6040516102dc929190613459565b3480156105ff57600080fd5b5061037b61060e36600461347b565b611872565b34801561061f57600080fd5b5061012e546040516001600160a01b0390911681526020016102dc565b34801561064857600080fd5b5061037b6106573660046134ce565b6118a8565b34801561066857600080fd5b5061037b6106773660046134ce565b6118e3565b34801561068857600080fd5b5061037b6106973660046131ce565b611918565b3480156106a857600080fd5b506103197f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b81565b3480156106dc57600080fd5b5061037b6106eb36600461350f565b61194b565b3480156106fc57600080fd5b5061037b61070b366004613584565b611a52565b34801561071c57600080fd5b5061037b61072b366004612f65565b611c1c565b34801561073c57600080fd5b506102d061074b36600461312e565b611c50565b6001600160e01b0319808316600090815260fb6020526040812054909160e09190911b9081166107c5576040517f54bdcc3e0000000000000000000000000000000000000000000000000000000081526001600160e01b03198086166004830152821660248201526044015b60405180910390fd5b837bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19167f4792cb6e46e49876374bea490ba23274bacea6b84c216a64f47abab54027589b338560405161081692919061361d565b60405180910390a290505b92915050565b60007f01ffc9a7000000000000000000000000000000000000000000000000000000006001600160e01b0319831614806108215750506001600160e01b03191660009081526033602052604090205460ff1690565b7f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b6108a681611c67565b6108b08383611cef565b505050565b600061090430337f968c17ebf04aa1b7544168e69314cdab6b69ba813bb6080d49c0c40a65560f5886866040516020016108f092919061363f565b604051602081830303815290604052610a5c565b1561093057507f1626ba7e00000000000000000000000000000000000000000000000000000000610821565b506001600160e01b031992915050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361096a81611c67565b60005b82811015610a5557600084848381811061098957610989613658565b90506060020180360381019061099f919061367d565b90506000815160028111156109b6576109b66136e6565b036109d3576109ce8682602001518360400151611d3b565b610a4c565b6001815160028111156109e8576109e86136e6565b03610a00576109ce8682602001518360400151611e94565b600281516002811115610a1557610a156136e6565b03610a4c576040517fd4d3bef700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5060010161096d565b5050505050565b60008060c96000610ace888888604051692822a926a4a9a9a4a7a760b11b60208201526bffffffffffffffffffffffff19606084811b8216602a84015285901b16603e820152605281018290526000906072016040516020818303038152906040528051906020012090509392505050565b81526020810191909152604001600020546001600160a01b031690507ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe8101610b1b576001915050610c50565b6001600160a01b03811615610b3f57610b378187878787611f88565b915050610c50565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19602a8301819052606089901b16603e83015260528083018790528351808403909101815260729092018352815191810191909120600090815260c990915220546001600160a01b03168015610bc557610b378187878787611f88565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088901b8116602a840152603e83015260528083018790528351808403909101815260729092018352815191810191909120600090815260c990915220546001600160a01b03168015610c4a57610b378187878787611f88565b50600090505b949350505050565b610c60612ec6565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610d205760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084016107bc565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610d7b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610df75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f7879000000000000000000000000000000000000000060648201526084016107bc565b610e0081612032565b60408051600080825260208201909252610e1c9183919061205c565b50565b6040517fb2728e9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600054600390610100900460ff16158015610e73575060005460ff8083169116105b610ee55760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a656400000000000000000000000000000000000060648201526084016107bc565b6000805461ffff191660ff831617610100179055610f06602085018561370d565b60ff16600114610f4457836040517f84833d670000000000000000000000000000000000000000000000000000000081526004016107bc9190613728565b6040805160608082018352600182526003602083018190526000838501528351808301909452610f8d9391889190839083908082843760009201919091525091929150506121fc565b15610fc157600161013055610fc17f2ae9c60000000000000000000000000000000000000000000000000000000000612297565b60408051606080820183526001825260046020830152600082840152825180820190935261100a92908790600390839083908082843760009201919091525091929150506121fc565b1561103a5761103a30307f0dcbfb19b09fb8ff4e9af583d4b8e9c8127cc1b26529b4d96dd3b7e778088372611e94565b6000805461ff001916905560405160ff821681527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498906020015b60405180910390a150505050565b6001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001630036111205760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084016107bc565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031661117b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b0316146111f75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f7879000000000000000000000000000000000000000060648201526084016107bc565b61120082612032565b61120c8282600161205c565b5050565b6000306001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016146112b05760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c000000000000000060648201526084016107bc565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b606061012f80546112e59061375b565b80601f01602080910402602001604051908101604052809291908181526020018280546113119061375b565b801561135e5780601f106113335761010080835404028352916020019161135e565b820191906000526020600020905b81548152906001019060200180831161134157829003601f168201915b5050505050905090565b826000036113a2576040517f1f2a200500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b0384166113f7578234146113f2576040517f1abd5610000000000000000000000000000000000000000000000000000000008152600481018490523460248201526044016107bc565b61144d565b3415611438576040517f1abd5610000000000000000000000000000000000000000000000000000000008152600060048201523460248201526044016107bc565b61144d6001600160a01b038516333086612334565b836001600160a01b0316336001600160a01b03167f2bc500cf071be2d1c1458ed6ff484cd4db4345ada8943dee7ff29e7af3558f76858585604051611494939291906137c0565b60405180910390a350505050565b7ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc6114cc81611c67565b6114d584612297565b6001600160e01b03198316600090815260fb60205260409020805463ffffffff191660e084901c179055604080516001600160e01b0319808716825280861660208301528416918101919091527ffc72fd547553f7a663e0048e590afc9c47b56a4242e960f31cf4c62e23d308b990606001611074565b606060006002610130540361158d576040517f37ed32e800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6002610130557fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d6115bd81611c67565b6101008511156115f9576040517f11c763d600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8467ffffffffffffffff81111561161257611612612fa7565b60405190808252806020026020018201604052801561164557816020015b60608152602001906001900390816116305790505b50925060008060005b87811015611812575a92506000808a8a8481811061166e5761166e613658565b905060200281019061168091906137da565b61168e9060208101906131ce565b6001600160a01b03168b8b858181106116a9576116a9613658565b90506020028101906116bb91906137da565b602001358c8c868181106116d1576116d1613658565b90506020028101906116e391906137da565b6116f19060408101906137fa565b6040516116ff929190613841565b60006040518083038185875af1925050503d806000811461173c576040519150601f19603f3d011682016040523d82523d6000602084013e611741565b606091505b50915091505a9350600160ff84161b89166117955781611790576040517fa6a7dbbd000000000000000000000000000000000000000000000000000000008152600481018490526024016107bc565b6117ea565b816117ea576117a5604086613851565b8410156117de576040517f1c26714c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600160ff84161b871896505b808884815181106117fd576117fd613658565b6020908102919091010152505060010161164e565b50336001600160a01b03167fd4e57c2049f004fb297ef78591cd409503ceb6b2c722d7ffed032fc99e5f3b588a8a8a8a898b60405161185696959493929190613873565b60405180910390a2505060016101305550909590945092505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361189c81611c67565b610a55858585856123bc565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336118d281611c67565b6118dd848484611d3b565b50505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361190d81611c67565b6118dd848484611e94565b7f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c61194281611c67565b61120c8261274b565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361197581611c67565b60005b828110156118dd57600084848381811061199457611994613658565b905060a002018036038101906119aa919061399f565b90506000815160028111156119c1576119c16136e6565b036119e2576119dd816020015182604001518360800151611d3b565b611a49565b6001815160028111156119f7576119f76136e6565b03611a13576119dd816020015182604001518360800151611e94565b600281516002811115611a2857611a286136e6565b03611a4957611a4981602001518260400151836080015184606001516123bc565b50600101611978565b600054600390610100900460ff16158015611a74575060005460ff8083169116105b611ae65760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a656400000000000000000000000000000000000060648201526084016107bc565b6000805461ffff191660ff831617610100179055600161013055611b297f9385547e00000000000000000000000000000000000000000000000000000000612297565b611b527f1626ba7e00000000000000000000000000000000000000000000000000000000612297565b611b7b7f7034731b00000000000000000000000000000000000000000000000000000000612297565b611ba47f2ae9c60000000000000000000000000000000000000000000000000000000000612297565b611bac6127ad565b611bb687876128ba565b611bbf8461274b565b611bc98383611cef565b611bd2856128eb565b6000805461ff001916905560405160ff821681527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a150505050505050565b7f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b611c4681611c67565b6108b083836128ba565b6000611c5e85858585610a5c565b95945050505050565b611caa3033836000368080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250610a5c92505050565b610e1c576040517f1e09743f000000000000000000000000000000000000000000000000000000008152306004820152336024820152604481018290526064016107bc565b61012f611cfd828483613a7c565b507fe9b617ecb5f63f6a9ccd8d4d5fa0d7b2ef9b17ce3f48e6b135808d6a40e677428282604051611d2f929190613b3c565b60405180910390a15050565b6001600160a01b038381161480611d5a57506001600160a01b03828116145b15611d91576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e83015260528083018590528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b031680610a5557600082815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916600290811790915582516001600160a01b0389811682529281019190915290861691339186917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a45050505050565b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e83015260528083018590528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b0316156118dd57600081815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916905590516001600160a01b038681168252851691339185917f3ca48185ec3f6e47e24db18b13f1c65b1ce05da1659f9c1c4fe717dda5f67524910160405180910390a450505050565b6040517f2675fdd00000000000000000000000000000000000000000000000000000000081526000906001600160a01b03871690632675fdd090611fd6908890889088908890600401613b50565b602060405180830381865afa92505050801561200f575060408051601f3d908101601f1916820190925261200c91810190613b82565b60015b15612026578015612024576001915050611c5e565b505b50600095945050505050565b7f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc61120c81611c67565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff161561208f576108b083612971565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa9250505080156120e9575060408051601f3d908101601f191682019092526120e691810190613ba4565b60015b61215b5760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f74205555505300000000000000000000000000000000000060648201526084016107bc565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc81146121f05760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c6555554944000000000000000000000000000000000000000000000060648201526084016107bc565b506108b0838383612a3c565b8051825160009160ff9081169116101561221857506001610821565b8151835160ff9182169116111561223157506000610821565b6020808301519084015160ff9182169116101561225057506001610821565b6020808301519084015160ff9182169116111561226f57506000610821565b6040808301519084015160ff9182169116101561228e57506001610821565b50600092915050565b6001600160e01b031980821690036122f15760405162461bcd60e51b815260206004820152601c60248201527f4552433136353a20696e76616c696420696e746572666163652069640000000060448201526064016107bc565b6001600160e01b031916600090815260336020526040902080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00166001179055565b604080516001600160a01b0385811660248301528416604482015260648082018490528251808303909101815260849091019091526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f23b872dd000000000000000000000000000000000000000000000000000000001790526118dd908590612a61565b806001600160a01b0381163b612409576040517f48359af60000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024016107bc565b6040517f01ffc9a70000000000000000000000000000000000000000000000000000000081527f2675fdd00000000000000000000000000000000000000000000000000000000060048201526001600160a01b038216906301ffc9a790602401602060405180830381865afa158015612486573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906124aa9190613b82565b6124eb576040517f740b71160000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024016107bc565b6001600160a01b0385811614801561250b57506001600160a01b03848116145b15612542576040517f85f1ba9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03858116148061256157506001600160a01b03848116145b156125cf577f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33831480612598575061259883612b49565b156125cf576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088811b8216602a85015289901b16603e83015260528083018790528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b0316806126cd57600082815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0387811691821790925583518b8316815292830152881691339188917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a4612742565b826001600160a01b0316816001600160a01b031614612742576040517f0b98789e0000000000000000000000000000000000000000000000000000000081526001600160a01b03808916600483015280881660248301526044820187905280831660648301528416608482015260a4016107bc565b50505050505050565b61012e805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0383169081179091556040519081527fd91237492a9e30cd2faf361fc103998a382ff0ec2b1b07dc1cbebb76ae2f1ea29060200160405180910390a150565b6127d67f150b7a0200000000000000000000000000000000000000000000000000000000612297565b6127ff7f4e2312e000000000000000000000000000000000000000000000000000000000612297565b60fb6020527f5a08f87af82de422c581ce019b2e54a9c17372e9cba575ae0470ba2482d63686805463ffffffff1990811663150b7a02179091557fe1cfe341950d56d8854f782066100d5ae1d5930cdb4949b973e554a343efc6c38054821663f23a6e611790557fbc197c81000000000000000000000000000000000000000000000000000000006000527f08ba3617671847c1c169da222a5bc01cfdefcc3c4f1e5525214a474479c89123805490911663bc197c81179055565b7fbb39ebb37e60fb5d606ffdb749d2336e56b88e6c88c4bd6513b308f643186eed8282604051611d2f929190613b3c565b600054610100900460ff166129685760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e6700000000000000000000000000000000000000000060648201526084016107bc565b610e1c81612c18565b6001600160a01b0381163b6129ee5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e74726163740000000000000000000000000000000000000060648201526084016107bc565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b612a4583612c43565b600082511180612a525750805b156108b0576118dd8383612c83565b6000612ab6826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c6564815250856001600160a01b0316612caf9092919063ffffffff16565b9050805160001480612ad7575080806020019051810190612ad79190613b82565b6108b05760405162461bcd60e51b815260206004820152602a60248201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e60448201527f6f7420737563636565640000000000000000000000000000000000000000000060648201526084016107bc565b60007fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d821480612b9857507f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc82145b80612bc257507f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b82145b80612bec57507f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c82145b806108215750507ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc1490565b610e1c30827f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33611d3b565b612c4c81612971565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b6060612ca88383604051806060016040528060278152602001613bd060279139612cbe565b9392505050565b6060610c508484600085612d36565b6060600080856001600160a01b031685604051612cdb9190613bbd565b600060405180830381855af49150503d8060008114612d16576040519150601f19603f3d011682016040523d82523d6000602084013e612d1b565b606091505b5091509150612d2c86838387612e28565b9695505050505050565b606082471015612dae5760405162461bcd60e51b815260206004820152602660248201527f416464726573733a20696e73756666696369656e742062616c616e636520666f60448201527f722063616c6c000000000000000000000000000000000000000000000000000060648201526084016107bc565b600080866001600160a01b03168587604051612dca9190613bbd565b60006040518083038185875af1925050503d8060008114612e07576040519150601f19603f3d011682016040523d82523d6000602084013e612e0c565b606091505b5091509150612e1d87838387612e28565b979650505050505050565b60608315612e97578251600003612e90576001600160a01b0385163b612e905760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e747261637400000060448201526064016107bc565b5081610c50565b610c508383815115612eac5781518083602001fd5b8060405162461bcd60e51b81526004016107bc91906132cd565b60405180606001604052806003906020820280368337509192915050565b80356001600160e01b031981168114612efc57600080fd5b919050565b600060208284031215612f1357600080fd5b612ca882612ee4565b60008083601f840112612f2e57600080fd5b50813567ffffffffffffffff811115612f4657600080fd5b602083019150836020828501011115612f5e57600080fd5b9250929050565b60008060208385031215612f7857600080fd5b823567ffffffffffffffff811115612f8f57600080fd5b612f9b85828601612f1c565b90969095509350505050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112612fce57600080fd5b813567ffffffffffffffff80821115612fe957612fe9612fa7565b604051601f8301601f19908116603f0116810190828211818310171561301157613011612fa7565b8160405283815286602085880101111561302a57600080fd5b836020870160208301376000602085830101528094505050505092915050565b6000806040838503121561305d57600080fd5b82359150602083013567ffffffffffffffff81111561307b57600080fd5b61308785828601612fbd565b9150509250929050565b6001600160a01b0381168114610e1c57600080fd5b6000806000604084860312156130bb57600080fd5b83356130c681613091565b9250602084013567ffffffffffffffff808211156130e357600080fd5b818601915086601f8301126130f757600080fd5b81358181111561310657600080fd5b87602060608302850101111561311b57600080fd5b6020830194508093505050509250925092565b6000806000806080858703121561314457600080fd5b843561314f81613091565b9350602085013561315f81613091565b925060408501359150606085013567ffffffffffffffff81111561318257600080fd5b61318e87828801612fbd565b91505092959194509250565b60608101818360005b60038110156131c557815160ff168352602092830192909101906001016131a3565b50505092915050565b6000602082840312156131e057600080fd5b8135612ca881613091565b60008060006080848603121561320057600080fd5b606084018581111561321157600080fd5b8493503567ffffffffffffffff81111561322a57600080fd5b61323686828701612f1c565b9497909650939450505050565b6000806040838503121561325657600080fd5b823561326181613091565b9150602083013567ffffffffffffffff81111561307b57600080fd5b60005b83811015613298578181015183820152602001613280565b50506000910152565b600081518084526132b981602086016020860161327d565b601f01601f19169290920160200192915050565b602081526000612ca860208301846132a1565b600080600080606085870312156132f657600080fd5b843561330181613091565b935060208501359250604085013567ffffffffffffffff81111561332457600080fd5b61333087828801612f1c565b95989497509550505050565b60008060006060848603121561335157600080fd5b61335a84612ee4565b925061336860208501612ee4565b915061337660408501612ee4565b90509250925092565b6000806000806060858703121561339557600080fd5b84359350602085013567ffffffffffffffff808211156133b457600080fd5b818701915087601f8301126133c857600080fd5b8135818111156133d757600080fd5b8860208260051b85010111156133ec57600080fd5b95986020929092019750949560400135945092505050565b600081518084526020808501808196508360051b8101915082860160005b8581101561344c57828403895261343a8483516132a1565b98850198935090840190600101613422565b5091979650505050505050565b60408152600061346c6040830185613404565b90508260208301529392505050565b6000806000806080858703121561349157600080fd5b843561349c81613091565b935060208501356134ac81613091565b92506040850135915060608501356134c381613091565b939692955090935050565b6000806000606084860312156134e357600080fd5b83356134ee81613091565b925060208401356134fe81613091565b929592945050506040919091013590565b6000806020838503121561352257600080fd5b823567ffffffffffffffff8082111561353a57600080fd5b818501915085601f83011261354e57600080fd5b81358181111561355d57600080fd5b86602060a08302850101111561357257600080fd5b60209290920196919550909350505050565b6000806000806000806080878903121561359d57600080fd5b863567ffffffffffffffff808211156135b557600080fd5b6135c18a838b01612f1c565b9098509650602089013591506135d682613091565b9094506040880135906135e882613091565b909350606088013590808211156135fe57600080fd5b5061360b89828a01612f1c565b979a9699509497509295939492505050565b6001600160a01b0383168152604060208201526000610c5060408301846132a1565b828152604060208201526000610c5060408301846132a1565b634e487b7160e01b600052603260045260246000fd5b803560038110612efc57600080fd5b60006060828403121561368f57600080fd5b6040516060810181811067ffffffffffffffff821117156136b2576136b2612fa7565b6040526136be8361366e565b815260208301356136ce81613091565b60208201526040928301359281019290925250919050565b634e487b7160e01b600052602160045260246000fd5b803560ff81168114612efc57600080fd5b60006020828403121561371f57600080fd5b612ca8826136fc565b60608101818360005b60038110156131c55760ff613745836136fc565b1683526020928301929190910190600101613731565b600181811c9082168061376f57607f821691505b60208210810361378f57634e487b7160e01b600052602260045260246000fd5b50919050565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b838152604060208201526000611c5e604083018486613795565b60008235605e198336030181126137f057600080fd5b9190910192915050565b6000808335601e1984360301811261381157600080fd5b83018035915067ffffffffffffffff82111561382c57600080fd5b602001915036819003821315612f5e57600080fd5b8183823760009101908152919050565b60008261386e57634e487b7160e01b600052601260045260246000fd5b500490565b600060a08201888352602060a0818501528188835260c08501905060c08960051b86010192508960005b8a811015613970577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff408786030183528135605e198d36030181126138e057600080fd5b8c01606081356138ef81613091565b6001600160a01b03168752818601358688015260408083013536849003601e1901811261391b57600080fd5b90920186810192903567ffffffffffffffff81111561393957600080fd5b80360384131561394857600080fd5b82828a015261395a838a018286613795565b985050509385019350509083019060010161389d565b5050505085604084015284606084015282810360808401526139928185613404565b9998505050505050505050565b600060a082840312156139b157600080fd5b60405160a0810181811067ffffffffffffffff821117156139d4576139d4612fa7565b6040526139e08361366e565b815260208301356139f081613091565b60208201526040830135613a0381613091565b60408201526060830135613a1681613091565b60608201526080928301359281019290925250919050565b601f8211156108b057600081815260208120601f850160051c81016020861015613a555750805b601f850160051c820191505b81811015613a7457828155600101613a61565b505050505050565b67ffffffffffffffff831115613a9457613a94612fa7565b613aa883613aa2835461375b565b83613a2e565b6000601f841160018114613adc5760008515613ac45750838201355b600019600387901b1c1916600186901b178355610a55565b600083815260209020601f19861690835b82811015613b0d5786850135825560209485019460019092019101613aed565b5086821015613b2a5760001960f88860031b161c19848701351681555b505060018560011b0183555050505050565b602081526000610c50602083018486613795565b60006001600160a01b03808716835280861660208401525083604083015260806060830152612d2c60808301846132a1565b600060208284031215613b9457600080fd5b81518015158114612ca857600080fd5b600060208284031215613bb657600080fd5b5051919050565b600082516137f081846020870161327d56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a264697066735822122080dc8ef7ede2d5b7f9e0072267fc8d0cee140bc1523e731d7a2db158b1c6910764736f6c63430008110033',
  deployedBytecode:
    '0x6080604052600436106101dc5760003560e01c806352d1902d11610102578063d68bad2c11610095578063e978afe511610064578063e978afe5146106d0578063eafb8b06146106f0578063ee57e36f14610710578063fdef9106146107305761021b565b8063d68bad2c1461063c578063d96054c41461065c578063da7422281461067c578063e306bee71461069c5761021b565b8063c4a50145116100d1578063c4a50145146105a5578063c71bf324146105c5578063c9dbc2a4146105f3578063ce1b815f146106135761021b565b806352d1902d146105275780637034731b1461053c578063829331a11461055e578063bfe07da6146105925761021b565b80632675fdd01161017a5780633e2ab0d9116101495780633e2ab0d9146104a057806342d8e99e146104c05780634ec7ac23146104e05780634f1ef286146105145761021b565b80632675fdd01461040a57806326875b1f1461042a5780632ae9c6001461045e5780633659cfe6146104805761021b565b80631080f99b116101b65780631080f99b1461035b5780631626ba7e1461037d57806322844d04146103b657806324b4d73f146103d65761021b565b806301ffc9a7146102b05780630729d054146102e557806309e56b14146103275761021b565b3661021b57604080513381523460208201527f62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3910160405180910390a1005b34801561022757600080fd5b506000366060600061027b6000356001600160e01b03191685858080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061075092505050565b604080516001600160e01b03198316602082015291925001604051602081830303815290604052915050915050805190602001f35b3480156102bc57600080fd5b506102d06102cb366004612f01565b610827565b60405190151581526020015b60405180910390f35b3480156102f157600080fd5b506103197fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d81565b6040519081526020016102dc565b34801561033357600080fd5b506103197f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3381565b34801561036757600080fd5b5061037b610376366004612f65565b61087c565b005b34801561038957600080fd5b5061039d61039836600461304a565b6108b5565b6040516001600160e01b031990911681526020016102dc565b3480156103c257600080fd5b5061037b6103d13660046130a6565b610940565b3480156103e257600080fd5b506103197f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc81565b34801561041657600080fd5b506102d061042536600461312e565b610a5c565b34801561043657600080fd5b506103197ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc81565b34801561046a57600080fd5b50610473610c58565b6040516102dc919061319a565b34801561048c57600080fd5b5061037b61049b3660046131ce565b610c82565b3480156104ac57600080fd5b5061037b6104bb3660046131ce565b610e1f565b3480156104cc57600080fd5b5061037b6104db3660046131eb565b610e51565b3480156104ec57600080fd5b506103197f968c17ebf04aa1b7544168e69314cdab6b69ba813bb6080d49c0c40a65560f5881565b61037b610522366004613243565b611082565b34801561053357600080fd5b50610319611210565b34801561054857600080fd5b506105516112d5565b6040516102dc91906132cd565b34801561056a57600080fd5b506103197f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c81565b61037b6105a03660046132e0565b611368565b3480156105b157600080fd5b5061037b6105c036600461333c565b6114a2565b3480156105d157600080fd5b506105e56105e036600461337f565b61154c565b6040516102dc929190613459565b3480156105ff57600080fd5b5061037b61060e36600461347b565b611872565b34801561061f57600080fd5b5061012e546040516001600160a01b0390911681526020016102dc565b34801561064857600080fd5b5061037b6106573660046134ce565b6118a8565b34801561066857600080fd5b5061037b6106773660046134ce565b6118e3565b34801561068857600080fd5b5061037b6106973660046131ce565b611918565b3480156106a857600080fd5b506103197f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b81565b3480156106dc57600080fd5b5061037b6106eb36600461350f565b61194b565b3480156106fc57600080fd5b5061037b61070b366004613584565b611a52565b34801561071c57600080fd5b5061037b61072b366004612f65565b611c1c565b34801561073c57600080fd5b506102d061074b36600461312e565b611c50565b6001600160e01b0319808316600090815260fb6020526040812054909160e09190911b9081166107c5576040517f54bdcc3e0000000000000000000000000000000000000000000000000000000081526001600160e01b03198086166004830152821660248201526044015b60405180910390fd5b837bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19167f4792cb6e46e49876374bea490ba23274bacea6b84c216a64f47abab54027589b338560405161081692919061361d565b60405180910390a290505b92915050565b60007f01ffc9a7000000000000000000000000000000000000000000000000000000006001600160e01b0319831614806108215750506001600160e01b03191660009081526033602052604090205460ff1690565b7f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b6108a681611c67565b6108b08383611cef565b505050565b600061090430337f968c17ebf04aa1b7544168e69314cdab6b69ba813bb6080d49c0c40a65560f5886866040516020016108f092919061363f565b604051602081830303815290604052610a5c565b1561093057507f1626ba7e00000000000000000000000000000000000000000000000000000000610821565b506001600160e01b031992915050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361096a81611c67565b60005b82811015610a5557600084848381811061098957610989613658565b90506060020180360381019061099f919061367d565b90506000815160028111156109b6576109b66136e6565b036109d3576109ce8682602001518360400151611d3b565b610a4c565b6001815160028111156109e8576109e86136e6565b03610a00576109ce8682602001518360400151611e94565b600281516002811115610a1557610a156136e6565b03610a4c576040517fd4d3bef700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5060010161096d565b5050505050565b60008060c96000610ace888888604051692822a926a4a9a9a4a7a760b11b60208201526bffffffffffffffffffffffff19606084811b8216602a84015285901b16603e820152605281018290526000906072016040516020818303038152906040528051906020012090509392505050565b81526020810191909152604001600020546001600160a01b031690507ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe8101610b1b576001915050610c50565b6001600160a01b03811615610b3f57610b378187878787611f88565b915050610c50565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19602a8301819052606089901b16603e83015260528083018790528351808403909101815260729092018352815191810191909120600090815260c990915220546001600160a01b03168015610bc557610b378187878787611f88565b5060408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088901b8116602a840152603e83015260528083018790528351808403909101815260729092018352815191810191909120600090815260c990915220546001600160a01b03168015610c4a57610b378187878787611f88565b50600090505b949350505050565b610c60612ec6565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610d205760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084016107bc565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610d7b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610df75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f7879000000000000000000000000000000000000000060648201526084016107bc565b610e0081612032565b60408051600080825260208201909252610e1c9183919061205c565b50565b6040517fb2728e9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600054600390610100900460ff16158015610e73575060005460ff8083169116105b610ee55760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a656400000000000000000000000000000000000060648201526084016107bc565b6000805461ffff191660ff831617610100179055610f06602085018561370d565b60ff16600114610f4457836040517f84833d670000000000000000000000000000000000000000000000000000000081526004016107bc9190613728565b6040805160608082018352600182526003602083018190526000838501528351808301909452610f8d9391889190839083908082843760009201919091525091929150506121fc565b15610fc157600161013055610fc17f2ae9c60000000000000000000000000000000000000000000000000000000000612297565b60408051606080820183526001825260046020830152600082840152825180820190935261100a92908790600390839083908082843760009201919091525091929150506121fc565b1561103a5761103a30307f0dcbfb19b09fb8ff4e9af583d4b8e9c8127cc1b26529b4d96dd3b7e778088372611e94565b6000805461ff001916905560405160ff821681527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498906020015b60405180910390a150505050565b6001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001630036111205760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084016107bc565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031661117b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b0316146111f75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f7879000000000000000000000000000000000000000060648201526084016107bc565b61120082612032565b61120c8282600161205c565b5050565b6000306001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016146112b05760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c000000000000000060648201526084016107bc565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b606061012f80546112e59061375b565b80601f01602080910402602001604051908101604052809291908181526020018280546113119061375b565b801561135e5780601f106113335761010080835404028352916020019161135e565b820191906000526020600020905b81548152906001019060200180831161134157829003601f168201915b5050505050905090565b826000036113a2576040517f1f2a200500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b0384166113f7578234146113f2576040517f1abd5610000000000000000000000000000000000000000000000000000000008152600481018490523460248201526044016107bc565b61144d565b3415611438576040517f1abd5610000000000000000000000000000000000000000000000000000000008152600060048201523460248201526044016107bc565b61144d6001600160a01b038516333086612334565b836001600160a01b0316336001600160a01b03167f2bc500cf071be2d1c1458ed6ff484cd4db4345ada8943dee7ff29e7af3558f76858585604051611494939291906137c0565b60405180910390a350505050565b7ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc6114cc81611c67565b6114d584612297565b6001600160e01b03198316600090815260fb60205260409020805463ffffffff191660e084901c179055604080516001600160e01b0319808716825280861660208301528416918101919091527ffc72fd547553f7a663e0048e590afc9c47b56a4242e960f31cf4c62e23d308b990606001611074565b606060006002610130540361158d576040517f37ed32e800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6002610130557fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d6115bd81611c67565b6101008511156115f9576040517f11c763d600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8467ffffffffffffffff81111561161257611612612fa7565b60405190808252806020026020018201604052801561164557816020015b60608152602001906001900390816116305790505b50925060008060005b87811015611812575a92506000808a8a8481811061166e5761166e613658565b905060200281019061168091906137da565b61168e9060208101906131ce565b6001600160a01b03168b8b858181106116a9576116a9613658565b90506020028101906116bb91906137da565b602001358c8c868181106116d1576116d1613658565b90506020028101906116e391906137da565b6116f19060408101906137fa565b6040516116ff929190613841565b60006040518083038185875af1925050503d806000811461173c576040519150601f19603f3d011682016040523d82523d6000602084013e611741565b606091505b50915091505a9350600160ff84161b89166117955781611790576040517fa6a7dbbd000000000000000000000000000000000000000000000000000000008152600481018490526024016107bc565b6117ea565b816117ea576117a5604086613851565b8410156117de576040517f1c26714c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600160ff84161b871896505b808884815181106117fd576117fd613658565b6020908102919091010152505060010161164e565b50336001600160a01b03167fd4e57c2049f004fb297ef78591cd409503ceb6b2c722d7ffed032fc99e5f3b588a8a8a8a898b60405161185696959493929190613873565b60405180910390a2505060016101305550909590945092505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361189c81611c67565b610a55858585856123bc565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada336118d281611c67565b6118dd848484611d3b565b50505050565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361190d81611c67565b6118dd848484611e94565b7f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c61194281611c67565b61120c8261274b565b7f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada3361197581611c67565b60005b828110156118dd57600084848381811061199457611994613658565b905060a002018036038101906119aa919061399f565b90506000815160028111156119c1576119c16136e6565b036119e2576119dd816020015182604001518360800151611d3b565b611a49565b6001815160028111156119f7576119f76136e6565b03611a13576119dd816020015182604001518360800151611e94565b600281516002811115611a2857611a286136e6565b03611a4957611a4981602001518260400151836080015184606001516123bc565b50600101611978565b600054600390610100900460ff16158015611a74575060005460ff8083169116105b611ae65760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a656400000000000000000000000000000000000060648201526084016107bc565b6000805461ffff191660ff831617610100179055600161013055611b297f9385547e00000000000000000000000000000000000000000000000000000000612297565b611b527f1626ba7e00000000000000000000000000000000000000000000000000000000612297565b611b7b7f7034731b00000000000000000000000000000000000000000000000000000000612297565b611ba47f2ae9c60000000000000000000000000000000000000000000000000000000000612297565b611bac6127ad565b611bb687876128ba565b611bbf8461274b565b611bc98383611cef565b611bd2856128eb565b6000805461ff001916905560405160ff821681527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a150505050505050565b7f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b611c4681611c67565b6108b083836128ba565b6000611c5e85858585610a5c565b95945050505050565b611caa3033836000368080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250610a5c92505050565b610e1c576040517f1e09743f000000000000000000000000000000000000000000000000000000008152306004820152336024820152604481018290526064016107bc565b61012f611cfd828483613a7c565b507fe9b617ecb5f63f6a9ccd8d4d5fa0d7b2ef9b17ce3f48e6b135808d6a40e677428282604051611d2f929190613b3c565b60405180910390a15050565b6001600160a01b038381161480611d5a57506001600160a01b03828116145b15611d91576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e83015260528083018590528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b031680610a5557600082815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916600290811790915582516001600160a01b0389811682529281019190915290861691339186917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a45050505050565b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606086811b8216602a85015287901b16603e83015260528083018590528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b0316156118dd57600081815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916905590516001600160a01b038681168252851691339185917f3ca48185ec3f6e47e24db18b13f1c65b1ce05da1659f9c1c4fe717dda5f67524910160405180910390a450505050565b6040517f2675fdd00000000000000000000000000000000000000000000000000000000081526000906001600160a01b03871690632675fdd090611fd6908890889088908890600401613b50565b602060405180830381865afa92505050801561200f575060408051601f3d908101601f1916820190925261200c91810190613b82565b60015b15612026578015612024576001915050611c5e565b505b50600095945050505050565b7f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc61120c81611c67565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff161561208f576108b083612971565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa9250505080156120e9575060408051601f3d908101601f191682019092526120e691810190613ba4565b60015b61215b5760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f74205555505300000000000000000000000000000000000060648201526084016107bc565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc81146121f05760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c6555554944000000000000000000000000000000000000000000000060648201526084016107bc565b506108b0838383612a3c565b8051825160009160ff9081169116101561221857506001610821565b8151835160ff9182169116111561223157506000610821565b6020808301519084015160ff9182169116101561225057506001610821565b6020808301519084015160ff9182169116111561226f57506000610821565b6040808301519084015160ff9182169116101561228e57506001610821565b50600092915050565b6001600160e01b031980821690036122f15760405162461bcd60e51b815260206004820152601c60248201527f4552433136353a20696e76616c696420696e746572666163652069640000000060448201526064016107bc565b6001600160e01b031916600090815260336020526040902080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00166001179055565b604080516001600160a01b0385811660248301528416604482015260648082018490528251808303909101815260849091019091526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f23b872dd000000000000000000000000000000000000000000000000000000001790526118dd908590612a61565b806001600160a01b0381163b612409576040517f48359af60000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024016107bc565b6040517f01ffc9a70000000000000000000000000000000000000000000000000000000081527f2675fdd00000000000000000000000000000000000000000000000000000000060048201526001600160a01b038216906301ffc9a790602401602060405180830381865afa158015612486573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906124aa9190613b82565b6124eb576040517f740b71160000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024016107bc565b6001600160a01b0385811614801561250b57506001600160a01b03848116145b15612542576040517f85f1ba9900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03858116148061256157506001600160a01b03848116145b156125cf577f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33831480612598575061259883612b49565b156125cf576040517f24159e5b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60408051692822a926a4a9a9a4a7a760b11b6020808301919091526bffffffffffffffffffffffff19606088811b8216602a85015289901b16603e83015260528083018790528351808403909101815260729092019092528051910120600090600081815260c960205260409020549091506001600160a01b0316806126cd57600082815260c96020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0387811691821790925583518b8316815292830152881691339188917f0f579ad49235a8c1fd9041427e7067b1eb10926bbed380bf6fabc73e0e807644910160405180910390a4612742565b826001600160a01b0316816001600160a01b031614612742576040517f0b98789e0000000000000000000000000000000000000000000000000000000081526001600160a01b03808916600483015280881660248301526044820187905280831660648301528416608482015260a4016107bc565b50505050505050565b61012e805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0383169081179091556040519081527fd91237492a9e30cd2faf361fc103998a382ff0ec2b1b07dc1cbebb76ae2f1ea29060200160405180910390a150565b6127d67f150b7a0200000000000000000000000000000000000000000000000000000000612297565b6127ff7f4e2312e000000000000000000000000000000000000000000000000000000000612297565b60fb6020527f5a08f87af82de422c581ce019b2e54a9c17372e9cba575ae0470ba2482d63686805463ffffffff1990811663150b7a02179091557fe1cfe341950d56d8854f782066100d5ae1d5930cdb4949b973e554a343efc6c38054821663f23a6e611790557fbc197c81000000000000000000000000000000000000000000000000000000006000527f08ba3617671847c1c169da222a5bc01cfdefcc3c4f1e5525214a474479c89123805490911663bc197c81179055565b7fbb39ebb37e60fb5d606ffdb749d2336e56b88e6c88c4bd6513b308f643186eed8282604051611d2f929190613b3c565b600054610100900460ff166129685760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e6700000000000000000000000000000000000000000060648201526084016107bc565b610e1c81612c18565b6001600160a01b0381163b6129ee5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e74726163740000000000000000000000000000000000000060648201526084016107bc565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b612a4583612c43565b600082511180612a525750805b156108b0576118dd8383612c83565b6000612ab6826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c6564815250856001600160a01b0316612caf9092919063ffffffff16565b9050805160001480612ad7575080806020019051810190612ad79190613b82565b6108b05760405162461bcd60e51b815260206004820152602a60248201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e60448201527f6f7420737563636565640000000000000000000000000000000000000000000060648201526084016107bc565b60007fbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d821480612b9857507f1f53edd44352e5d15bad2b29233baa93bcd595e09457780bc7c5445bbbe751cc82145b80612bc257507f4707e94b25cfce1a7c363508fbb838c35864388ad77284b248282b9746982b9b82145b80612bec57507f06d294bc8cbad2e393408b20dd019a772661f60b8d633e56761157cb1ec85f8c82145b806108215750507ffaf505be9907aa6951c2ebe5b0312f4980e14f21912ed355372103cc8bd683bc1490565b610e1c30827f815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33611d3b565b612c4c81612971565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b6060612ca88383604051806060016040528060278152602001613bd060279139612cbe565b9392505050565b6060610c508484600085612d36565b6060600080856001600160a01b031685604051612cdb9190613bbd565b600060405180830381855af49150503d8060008114612d16576040519150601f19603f3d011682016040523d82523d6000602084013e612d1b565b606091505b5091509150612d2c86838387612e28565b9695505050505050565b606082471015612dae5760405162461bcd60e51b815260206004820152602660248201527f416464726573733a20696e73756666696369656e742062616c616e636520666f60448201527f722063616c6c000000000000000000000000000000000000000000000000000060648201526084016107bc565b600080866001600160a01b03168587604051612dca9190613bbd565b60006040518083038185875af1925050503d8060008114612e07576040519150601f19603f3d011682016040523d82523d6000602084013e612e0c565b606091505b5091509150612e1d87838387612e28565b979650505050505050565b60608315612e97578251600003612e90576001600160a01b0385163b612e905760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e747261637400000060448201526064016107bc565b5081610c50565b610c508383815115612eac5781518083602001fd5b8060405162461bcd60e51b81526004016107bc91906132cd565b60405180606001604052806003906020820280368337509192915050565b80356001600160e01b031981168114612efc57600080fd5b919050565b600060208284031215612f1357600080fd5b612ca882612ee4565b60008083601f840112612f2e57600080fd5b50813567ffffffffffffffff811115612f4657600080fd5b602083019150836020828501011115612f5e57600080fd5b9250929050565b60008060208385031215612f7857600080fd5b823567ffffffffffffffff811115612f8f57600080fd5b612f9b85828601612f1c565b90969095509350505050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112612fce57600080fd5b813567ffffffffffffffff80821115612fe957612fe9612fa7565b604051601f8301601f19908116603f0116810190828211818310171561301157613011612fa7565b8160405283815286602085880101111561302a57600080fd5b836020870160208301376000602085830101528094505050505092915050565b6000806040838503121561305d57600080fd5b82359150602083013567ffffffffffffffff81111561307b57600080fd5b61308785828601612fbd565b9150509250929050565b6001600160a01b0381168114610e1c57600080fd5b6000806000604084860312156130bb57600080fd5b83356130c681613091565b9250602084013567ffffffffffffffff808211156130e357600080fd5b818601915086601f8301126130f757600080fd5b81358181111561310657600080fd5b87602060608302850101111561311b57600080fd5b6020830194508093505050509250925092565b6000806000806080858703121561314457600080fd5b843561314f81613091565b9350602085013561315f81613091565b925060408501359150606085013567ffffffffffffffff81111561318257600080fd5b61318e87828801612fbd565b91505092959194509250565b60608101818360005b60038110156131c557815160ff168352602092830192909101906001016131a3565b50505092915050565b6000602082840312156131e057600080fd5b8135612ca881613091565b60008060006080848603121561320057600080fd5b606084018581111561321157600080fd5b8493503567ffffffffffffffff81111561322a57600080fd5b61323686828701612f1c565b9497909650939450505050565b6000806040838503121561325657600080fd5b823561326181613091565b9150602083013567ffffffffffffffff81111561307b57600080fd5b60005b83811015613298578181015183820152602001613280565b50506000910152565b600081518084526132b981602086016020860161327d565b601f01601f19169290920160200192915050565b602081526000612ca860208301846132a1565b600080600080606085870312156132f657600080fd5b843561330181613091565b935060208501359250604085013567ffffffffffffffff81111561332457600080fd5b61333087828801612f1c565b95989497509550505050565b60008060006060848603121561335157600080fd5b61335a84612ee4565b925061336860208501612ee4565b915061337660408501612ee4565b90509250925092565b6000806000806060858703121561339557600080fd5b84359350602085013567ffffffffffffffff808211156133b457600080fd5b818701915087601f8301126133c857600080fd5b8135818111156133d757600080fd5b8860208260051b85010111156133ec57600080fd5b95986020929092019750949560400135945092505050565b600081518084526020808501808196508360051b8101915082860160005b8581101561344c57828403895261343a8483516132a1565b98850198935090840190600101613422565b5091979650505050505050565b60408152600061346c6040830185613404565b90508260208301529392505050565b6000806000806080858703121561349157600080fd5b843561349c81613091565b935060208501356134ac81613091565b92506040850135915060608501356134c381613091565b939692955090935050565b6000806000606084860312156134e357600080fd5b83356134ee81613091565b925060208401356134fe81613091565b929592945050506040919091013590565b6000806020838503121561352257600080fd5b823567ffffffffffffffff8082111561353a57600080fd5b818501915085601f83011261354e57600080fd5b81358181111561355d57600080fd5b86602060a08302850101111561357257600080fd5b60209290920196919550909350505050565b6000806000806000806080878903121561359d57600080fd5b863567ffffffffffffffff808211156135b557600080fd5b6135c18a838b01612f1c565b9098509650602089013591506135d682613091565b9094506040880135906135e882613091565b909350606088013590808211156135fe57600080fd5b5061360b89828a01612f1c565b979a9699509497509295939492505050565b6001600160a01b0383168152604060208201526000610c5060408301846132a1565b828152604060208201526000610c5060408301846132a1565b634e487b7160e01b600052603260045260246000fd5b803560038110612efc57600080fd5b60006060828403121561368f57600080fd5b6040516060810181811067ffffffffffffffff821117156136b2576136b2612fa7565b6040526136be8361366e565b815260208301356136ce81613091565b60208201526040928301359281019290925250919050565b634e487b7160e01b600052602160045260246000fd5b803560ff81168114612efc57600080fd5b60006020828403121561371f57600080fd5b612ca8826136fc565b60608101818360005b60038110156131c55760ff613745836136fc565b1683526020928301929190910190600101613731565b600181811c9082168061376f57607f821691505b60208210810361378f57634e487b7160e01b600052602260045260246000fd5b50919050565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b838152604060208201526000611c5e604083018486613795565b60008235605e198336030181126137f057600080fd5b9190910192915050565b6000808335601e1984360301811261381157600080fd5b83018035915067ffffffffffffffff82111561382c57600080fd5b602001915036819003821315612f5e57600080fd5b8183823760009101908152919050565b60008261386e57634e487b7160e01b600052601260045260246000fd5b500490565b600060a08201888352602060a0818501528188835260c08501905060c08960051b86010192508960005b8a811015613970577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff408786030183528135605e198d36030181126138e057600080fd5b8c01606081356138ef81613091565b6001600160a01b03168752818601358688015260408083013536849003601e1901811261391b57600080fd5b90920186810192903567ffffffffffffffff81111561393957600080fd5b80360384131561394857600080fd5b82828a015261395a838a018286613795565b985050509385019350509083019060010161389d565b5050505085604084015284606084015282810360808401526139928185613404565b9998505050505050505050565b600060a082840312156139b157600080fd5b60405160a0810181811067ffffffffffffffff821117156139d4576139d4612fa7565b6040526139e08361366e565b815260208301356139f081613091565b60208201526040830135613a0381613091565b60408201526060830135613a1681613091565b60608201526080928301359281019290925250919050565b601f8211156108b057600081815260208120601f850160051c81016020861015613a555750805b601f850160051c820191505b81811015613a7457828155600101613a61565b505050505050565b67ffffffffffffffff831115613a9457613a94612fa7565b613aa883613aa2835461375b565b83613a2e565b6000601f841160018114613adc5760008515613ac45750838201355b600019600387901b1c1916600186901b178355610a55565b600083815260209020601f19861690835b82811015613b0d5786850135825560209485019460019092019101613aed565b5086821015613b2a5760001960f88860031b161c19848701351681555b505060018560011b0183555050505050565b602081526000610c50602083018486613795565b60006001600160a01b03808716835280861660208401525083604083015260806060830152612d2c60808301846132a1565b600060208284031215613b9457600080fd5b81518015158114612ca857600080fd5b600060208284031215613bb657600080fd5b5051919050565b600082516137f081846020870161327d56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a264697066735822122080dc8ef7ede2d5b7f9e0072267fc8d0cee140bc1523e731d7a2db158b1c6910764736f6c63430008110033',
  linkReferences: {},
  deployedLinkReferences: {},
}
