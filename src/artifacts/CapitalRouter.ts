// Factory Events ABIs
export const RouterSourceFactory = {
  _format: 'hh-sol-artifact-1',
  contractName: 'RouterSourceFactory',
  sourceName: 'src/factories/RouterSourceFactory.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract DrainBalanceSource',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'DrainBalanceSourceDeployed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract RequiredBalanceSource',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'RequiredBalanceSourceDeployed',
      type: 'event',
    },
  ],
}

export const OmniSourceFactory = {
  _format: 'hh-sol-artifact-1',
  contractName: 'OmniSourceFactory',
  sourceName: 'src/factories/OmniSourceFactory.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract StreamBalanceSource',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'StreamBalanceSourceDeployed',
      type: 'event',
    },
  ],
}

export const ClaimerSourceFactory = {
  _format: 'hh-sol-artifact-1',
  contractName: 'ClaimerSourceFactory',
  sourceName: 'src/factories/ClaimerSourceFactory.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract FixedBalanceSource',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'FixedBalanceSourceDeployed',
      type: 'event',
    },
  ],
}

export const RouterModelFactory = {
  _format: 'hh-sol-artifact-1',
  contractName: 'RouterModelFactory',
  sourceName: 'src/factories/RouterModelFactory.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract RatioModel',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'RatioModelDeployed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract EqualRatioModel',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'EqualRatioModelDeployed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract BracketsModel',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'BracketsModelDeployed',
      type: 'event',
    },
  ],
}

export const OmniModelFactory = {
  _format: 'hh-sol-artifact-1',
  contractName: 'OmniModelFactory',
  sourceName: 'src/factories/OmniModelFactory.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract AddressGaugeRatioModel',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'AddressGaugeRatioModelDeployed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract TokenGaugeRatioModel',
          name: 'newContract',
          type: 'address',
        },
      ],
      name: 'TokenGaugeRatioModelDeployed',
      type: 'event',
    },
  ],
}

