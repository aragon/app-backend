export const StagedProposalProcessor = {
  _format: 'hh-sol-artifact-1',
  contractName: 'StagedProposalProcessor',
  sourceName: '',
  abi: [
    {
      type: 'function',
      name: 'CREATE_PROPOSAL_PERMISSION_ID',
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
      name: 'SET_TRUSTED_FORWARDER_PERMISSION_ID',
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
      name: 'UPDATE_METADATA_PERMISSION_ID',
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
      name: 'UPDATE_STAGES_PERMISSION_ID',
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
      name: 'UPGRADE_PLUGIN_PERMISSION_ID',
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
      name: 'advanceProposal',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'canExecute',
      inputs: [
        {
          name: '_proposalId',
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
      name: 'canProposalAdvance',
      inputs: [
        {
          name: '_proposalId',
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
          name: '_allowFailureMap',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_startDate',
          type: 'uint64',
          internalType: 'uint64',
        },
        {
          name: '_data',
          type: 'bytes[][]',
          internalType: 'bytes[][]',
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
          name: '_startDate',
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
      name: 'createProposalId',
      inputs: [
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
          name: '_metadata',
          type: 'bytes',
          internalType: 'bytes',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'pure',
    },
    {
      type: 'function',
      name: 'createProposalParamsABI',
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
      name: 'getCreateProposalParams',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'bytes[][]',
          internalType: 'bytes[][]',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getCurrentConfigIndex',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint16',
          internalType: 'uint16',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getCurrentTargetConfig',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getMetadata',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'bytes',
          internalType: 'bytes',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getPluginResult',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_stageId',
          type: 'uint16',
          internalType: 'uint16',
        },
        {
          name: '_proposalType',
          type: 'uint8',
          internalType: 'enum StagedProposalProcessor.ProposalType',
        },
        {
          name: '_body',
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
      name: 'getProposal',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct StagedProposalProcessor.Proposal',
          components: [
            {
              name: 'allowFailureMap',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'creator',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'lastStageTransition',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'metadata',
              type: 'bytes',
              internalType: 'bytes',
            },
            {
              name: 'actions',
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
              name: 'currentStage',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'stageConfigIndex',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'executed',
              type: 'bool',
              internalType: 'bool',
            },
            {
              name: 'targetConfig',
              type: 'tuple',
              internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
              components: [
                {
                  name: 'target',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'operation',
                  type: 'uint8',
                  internalType: 'enum PluginUUPSUpgradeable.Operation',
                },
              ],
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getProposalTally',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      outputs: [
        {
          name: 'votes',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'vetoes',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getStages',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'tuple[]',
          internalType: 'struct StagedProposalProcessor.Stage[]',
          components: [
            {
              name: 'plugins',
              type: 'tuple[]',
              internalType: 'struct StagedProposalProcessor.Plugin[]',
              components: [
                {
                  name: 'pluginAddress',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'isManual',
                  type: 'bool',
                  internalType: 'bool',
                },
                {
                  name: 'allowedBody',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'proposalType',
                  type: 'uint8',
                  internalType: 'enum StagedProposalProcessor.ProposalType',
                },
              ],
            },
            {
              name: 'maxAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'minAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'voteDuration',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'approvalThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'vetoThreshold',
              type: 'uint16',
              internalType: 'uint16',
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
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getTrustedForwarder',
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
          name: '_dao',
          type: 'address',
          internalType: 'contract IDAO',
        },
        {
          name: '_trustedForwarder',
          type: 'address',
          internalType: 'address',
        },
        {
          name: '_stages',
          type: 'tuple[]',
          internalType: 'struct StagedProposalProcessor.Stage[]',
          components: [
            {
              name: 'plugins',
              type: 'tuple[]',
              internalType: 'struct StagedProposalProcessor.Plugin[]',
              components: [
                {
                  name: 'pluginAddress',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'isManual',
                  type: 'bool',
                  internalType: 'bool',
                },
                {
                  name: 'allowedBody',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'proposalType',
                  type: 'uint8',
                  internalType: 'enum StagedProposalProcessor.ProposalType',
                },
              ],
            },
            {
              name: 'maxAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'minAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'voteDuration',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'approvalThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'vetoThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
          ],
        },
        {
          name: '_metadata',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: '_targetConfig',
          type: 'tuple',
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'pluginProposalIds',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '',
          type: 'address',
          internalType: 'address',
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
      stateMutability: 'pure',
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
      name: 'reportProposalResult',
      inputs: [
        {
          name: '_proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: '_proposalType',
          type: 'uint8',
          internalType: 'enum StagedProposalProcessor.ProposalType',
        },
        {
          name: '_tryAdvance',
          type: 'bool',
          internalType: 'bool',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'setTargetConfig',
      inputs: [
        {
          name: '_targetConfig',
          type: 'tuple',
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'setTrustedForwarder',
      inputs: [
        {
          name: '_forwarder',
          type: 'address',
          internalType: 'address',
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
      type: 'function',
      name: 'updateMetadata',
      inputs: [
        {
          name: '_metadata',
          type: 'bytes',
          internalType: 'bytes',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'updateStages',
      inputs: [
        {
          name: '_stages',
          type: 'tuple[]',
          internalType: 'struct StagedProposalProcessor.Stage[]',
          components: [
            {
              name: 'plugins',
              type: 'tuple[]',
              internalType: 'struct StagedProposalProcessor.Plugin[]',
              components: [
                {
                  name: 'pluginAddress',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'isManual',
                  type: 'bool',
                  internalType: 'bool',
                },
                {
                  name: 'allowedBody',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'proposalType',
                  type: 'uint8',
                  internalType: 'enum StagedProposalProcessor.ProposalType',
                },
              ],
            },
            {
              name: 'maxAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'minAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'voteDuration',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'approvalThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'vetoThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
          ],
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
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
      name: 'MetadataUpdated',
      inputs: [
        {
          name: 'releaseMetadata',
          type: 'bytes',
          indexed: false,
          internalType: 'bytes',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'ProposalAdvanced',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
        {
          name: 'stageId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
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
      name: 'ProposalResultReported',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
        {
          name: 'plugin',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'StagesUpdated',
      inputs: [
        {
          name: 'stages',
          type: 'tuple[]',
          indexed: false,
          internalType: 'struct StagedProposalProcessor.Stage[]',
          components: [
            {
              name: 'plugins',
              type: 'tuple[]',
              internalType: 'struct StagedProposalProcessor.Plugin[]',
              components: [
                {
                  name: 'pluginAddress',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'isManual',
                  type: 'bool',
                  internalType: 'bool',
                },
                {
                  name: 'allowedBody',
                  type: 'address',
                  internalType: 'address',
                },
                {
                  name: 'proposalType',
                  type: 'uint8',
                  internalType: 'enum StagedProposalProcessor.ProposalType',
                },
              ],
            },
            {
              name: 'maxAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'minAdvance',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'voteDuration',
              type: 'uint64',
              internalType: 'uint64',
            },
            {
              name: 'approvalThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'vetoThreshold',
              type: 'uint16',
              internalType: 'uint16',
            },
          ],
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
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'TrustedForwarderUpdated',
      inputs: [
        {
          name: 'forwarder',
          type: 'address',
          indexed: true,
          internalType: 'address',
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
      name: 'AlreadyInitialized',
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
      name: 'EmptyMetadata',
      inputs: [],
    },
    {
      type: 'error',
      name: 'ExecuteFailed',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InsufficientGas',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InterfaceNotSupported',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InvalidTargetConfig',
      inputs: [
        {
          name: 'targetConfig',
          type: 'tuple',
          internalType: 'struct PluginUUPSUpgradeable.TargetConfig',
          components: [
            {
              name: 'target',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'operation',
              type: 'uint8',
              internalType: 'enum PluginUUPSUpgradeable.Operation',
            },
          ],
        },
      ],
    },
    {
      type: 'error',
      name: 'ProposalAlreadyExists',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
    },
    {
      type: 'error',
      name: 'ProposalCannotAdvance',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
    },
    {
      type: 'error',
      name: 'ProposalNotExists',
      inputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
    },
    {
      type: 'error',
      name: 'StageCountZero',
      inputs: [],
    },
  ],
  bytecode: '',
  deployedBytecode: '',
  linkReferences: {},
  deployedLinkReferences: {},
}
