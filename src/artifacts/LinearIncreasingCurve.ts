export const LinearIncreasingCurve = {
  _format: 'hh-sol-artifact-1',
  contractName: 'LinearIncreasingCurve',
  sourceName: 'LinearIncreasingCurve.sol',
  abi: [
    {
      type: 'constructor',
      inputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'CURVE_ADMIN_ROLE',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: '_getBiasAndSlope',
      inputs: [
        {
          name: '_timeElapsed',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_amount',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'int256',
          internalType: 'int256',
        },
        {
          name: '',
          type: 'int256',
          internalType: 'int256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'checkpoint',
      inputs: [
        {
          name: '_tokenId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_oldLocked',
          type: 'tuple',
          internalType: 'struct ILockedBalanceIncreasing.LockedBalance',
          components: [
            {
              name: 'amount',
              type: 'uint208',
              internalType: 'uint208',
            },
            {
              name: 'start',
              type: 'uint48',
              internalType: 'uint48',
            },
          ],
        },
        {
          name: '_newLocked',
          type: 'tuple',
          internalType: 'struct ILockedBalanceIncreasing.LockedBalance',
          components: [
            {
              name: 'amount',
              type: 'uint208',
              internalType: 'uint208',
            },
            {
              name: 'start',
              type: 'uint48',
              internalType: 'uint48',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'clock',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'dao',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'contract IDAO',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'escrow',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getBias',
      inputs: [
        {
          name: 'timeElapsed',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'amount',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getCoefficients',
      inputs: [
        {
          name: 'amount',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'int256[3]',
          internalType: 'int256[3]',
        },
      ],
      stateMutability: 'pure',
    },
    {
      type: 'function',
      name: 'globalPointHistory',
      inputs: [
        {
          name: '_index',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct IEscrowCurveGlobalStorage.GlobalPoint',
          components: [
            {
              name: 'bias',
              type: 'int256',
              internalType: 'int256',
            },
            {
              name: 'slope',
              type: 'int256',
              internalType: 'int256',
            },
            {
              name: 'writtenTs',
              type: 'uint48',
              internalType: 'uint48',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'globalPointLatestIndex',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'implementation',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'initialize',
      inputs: [
        {
          name: '_escrow',
          type: 'address',
          internalType: 'address',
        },
        {
          name: '_dao',
          type: 'address',
          internalType: 'address',
        },
        {
          name: '_clock',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'isWarm',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'bool',
          internalType: 'bool',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'isWarm',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '',
          type: 'uint48',
          internalType: 'uint48',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'bool',
          internalType: 'bool',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'maxTime',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'previewMaxBias',
      inputs: [
        {
          name: 'amount',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'proxiableUUID',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'setWarmupPeriod',
      inputs: [
        {
          name: '',
          type: 'uint48',
          internalType: 'uint48',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'slopeChanges',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'int256',
          internalType: 'int256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'supplyAt',
      inputs: [
        {
          name: '_timestamp',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'tokenPointHistory',
      inputs: [
        {
          name: '_tokenId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_index',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: 'point',
          type: 'tuple',
          internalType: 'struct IEscrowCurveTokenStorage.TokenPoint',
          components: [
            {
              name: 'bias',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'checkpointTs',
              type: 'uint128',
              internalType: 'uint128',
            },
            {
              name: 'writtenTs',
              type: 'uint128',
              internalType: 'uint128',
            },
            {
              name: 'coefficients',
              type: 'int256[3]',
              internalType: 'int256[3]',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'tokenPointIntervals',
      inputs: [
        {
          name: '_tokenId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'tokenPointLatestIndex',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'upgradeTo',
      inputs: [
        {
          name: 'newImplementation',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'upgradeToAndCall',
      inputs: [
        {
          name: 'newImplementation',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'data',
          type: 'bytes',
          internalType: 'bytes',
        },
      ],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'votingPowerAt',
      inputs: [
        {
          name: '_tokenId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_t',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'warmupPeriod',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint48',
          internalType: 'uint48',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'event',
      name: 'AdminChanged',
      inputs: [
        {
          name: 'previousAdmin',
          type: 'address',
          indexed: false,
          internalType: 'address',
        },
        {
          name: 'newAdmin',
          type: 'address',
          indexed: false,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'BeaconUpgraded',
      inputs: [
        {
          name: 'beacon',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'Initialized',
      inputs: [
        {
          name: 'version',
          type: 'uint8',
          indexed: false,
          internalType: 'uint8',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'Upgraded',
      inputs: [
        {
          name: 'implementation',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'error',
      name: 'CheckpointOnDepositIntervalNotAllowed',
      inputs: [],
    },
    {
      type: 'error',
      name: 'DaoUnauthorized',
      inputs: [
        {
          name: 'dao',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'where',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'who',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'permissionId',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
    },
    {
      type: 'error',
      name: 'Deprecated',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InvalidCheckpoint',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InvalidLocks',
      inputs: [
        {
          name: 'tokenId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'fromLocked',
          type: 'tuple',
          internalType: 'struct ILockedBalanceIncreasing.LockedBalance',
          components: [
            {
              name: 'amount',
              type: 'uint208',
              internalType: 'uint208',
            },
            {
              name: 'start',
              type: 'uint48',
              internalType: 'uint48',
            },
          ],
        },
        {
          name: 'newLocked',
          type: 'tuple',
          internalType: 'struct ILockedBalanceIncreasing.LockedBalance',
          components: [
            {
              name: 'amount',
              type: 'uint208',
              internalType: 'uint208',
            },
            {
              name: 'start',
              type: 'uint48',
              internalType: 'uint48',
            },
          ],
        },
      ],
    },
    {
      type: 'error',
      name: 'InvalidTokenId',
      inputs: [],
    },
    {
      type: 'error',
      name: 'OnlyEscrow',
      inputs: [],
    },
    {
      type: 'error',
      name: 'UpgradeNotPossible',
      inputs: [],
    },
  ],
  bytecode: '0x',
  deployedBytecode: '0x',
  linkReferences: {},
  deployedLinkReferences: {},
}