// Common ABI for plugin sources() call
export const PluginSourcesAbi = [
  {
    inputs: [],
    name: 'sources',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// Source Contract ABIs
export const StreamBalanceSource = {
  _format: 'hh-sol-artifact-1',
  contractName: 'StreamBalanceSource',
  sourceName: 'src/sources/StreamBalanceSource.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: '_vault',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'contract IERC20',
          name: '_vaultToken',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: '_amountPerEpoch',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: '_maxSourceBalance',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: '_epochInterval',
          type: 'uint256',
        },
      ],
      name: 'SourceSettingsUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
      ],
      name: 'PluginDefined',
      type: 'event',
    },
    // Read functions for on-chain queries
    {
      inputs: [],
      name: 'vault',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'amountPerEpoch',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'maxSourceBalance',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'epochInterval',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const DrainBalanceSource = {
  _format: 'hh-sol-artifact-1',
  contractName: 'DrainBalanceSource',
  sourceName: 'src/sources/DrainBalanceSource.sol',
  abi: [
    {
      inputs: [],
      name: 'vault',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const RequiredBalanceSource = {
  _format: 'hh-sol-artifact-1',
  contractName: 'RequiredBalanceSource',
  sourceName: 'src/sources/RequiredBalanceSource.sol',
  abi: [
    {
      inputs: [],
      name: 'vault',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'requiredBalance',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const FixedBalanceSource = {
  _format: 'hh-sol-artifact-1',
  contractName: 'FixedBalanceSource',
  sourceName: 'src/sources/FixedBalanceSource.sol',
  abi: [
    {
      inputs: [],
      name: 'token',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'sourceBalance',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

// Model Contract ABIs
export const RatioModel = {
  _format: 'hh-sol-artifact-1',
  contractName: 'RatioModel',
  sourceName: 'src/models/RatioModel.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address[]',
          name: 'recipientList',
          type: 'address[]',
        },
        {
          indexed: false,
          internalType: 'uint32[]',
          name: 'ratioList',
          type: 'uint32[]',
        },
      ],
      name: 'ModelSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'recipients',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'ratios',
      outputs: [{ internalType: 'uint32', name: '', type: 'uint32' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const EqualRatioModel = {
  _format: 'hh-sol-artifact-1',
  contractName: 'EqualRatioModel',
  sourceName: 'src/models/EqualRatioModel.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address[]',
          name: 'recipientList',
          type: 'address[]',
        },
      ],
      name: 'ModelSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'recipients',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const AddressGaugeRatioModel = {
  _format: 'hh-sol-artifact-1',
  contractName: 'AddressGaugeRatioModel',
  sourceName: 'src/models/AddressGaugeRatioModel.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract IAddressGaugeVoter',
          name: 'gaugeVoter',
          type: 'address',
        },
      ],
      name: 'ModelSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [],
      name: 'gaugeVoter',
      outputs: [{ internalType: 'contract IAddressGaugeVoter', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const TokenGaugeRatioModel = {
  _format: 'hh-sol-artifact-1',
  contractName: 'TokenGaugeRatioModel',
  sourceName: 'src/models/TokenGaugeRatioModel.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract ITokenGaugeVoter',
          name: 'gaugeVoter',
          type: 'address',
        },
      ],
      name: 'ModelSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [],
      name: 'gaugeVoter',
      outputs: [{ internalType: 'contract ITokenGaugeVoter', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

// Plugin ABIs
export const RouterPluginBase = {
  _format: 'hh-sol-artifact-1',
  contractName: 'RouterPluginBase',
  sourceName: 'src/base/RouterPluginBase.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'string',
          name: 'pluginId',
          type: 'string',
        },
      ],
      name: 'RouterInitialized',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          components: [
            { internalType: 'address', name: 'to', type: 'address' },
            { internalType: 'uint256', name: 'value', type: 'uint256' },
            { internalType: 'bytes', name: 'data', type: 'bytes' },
          ],
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
      ],
      name: 'Dispatched',
      type: 'event',
    },
    {
      inputs: [],
      name: 'dao',
      outputs: [{ internalType: 'contract IDAO', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'sources',
      outputs: [{ internalType: 'contract IRouterSource[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'pluginId',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const BracketsModel = {
  _format: 'hh-sol-artifact-1',
  contractName: 'BracketsModel',
  sourceName: 'src/models/BracketsModel.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          components: [
            { internalType: 'uint256', name: 'threshold', type: 'uint256' },
            { internalType: 'contract IRouterModel', name: 'routerModel', type: 'address' },
            { internalType: 'contract IClaimerModel', name: 'claimerModel', type: 'address' },
          ],
          indexed: false,
          internalType: 'struct Bracket[]',
          name: 'brackets',
          type: 'tuple[]',
        },
      ],
      name: 'ModelSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'brackets',
      outputs: [
        { internalType: 'uint256', name: 'threshold', type: 'uint256' },
        { internalType: 'contract IRouterModel', name: 'routerModel', type: 'address' },
        { internalType: 'contract IClaimerModel', name: 'claimerModel', type: 'address' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const ClaimerPluginBase = {
  _format: 'hh-sol-artifact-1',
  contractName: 'ClaimerPluginBase',
  sourceName: 'src/base/ClaimerPluginBase.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'string',
          name: 'pluginId',
          type: 'string',
        },
      ],
      name: 'ClaimerInitialized',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          components: [
            { internalType: 'address', name: 'to', type: 'address' },
            { internalType: 'uint256', name: 'value', type: 'uint256' },
            { internalType: 'bytes', name: 'data', type: 'bytes' },
          ],
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
      ],
      name: 'Claimed',
      type: 'event',
    },
    {
      inputs: [],
      name: 'dao',
      outputs: [{ internalType: 'contract IDAO', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'sources',
      outputs: [{ internalType: 'contract IClaimerSource[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'pluginId',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}
