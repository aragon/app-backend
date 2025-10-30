export const MajorityIcoBase = {
  _format: 'hh-sol-artifact-1',
  contractName: 'MajorityIcoBase',
  sourceName: 'src/plugins/governance/majority-ico/MajorityIcoBase.sol',
  abi: [
    {
      inputs: [],
      name: 'AlreadyInitialized',
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
      name: 'DaoUnauthorized',
      type: 'error',
    },
    {
      inputs: [],
      name: 'DelegateCallFailed',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'requiredAmount',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'balance',
          type: 'uint256',
        },
      ],
      name: 'InsufficientContractBalance',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          internalType: 'uint256',
          name: 'requestedAmount',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'availableAmount',
          type: 'uint256',
        },
      ],
      name: 'InsufficientTokensAvailable',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'requiredAmount',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'balance',
          type: 'uint256',
        },
      ],
      name: 'InsufficientUserBalance',
      type: 'error',
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'target',
              type: 'address',
            },
            {
              internalType: 'enum IPlugin.Operation',
              name: 'operation',
              type: 'uint8',
            },
          ],
          internalType: 'struct IPlugin.TargetConfig',
          name: 'targetConfig',
          type: 'tuple',
        },
      ],
      name: 'InvalidTargetConfig',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidTradingPairSettings',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          internalType: 'uint256',
          name: 'currentTime',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'endDate',
          type: 'uint256',
        },
      ],
      name: 'SaleAlreadyEnded',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          internalType: 'uint256',
          name: 'currentTime',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'startDate',
          type: 'uint256',
        },
      ],
      name: 'SaleNotStarted',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
      ],
      name: 'TokenNotContract',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
      ],
      name: 'TokenNotERC20',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'from',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'TokenTransferFailed',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'tokenA',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'tokenB',
          type: 'address',
        },
      ],
      name: 'TradingPairAlreadyExists',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'TradingPairDoesNotExist',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'TradingPairNotActive',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'TradingPairSaleEnded',
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
          internalType: 'bytes',
          name: 'metadata',
          type: 'bytes',
        },
      ],
      name: 'MetadataUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'target',
              type: 'address',
            },
            {
              internalType: 'enum IPlugin.Operation',
              name: 'operation',
              type: 'uint8',
            },
          ],
          indexed: false,
          internalType: 'struct IPlugin.TargetConfig',
          name: 'newTargetConfig',
          type: 'tuple',
        },
      ],
      name: 'TargetSet',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'tokenAAmount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'tokenBAmount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'timestamp',
          type: 'uint256',
        },
      ],
      name: 'TokensExchanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'tokenA',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'tokenB',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'tokenASaleAmount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'startDate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endDate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint8',
          name: 'pairType',
          type: 'uint8',
        },
      ],
      name: 'TradingPairCreated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'TradingPairRemoved',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          indexed: false,
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      name: 'TradingPairStatusChanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'tokenASaleAmount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'startDate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endDate',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
        {
          indexed: false,
          internalType: 'uint8',
          name: 'pairType',
          type: 'uint8',
        },
      ],
      name: 'TradingPairUpdated',
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
      inputs: [],
      name: 'CREATE_TRADING_PAIR_PERMISSION_ID',
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
      name: 'SET_TARGET_CONFIG_PERMISSION_ID',
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
      name: 'UPDATE_ICO_SETTINGS_PERMISSION_ID',
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
      name: 'UPDATE_TRADING_PAIR_PERMISSION_ID',
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
      name: 'UPGRADE_PLUGIN_PERMISSION_ID',
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
              internalType: 'address',
              name: 'tokenA',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'tokenB',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'rate',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'tokenASaleAmount',
              type: 'uint256',
            },
            {
              internalType: 'uint64',
              name: 'startDate',
              type: 'uint64',
            },
            {
              internalType: 'uint64',
              name: 'endDate',
              type: 'uint64',
            },
            {
              internalType: 'uint8',
              name: 'pairType',
              type: 'uint8',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPairSettings',
          name: '_tradingPairSettings',
          type: 'tuple',
        },
      ],
      name: 'createTradingPair',
      outputs: [
        {
          internalType: 'uint256',
          name: 'tradingPairId',
          type: 'uint256',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'dao',
      outputs: [
        {
          internalType: 'contract IDAO',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          internalType: 'uint256',
          name: 'tokenBAmount',
          type: 'uint256',
        },
      ],
      name: 'exchangeTokens',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'start',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'count',
          type: 'uint256',
        },
      ],
      name: 'getActiveTradingPairIds',
      outputs: [
        {
          internalType: 'uint256[]',
          name: 'ids',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getActiveTradingPairIds',
      outputs: [
        {
          internalType: 'uint256[]',
          name: 'ids',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getActiveTradingPairs',
      outputs: [
        {
          components: [
            {
              components: [
                {
                  internalType: 'address',
                  name: 'tokenA',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'tokenB',
                  type: 'address',
                },
                {
                  internalType: 'uint256',
                  name: 'rate',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'tokenASaleAmount',
                  type: 'uint256',
                },
                {
                  internalType: 'uint64',
                  name: 'startDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint64',
                  name: 'endDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint8',
                  name: 'pairType',
                  type: 'uint8',
                },
              ],
              internalType: 'struct MajorityIcoBase.TradingPairSettings',
              name: 'settings',
              type: 'tuple',
            },
            {
              internalType: 'uint256',
              name: 'soldAmount',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'active',
              type: 'bool',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPair[]',
          name: '_tradingPairs',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'start',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'count',
          type: 'uint256',
        },
      ],
      name: 'getActiveTradingPairs',
      outputs: [
        {
          components: [
            {
              components: [
                {
                  internalType: 'address',
                  name: 'tokenA',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'tokenB',
                  type: 'address',
                },
                {
                  internalType: 'uint256',
                  name: 'rate',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'tokenASaleAmount',
                  type: 'uint256',
                },
                {
                  internalType: 'uint64',
                  name: 'startDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint64',
                  name: 'endDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint8',
                  name: 'pairType',
                  type: 'uint8',
                },
              ],
              internalType: 'struct MajorityIcoBase.TradingPairSettings',
              name: 'settings',
              type: 'tuple',
            },
            {
              internalType: 'uint256',
              name: 'soldAmount',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'active',
              type: 'bool',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPair[]',
          name: '_tradingPairs',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getAllTradingPairIds',
      outputs: [
        {
          internalType: 'uint256[]',
          name: 'ids',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16[]',
          name: 'tradingPairIds',
          type: 'uint16[]',
        },
      ],
      name: 'getBatchTradingPairInfo',
      outputs: [
        {
          components: [
            {
              components: [
                {
                  internalType: 'address',
                  name: 'tokenA',
                  type: 'address',
                },
                {
                  internalType: 'address',
                  name: 'tokenB',
                  type: 'address',
                },
                {
                  internalType: 'uint256',
                  name: 'rate',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'tokenASaleAmount',
                  type: 'uint256',
                },
                {
                  internalType: 'uint64',
                  name: 'startDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint64',
                  name: 'endDate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint8',
                  name: 'pairType',
                  type: 'uint8',
                },
              ],
              internalType: 'struct MajorityIcoBase.TradingPairSettings',
              name: 'settings',
              type: 'tuple',
            },
            {
              internalType: 'uint256',
              name: 'soldAmount',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'active',
              type: 'bool',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPair[]',
          name: 'result',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getCurrentTargetConfig',
      outputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'target',
              type: 'address',
            },
            {
              internalType: 'enum IPlugin.Operation',
              name: 'operation',
              type: 'uint8',
            },
          ],
          internalType: 'struct IPlugin.TargetConfig',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getEndDate',
      outputs: [
        {
          internalType: 'uint256',
          name: 'endDate',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getExchangeRate',
      outputs: [
        {
          internalType: 'uint256',
          name: 'rate',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getMetadata',
      outputs: [
        {
          internalType: 'bytes',
          name: '',
          type: 'bytes',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getPairType',
      outputs: [
        {
          internalType: 'uint8',
          name: 'pairType',
          type: 'uint8',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getRemainingTokenAAmount',
      outputs: [
        {
          internalType: 'uint256',
          name: 'remainingAmount',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getStartDate',
      outputs: [
        {
          internalType: 'uint256',
          name: 'startDate',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getTargetConfig',
      outputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'target',
              type: 'address',
            },
            {
              internalType: 'enum IPlugin.Operation',
              name: 'operation',
              type: 'uint8',
            },
          ],
          internalType: 'struct IPlugin.TargetConfig',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTokenA',
      outputs: [
        {
          internalType: 'address',
          name: 'tokenA',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTokenASaleAmount',
      outputs: [
        {
          internalType: 'uint256',
          name: 'tokenASaleAmount',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTokenB',
      outputs: [
        {
          internalType: 'address',
          name: 'tokenB',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getTradingPairCount',
      outputs: [
        {
          internalType: 'uint256',
          name: 'count',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'start',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'count',
          type: 'uint256',
        },
      ],
      name: 'getTradingPairIds',
      outputs: [
        {
          internalType: 'uint256[]',
          name: 'ids',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTradingPairInfo',
      outputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'tokenA',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'tokenB',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'rate',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'tokenASaleAmount',
              type: 'uint256',
            },
            {
              internalType: 'uint64',
              name: 'startDate',
              type: 'uint64',
            },
            {
              internalType: 'uint64',
              name: 'endDate',
              type: 'uint64',
            },
            {
              internalType: 'uint8',
              name: 'pairType',
              type: 'uint8',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPairSettings',
          name: '_tradingPairSettings',
          type: 'tuple',
        },
        {
          internalType: 'uint256',
          name: 'soldAmount',
          type: 'uint256',
        },
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTradingPairSettings',
      outputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'tokenA',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'tokenB',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'rate',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'tokenASaleAmount',
              type: 'uint256',
            },
            {
              internalType: 'uint64',
              name: 'startDate',
              type: 'uint64',
            },
            {
              internalType: 'uint64',
              name: 'endDate',
              type: 'uint64',
            },
            {
              internalType: 'uint8',
              name: 'pairType',
              type: 'uint8',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPairSettings',
          name: '_tradingPairSettings',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'getTradingPairSoldAmount',
      outputs: [
        {
          internalType: 'uint256',
          name: 'soldAmount',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'implementation',
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
      inputs: [],
      name: 'isSaleActive',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'isTradingPairActive',
      outputs: [
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'pluginType',
      outputs: [
        {
          internalType: 'enum IPlugin.PluginType',
          name: '',
          type: 'uint8',
        },
      ],
      stateMutability: 'pure',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
      ],
      name: 'removeTradingPair',
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
          components: [
            {
              internalType: 'address',
              name: 'target',
              type: 'address',
            },
            {
              internalType: 'enum IPlugin.Operation',
              name: 'operation',
              type: 'uint8',
            },
          ],
          internalType: 'struct IPlugin.TargetConfig',
          name: '_targetConfig',
          type: 'tuple',
        },
      ],
      name: 'setTargetConfig',
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
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      name: 'toggleTradingPairStatus',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'tokenSaleSupply',
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
      inputs: [],
      name: 'tokensSold',
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
      inputs: [],
      name: 'tradingPairCount',
      outputs: [
        {
          internalType: 'uint16',
          name: '',
          type: 'uint16',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: '',
          type: 'uint16',
        },
      ],
      name: 'tradingPairs',
      outputs: [
        {
          components: [
            {
              internalType: 'address',
              name: 'tokenA',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'tokenB',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'rate',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'tokenASaleAmount',
              type: 'uint256',
            },
            {
              internalType: 'uint64',
              name: 'startDate',
              type: 'uint64',
            },
            {
              internalType: 'uint64',
              name: 'endDate',
              type: 'uint64',
            },
            {
              internalType: 'uint8',
              name: 'pairType',
              type: 'uint8',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPairSettings',
          name: 'settings',
          type: 'tuple',
        },
        {
          internalType: 'uint256',
          name: 'soldAmount',
          type: 'uint256',
        },
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'tradingPairId',
          type: 'uint16',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'tokenA',
              type: 'address',
            },
            {
              internalType: 'address',
              name: 'tokenB',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'rate',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'tokenASaleAmount',
              type: 'uint256',
            },
            {
              internalType: 'uint64',
              name: 'startDate',
              type: 'uint64',
            },
            {
              internalType: 'uint64',
              name: 'endDate',
              type: 'uint64',
            },
            {
              internalType: 'uint8',
              name: 'pairType',
              type: 'uint8',
            },
          ],
          internalType: 'struct MajorityIcoBase.TradingPairSettings',
          name: '_tradingPairSettings',
          type: 'tuple',
        },
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
      ],
      name: 'updateTradingPair',
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
  bytecode: '0x',
  deployedBytecode: '0x',
  linkReferences: {},
  deployedLinkReferences: {},
}
