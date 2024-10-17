export const AdminV2 = {
  _format: 'hh-sol-artifact-1',
  contractName: 'Admin',
  sourceName: 'src/plugins/governance/admin/Admin.sol',
  abi: [
    {
      type: 'function',
      name: 'EXECUTE_PROPOSAL_PERMISSION_ID',
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
      name: 'SET_TARGET_CONFIG_PERMISSION_ID',
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
      name: 'canExecute',
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
      name: 'createProposal',
      inputs: [
        {
          name: '_metadata',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: '_actions',
          type: 'tuple[]',
          internalType: 'struct Action[]',
          components: [
            {
              name: 'to',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'data',
              type: 'bytes',
              internalType: 'bytes',
            },
          ],
        },
        {
          name: '',
          type: 'uint64',
          internalType: 'uint64',
        },
        {
          name: '',
          type: 'uint64',
          internalType: 'uint64',
        },
        {
          name: '_data',
          type: 'bytes',
          internalType: 'bytes',
        },
      ],
      outputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'customProposalParamsABI',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'string',
          internalType: 'string',
        },
      ],
      stateMutability: 'pure',
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
      name: 'executeProposal',
      inputs: [
        {
          name: '_metadata',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: '_actions',
          type: 'tuple[]',
          internalType: 'struct Action[]',
          components: [
            {
              name: 'to',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'data',
              type: 'bytes',
              internalType: 'bytes',
            },
          ],
        },
        {
          name: '_allowFailureMap',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'getCurrentTargetConfig',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getTargetConfig',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'initialize',
      inputs: [
        {
          name: '_dao',
          type: 'address',
          internalType: 'contract IDAO',
        },
        {
          name: '_targetConfig',
          type: 'tuple',
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'isMember',
      inputs: [
        {
          name: '_account',
          type: 'address',
          internalType: 'address',
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
      name: 'pluginType',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint8',
          internalType: 'enum IPlugin.PluginType',
        },
      ],
      stateMutability: 'pure',
    },
    {
      type: 'function',
      name: 'proposalCount',
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
      name: 'protocolVersion',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint8[3]',
          internalType: 'uint8[3]',
        },
      ],
      stateMutability: 'pure',
    },
    {
      type: 'function',
      name: 'setTargetConfig',
      inputs: [
        {
          name: '_targetConfig',
          type: 'tuple',
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'supportsInterface',
      inputs: [
        {
          name: '_interfaceId',
          type: 'bytes4',
          internalType: 'bytes4',
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
      name: 'MembersAdded',
      inputs: [
        {
          name: 'members',
          type: 'address[]',
          indexed: false,
          internalType: 'address[]',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'MembersRemoved',
      inputs: [
        {
          name: 'members',
          type: 'address[]',
          indexed: false,
          internalType: 'address[]',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'MembershipContractAnnounced',
      inputs: [
        {
          name: 'definingContract',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'ProposalCreated',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
        {
          name: 'creator',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'startDate',
          type: 'uint64',
          indexed: false,
          internalType: 'uint64',
        },
        {
          name: 'endDate',
          type: 'uint64',
          indexed: false,
          internalType: 'uint64',
        },
        {
          name: 'metadata',
          type: 'bytes',
          indexed: false,
          internalType: 'bytes',
        },
        {
          name: 'actions',
          type: 'tuple[]',
          indexed: false,
          internalType: 'struct Action[]',
          components: [
            {
              name: 'to',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'data',
              type: 'bytes',
              internalType: 'bytes',
            },
          ],
        },
        {
          name: 'allowFailureMap',
          type: 'uint256',
          indexed: false,
          internalType: 'uint256',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'ProposalExecuted',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'TargetSet',
      inputs: [
        {
          name: 'newTargetConfig',
          type: 'tuple',
          indexed: false,
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
      anonymous: false,
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
      name: 'DelegateCallFailed',
      inputs: [],
    },
    {
      type: 'error',
      name: 'FunctionDeprecated',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InvalidTargetConfig',
      inputs: [
        {
          name: 'targetConfig',
          type: 'tuple',
          internalType: 'struct IPlugin.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum IPlugin.Operation',
            },
          ],
        },
      ],
    },
  ],
  bytecode: '',
  deployedBytecode: '',
  linkReferences: {},
  deployedLinkReferences: {},
}
