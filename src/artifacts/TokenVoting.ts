export const TokenVoting = {
  _format: 'hh-sol-artifact-1',
  contractName: 'TokenVoting',
  sourceName: 'src/plugins/governance/majority-voting/token/TokenVoting.sol',
  abi: [
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
      inputs: [
        {
          internalType: 'uint64',
          name: 'limit',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: 'actual',
          type: 'uint64',
        },
      ],
      name: 'DateOutOfBounds',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint64',
          name: 'limit',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: 'actual',
          type: 'uint64',
        },
      ],
      name: 'MinDurationOutOfBounds',
      type: 'error',
    },
    {
      inputs: [],
      name: 'NoVotingPower',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
      ],
      name: 'ProposalCreationForbidden',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
      ],
      name: 'ProposalExecutionForbidden',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'limit',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'actual',
          type: 'uint256',
        },
      ],
      name: 'RatioOutOfBounds',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
        {
          internalType: 'enum IMajorityVoting.VoteOption',
          name: 'voteOption',
          type: 'uint8',
        },
      ],
      name: 'VoteCastForbidden',
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
          internalType: 'address[]',
          name: 'members',
          type: 'address[]',
        },
      ],
      name: 'MembersAdded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address[]',
          name: 'members',
          type: 'address[]',
        },
      ],
      name: 'MembersRemoved',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'definingContract',
          type: 'address',
        },
      ],
      name: 'MembershipContractAnnounced',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'creator',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'startDate',
          type: 'uint64',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'endDate',
          type: 'uint64',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'metadata',
          type: 'bytes',
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
      ],
      name: 'ProposalCreated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
      ],
      name: 'ProposalExecuted',
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
          indexed: true,
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'voter',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'enum IMajorityVoting.VoteOption',
          name: 'fromVoteOption',
          type: 'uint8',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'votingPower',
          type: 'uint256',
        },
      ],
      name: 'ObjectionCast',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'voter',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'enum IMajorityVoting.VoteOption',
          name: 'voteOption',
          type: 'uint8',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'votingPower',
          type: 'uint256',
        },
      ],
      name: 'VoteCast',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'enum MajorityVotingBase.VotingMode',
          name: 'votingMode',
          type: 'uint8',
        },
        {
          indexed: false,
          internalType: 'uint32',
          name: 'supportThreshold',
          type: 'uint32',
        },
        {
          indexed: false,
          internalType: 'uint32',
          name: 'minParticipation',
          type: 'uint32',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'minDuration',
          type: 'uint64',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'minProposerVotingPower',
          type: 'uint256',
        },
      ],
      name: 'VotingSettingsUpdated',
      type: 'event',
    },
    {
      inputs: [],
      name: 'UPDATE_VOTING_SETTINGS_PERMISSION_ID',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'canExecute',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: '_voter',
          type: 'address',
        },
        {
          internalType: 'enum IMajorityVoting.VoteOption',
          name: '_voteOption',
          type: 'uint8',
        },
      ],
      name: 'canVote',
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
        {
          internalType: 'uint64',
          name: '_startDate',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: '_endDate',
          type: 'uint64',
        },
        {
          internalType: 'enum IMajorityVoting.VoteOption',
          name: '_voteOption',
          type: 'uint8',
        },
        {
          internalType: 'bool',
          name: '_tryEarlyExecution',
          type: 'bool',
        },
      ],
      name: 'createProposal',
      outputs: [
        {
          internalType: 'uint256',
          name: 'proposalId',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'execute',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'getTokenVotingProposal',
      outputs: [
        {
          components: [
            {
              internalType: 'enum MajorityVotingBase.VotingMode',
              name: 'votingMode',
              type: 'uint8',
            },
            {
              internalType: 'uint32',
              name: 'supportThreshold',
              type: 'uint32',
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
              internalType: 'uint64',
              name: 'snapshotTimepoint',
              type: 'uint64',
            },
            {
              internalType: 'uint256',
              name: 'minVotingPower',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.ProposalParameters',
          name: 'parameters',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'uint256',
              name: 'abstain',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'yes',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'no',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.Tally',
          name: 'tally',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'getProposal',
      outputs: [
        {
          internalType: 'bool',
          name: 'open',
          type: 'bool',
        },
        {
          internalType: 'bool',
          name: 'executed',
          type: 'bool',
        },
        {
          components: [
            {
              internalType: 'enum MajorityVotingBase.VotingMode',
              name: 'votingMode',
              type: 'uint8',
            },
            {
              internalType: 'uint32',
              name: 'supportThreshold',
              type: 'uint32',
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
              internalType: 'uint64',
              name: 'snapshotBlock',
              type: 'uint64',
            },
            {
              internalType: 'uint256',
              name: 'minVotingPower',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.ProposalParameters',
          name: 'parameters',
          type: 'tuple',
        },
        {
          components: [
            {
              internalType: 'uint256',
              name: 'abstain',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'yes',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'no',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.Tally',
          name: 'tally',
          type: 'tuple',
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
          name: 'actions',
          type: 'tuple[]',
        },
        {
          internalType: 'uint256',
          name: 'allowFailureMap',
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
          name: '_proposalId',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: '_voter',
          type: 'address',
        },
      ],
      name: 'getVoteOption',
      outputs: [
        {
          internalType: 'enum IMajorityVoting.VoteOption',
          name: '',
          type: 'uint8',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getVotingToken',
      outputs: [
        {
          internalType: 'contract IVotesUpgradeable',
          name: '',
          type: 'address',
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
      inputs: [
        {
          internalType: 'contract IDAO',
          name: '_dao',
          type: 'address',
        },
        {
          components: [
            {
              internalType: 'enum MajorityVotingBase.VotingMode',
              name: 'votingMode',
              type: 'uint8',
            },
            {
              internalType: 'uint32',
              name: 'supportThreshold',
              type: 'uint32',
            },
            {
              internalType: 'uint32',
              name: 'minParticipation',
              type: 'uint32',
            },
            {
              internalType: 'uint64',
              name: 'minDuration',
              type: 'uint64',
            },
            {
              internalType: 'uint256',
              name: 'minProposerVotingPower',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.VotingSettings',
          name: '_votingSettings',
          type: 'tuple',
        },
        {
          internalType: 'contract IVotesUpgradeable',
          name: '_token',
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
          name: '_account',
          type: 'address',
        },
      ],
      name: 'isMember',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'isMinParticipationReached',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'isSupportThresholdReached',
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
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
      ],
      name: 'isSupportThresholdReachedEarly',
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
      name: 'minDuration',
      outputs: [
        {
          internalType: 'uint64',
          name: '',
          type: 'uint64',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'minParticipation',
      outputs: [
        {
          internalType: 'uint32',
          name: '',
          type: 'uint32',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'minProposerVotingPower',
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
      name: 'proposalCount',
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
      inputs: [],
      name: 'supportThreshold',
      outputs: [
        {
          internalType: 'uint32',
          name: '',
          type: 'uint32',
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
          internalType: 'uint256',
          name: '_blockNumber',
          type: 'uint256',
        },
      ],
      name: 'totalVotingPower',
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
          components: [
            {
              internalType: 'enum MajorityVotingBase.VotingMode',
              name: 'votingMode',
              type: 'uint8',
            },
            {
              internalType: 'uint32',
              name: 'supportThreshold',
              type: 'uint32',
            },
            {
              internalType: 'uint32',
              name: 'minParticipation',
              type: 'uint32',
            },
            {
              internalType: 'uint64',
              name: 'minDuration',
              type: 'uint64',
            },
            {
              internalType: 'uint256',
              name: 'minProposerVotingPower',
              type: 'uint256',
            },
          ],
          internalType: 'struct MajorityVotingBase.VotingSettings',
          name: '_votingSettings',
          type: 'tuple',
        },
      ],
      name: 'updateVotingSettings',
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
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_proposalId',
          type: 'uint256',
        },
        {
          internalType: 'enum IMajorityVoting.VoteOption',
          name: '_voteOption',
          type: 'uint8',
        },
        {
          internalType: 'bool',
          name: '_tryEarlyExecution',
          type: 'bool',
        },
      ],
      name: 'vote',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'votingMode',
      outputs: [
        {
          internalType: 'enum MajorityVotingBase.VotingMode',
          name: '',
          type: 'uint8',
        },
      ],
      stateMutability: 'view',
      type: 'function',
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
  ],
  bytecode:
    '0x60a0604052306080523480156200001557600080fd5b506200002062000026565b620000e7565b600054610100900460ff1615620000935760405162461bcd60e51b815260206004820152602760248201527f496e697469616c697a61626c653a20636f6e747261637420697320696e697469604482015266616c697a696e6760c81b606482015260840160405180910390fd5b60005460ff90811614620000e5576000805460ff191660ff9081179091556040519081527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b565b608051613a136200011f6000396000818161080e015281816108a9015281816109b001528181610a460152610b3d0152613a136000f3fe6080604052600436106101d85760003560e01c80635c60da1b11610102578063c9c4bfca11610095578063da35c66411610064578063da35c664146105f3578063e28c3b1914610608578063f60046b214610627578063fe0d94c11461063d57600080fd5b8063c9c4bfca1461055f578063cc63604a14610593578063ce6366c4146105b3578063cf131149146105d357600080fd5b80639cba3021116100d15780639cba3021146104cd578063a230c524146104ed578063b2673b071461050d578063c7f758a81461052d57600080fd5b80635c60da1b1461041f5780637c36e8e8146104345780638a4b00f814610455578063970601d81461047557600080fd5b80632ae9c6001161017a5780634f1ef286116101495780634f1ef2861461039657806352d1902d146103a9578063536f9f42146103be57806356715761146103de57600080fd5b80632ae9c6001461030e5780633659cfe6146103305780634162169f1461035057806341de68301461038257600080fd5b80630dfb278e116101b65780630dfb278e1461026857806317d1b4041461028a5780631befc405146102aa57806323d07188146102ec57600080fd5b806301ffc9a7146101dd578063054fd2c2146102125780630de2185614610248575b600080fd5b3480156101e957600080fd5b506101fd6101f8366004612bc8565b61065d565b60405190151581526020015b60405180910390f35b34801561021e57600080fd5b506101605465010000000000900463ffffffff165b60405163ffffffff9091168152602001610209565b34801561025457600080fd5b506101fd610263366004612bf2565b6106d5565b34801561027457600080fd5b50610288610283366004612c23565b610778565b005b34801561029657600080fd5b506101fd6102a5366004612c68565b6107c3565b3480156102b657600080fd5b506102de7fbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe581565b604051908152602001610209565b3480156102f857600080fd5b506101605460ff165b6040516102099190612ccc565b34801561031a57600080fd5b506103236107da565b6040516102099190612cdf565b34801561033c57600080fd5b5061028861034b366004612d13565b610804565b34801561035c57600080fd5b5060c9546001600160a01b03165b6040516001600160a01b039091168152602001610209565b34801561038e57600080fd5b506000610301565b6102886103a4366004612d9f565b6109a6565b3480156103b557600080fd5b506102de610b30565b3480156103ca57600080fd5b506102de6103d9366004612bf2565b610bf6565b3480156103ea57600080fd5b50610160546901000000000000000000900467ffffffffffffffff1660405167ffffffffffffffff9091168152602001610209565b34801561042b57600080fd5b5061036a610c7e565b34801561044057600080fd5b5061016054610100900463ffffffff16610233565b34801561046157600080fd5b506101fd610470366004612bf2565b610cb6565b34801561048157600080fd5b506104c0610490366004612e32565b600082815261015f602090815260408083206001600160a01b038516845260060190915290205460ff1692915050565b6040516102099190612e76565b3480156104d957600080fd5b506102de6104e8366004612f0a565b610cf6565b3480156104f957600080fd5b506101fd610508366004612d13565b6110cf565b34801561051957600080fd5b50610288610528366004612fef565b6111f2565b34801561053957600080fd5b5061054d610548366004612bf2565b61136c565b6040516102099695949392919061310a565b34801561056b57600080fd5b506102de7f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f581565b34801561059f57600080fd5b506101fd6105ae366004612bf2565b6115d4565b3480156105bf57600080fd5b506102886105ce3660046131c2565b6115df565b3480156105df57600080fd5b506101fd6105ee366004612bf2565b611633565b3480156105ff57600080fd5b506102de611695565b34801561061457600080fd5b50610191546001600160a01b031661036a565b34801561063357600080fd5b50610161546102de565b34801561064957600080fd5b50610288610658366004612bf2565b6116a1565b60006001600160e01b031982167f50eb001e0000000000000000000000000000000000000000000000000000000014806106c057506001600160e01b031982167fa230c52400000000000000000000000000000000000000000000000000000000145b806106cf57506106cf826116ec565b92915050565b600081815261015f602052604081206003810154600482015460018301548492919061071190600160a81b900467ffffffffffffffff16610bf6565b61071b919061320d565b610725919061320d565b6001830154909150610743908290610100900463ffffffff16613220565b6004830154600184015461076590610100900463ffffffff16620f424061320d565b61076f9190613220565b11949350505050565b60c9547fbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe5906107b6906001600160a01b031630335b8460003661175e565b6107bf8261184c565b5050565b60006107d0848484611a4f565b90505b9392505050565b6107e2612baa565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001630036108a75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084015b60405180910390fd5b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03166109027f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b03161461097e5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f78790000000000000000000000000000000000000000606482015260840161089e565b61098781611bbc565b604080516000808252602082019092526109a391839190611bf5565b50565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610a445760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c0000000000000000000000000000000000000000606482015260840161089e565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610a9f7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610b1b5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f78790000000000000000000000000000000000000000606482015260840161089e565b610b2482611bbc565b6107bf82826001611bf5565b6000306001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001614610bd05760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c0000000000000000606482015260840161089e565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5b90565b610191546040517f8e539e8c000000000000000000000000000000000000000000000000000000008152600481018390526000916001600160a01b031690638e539e8c90602401602060405180830381865afa158015610c5a573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906106cf9190613237565b6000610cb17f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b905090565b600081815261015f602052604081206002810154600382015460058301546004840154610ce39190613250565b610ced9190613250565b10159392505050565b600080610d036101615490565b90508015610e48576101915481906001600160a01b0316639ab24eb0336040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610d64573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610d889190613237565b108015610e0f57506101915481906001600160a01b03166370a08231336040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610de9573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610e0d9190613237565b105b15610e48576040517feab9934400000000000000000000000000000000000000000000000000000000815233600482015260240161089e565b5060001943016000610e5982610bf6565b905080600003610e95576040517f7c176b7400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610e9f8787611d9a565b9097509550610eb4338d8d8a8a8f8f8f611edb565b600081815261015f6020526040902060018101805467ffffffffffffffff8a81166d0100000000000000000000000000027fffffffffffffffffffffff0000000000000000ffffffffffffffffffffffffff918d166501000000000002919091167fffffffffffffffffffffff00000000000000000000000000000000ffffffffff90921691909117179055909350610f4c83611f41565b60018201805467ffffffffffffffff92909216600160a81b027fffffff0000000000000000ffffffffffffffffffffffffffffffffffffffffff909216919091179055610f9c6101605460ff1690565b60018083018054909160ff1990911690836002811115610fbe57610fbe612ca6565b021790555061016054610100900463ffffffff166001820180547fffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000ff1661010063ffffffff93841602179055610160546110289184916501000000000090041663ffffffff16611fc5565b6002820155881561103b57600881018990555b60005b8a81101561109a57816007018c8c8381811061105c5761105c613263565b905060200281019061106e9190613279565b8154600181018355600092835260209092209091600302016110908282613313565b505060010161103e565b5060008660038111156110af576110af612ca6565b146110bf576110bf8487876115df565b5050509998505050505050505050565b610191546040517f9ab24eb00000000000000000000000000000000000000000000000000000000081526001600160a01b0383811660048301526000928392911690639ab24eb090602401602060405180830381865afa158015611137573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061115b9190613237565b11806106cf5750610191546040517f70a082310000000000000000000000000000000000000000000000000000000081526001600160a01b03848116600483015260009216906370a0823190602401602060405180830381865afa1580156111c7573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906111eb9190613237565b1192915050565b600054610100900460ff16158080156112125750600054600160ff909116105b8061122c5750303b15801561122c575060005460ff166001145b61129e5760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a6564000000000000000000000000000000000000606482015260840161089e565b6000805460ff1916600117905580156112c1576000805461ff0019166101001790555b6112cb8484612055565b610191805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0384169081179091556040517f3f1ec22954d444cb99f80a1989ac8f631616b8a575a89379e514c0f7f748c93390600090a28015611366576000805461ff0019169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b50505050565b6040805160c081018252600080825260208201819052918101829052606081018290526080810182905260a0810182905281906113c360405180606001604052806000815260200160008152602001600081525090565b600085815261015f60205260408120606091906113df816120e4565b81546040805160c08101909152600184018054939a5060ff928316995090929091839116600281111561141457611414612ca6565b600281111561142557611425612ca6565b8152815463ffffffff61010082041660208084019190915267ffffffffffffffff65010000000000830481166040808601919091526d010000000000000000000000000084048216606080870191909152600160a81b909404909116608085015260019094015460a090930192909252825190810183526003850154815260048501548183015260058501548184015260078501805484518185028101850190955280855294995090975091929060009084015b828210156115bd576000848152602090819020604080516060810182526003860290920180546001600160a01b031683526001810154938301939093526002830180549293929184019161152c90613299565b80601f016020809104026020016040519081016040528092919081815260200182805461155890613299565b80156115a55780601f1061157a576101008083540402835291602001916115a5565b820191906000526020600020905b81548152906001019060200180831161158857829003601f168201915b505050505081525050815260200190600101906114d9565b505050509250806008015491505091939550919395565b60006106cf82612152565b336115eb848285611a4f565b611627578381846040517f70b4b25400000000000000000000000000000000000000000000000000000000815260040161089e93929190613444565b611366848483856121fa565b600081815261015f60205260408120600581015460018201546116619190610100900463ffffffff16613220565b6004820154600183015461168390610100900463ffffffff16620f424061320d565b61168d9190613220565b119392505050565b6000610cb161012d5490565b6116aa81612152565b6116e3576040517f9fefd0f10000000000000000000000000000000000000000000000000000000081526004810182905260240161089e565b6109a3816124a1565b60006001600160e01b031982167f8678b01e00000000000000000000000000000000000000000000000000000000148061174f57506001600160e01b031982167f4d19145e00000000000000000000000000000000000000000000000000000000145b806106cf57506106cf82612609565b6040517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0387169063fdef9106906117ab9088908890889088908890600401613492565b602060405180830381865afa1580156117c8573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906117ec91906134d0565b611844576040517f32dbe3b40000000000000000000000000000000000000000000000000000000081526001600160a01b0380881660048301528087166024830152851660448201526064810184905260840161089e565b505050505050565b61185a6001620f424061320d565b61186a60408301602084016134ff565b63ffffffff1611156118d5576118846001620f424061320d565b61189460408301602084016134ff565b6040517fcc80c195000000000000000000000000000000000000000000000000000000008152600481019290925263ffffffff16602482015260440161089e565b620f42406118e960608301604084016134ff565b63ffffffff16111561190957620f424061189460608301604084016134ff565b610e1061191c608083016060840161351c565b67ffffffffffffffff16101561198557610e1061193f608083016060840161351c565b6040517fc51033ee00000000000000000000000000000000000000000000000000000000815267ffffffffffffffff92831660048201529116602482015260440161089e565b6301e1338061199a608083016060840161351c565b67ffffffffffffffff1611156119bf576301e1338061193f608083016060840161351c565b806101606119cd8282613553565b507fa8a18d06ddd19f24a872740e3d364c86f62be25f7154525dda18ef07fda46f3e90506119fe6020830183613666565b611a0e60408401602085016134ff565b611a1e60608501604086016134ff565b611a2e608086016060870161351c565b8560800135604051611a44959493929190613683565b60405180910390a150565b600083815261015f60205260408120611a67816120e4565b611a755760009150506107d3565b6000836003811115611a8957611a89612ca6565b03611a985760009150506107d3565b6101915460018201546040517f3a46b1a80000000000000000000000000000000000000000000000000000000081526001600160a01b038781166004830152600160a81b90920467ffffffffffffffff166024820152911690633a46b1a890604401602060405180830381865afa158015611b17573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611b3b9190613237565b600003611b4c5760009150506107d3565b6001600160a01b038416600090815260068201602052604081205460ff166003811115611b7b57611b7b612ca6565b14158015611ba257506002600182015460ff166002811115611b9f57611b9f612ca6565b14155b15611bb15760009150506107d3565b506001949350505050565b60c9547f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f5906107bf906001600160a01b031630336107ad565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff1615611c2d57611c2883612647565b505050565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015611c87575060408051601f3d908101601f19168201909252611c8491810190613237565b60015b611cf95760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f742055555053000000000000000000000000000000000000606482015260840161089e565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc8114611d8e5760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c65555549440000000000000000000000000000000000000000000000606482015260840161089e565b50611c28838383612712565b6000806000611da842611f41565b90508467ffffffffffffffff16600003611dc457809250611e29565b8492508067ffffffffffffffff168367ffffffffffffffff161015611e29576040517f4cc9c0f400000000000000000000000000000000000000000000000000000000815267ffffffffffffffff80831660048301528416602482015260440161089e565b61016054600090611e51906901000000000000000000900467ffffffffffffffff16856136bf565b90508467ffffffffffffffff16600003611e6d57809250611ed2565b8492508067ffffffffffffffff168367ffffffffffffffff161015611ed2576040517f4cc9c0f400000000000000000000000000000000000000000000000000000000815267ffffffffffffffff80831660048301528416602482015260440161089e565b50509250929050565b6000611ee5612737565b9050886001600160a01b0316817fa6c1f8f4276dc3f243459e13b557c84e8f4e90b2e09070bad5f6909cee687c9288888c8c8a8a8a604051611f2d97969594939291906136e0565b60405180910390a398975050505050505050565b600067ffffffffffffffff821115611fc15760405162461bcd60e51b815260206004820152602660248201527f53616665436173743a2076616c756520646f65736e27742066697420696e203660448201527f3420626974730000000000000000000000000000000000000000000000000000606482015260840161089e565b5090565b6000620f4240821115612010576040517fcc80c195000000000000000000000000000000000000000000000000000000008152620f424060048201526024810183905260440161089e565b61201a8284613220565b9250600061202b620f424085613805565b905061203a620f424085613819565b9150801561204e5761204b8261382d565b91505b5092915050565b600054610100900460ff166120d25760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b6120db82612752565b6107bf8161184c565b6000806120f042611f41565b600184015490915067ffffffffffffffff80831665010000000000909204161180159061213f5750600183015467ffffffffffffffff6d01000000000000000000000000009091048116908216105b80156107d3575050905460ff1615919050565b600081815261015f60205260408120805460ff16156121745750600092915050565b61217d816120e4565b156121c55760018082015460ff16600281111561219c5761219c612ca6565b146121aa5750600092915050565b6121b3836106d5565b6121c05750600092915050565b6121db565b6121ce83611633565b6121db5750600092915050565b6121e483610cb6565b6121f15750600092915050565b50600192915050565b600084815261015f602052604080822061019154600182015492517f3a46b1a80000000000000000000000000000000000000000000000000000000081526001600160a01b038781166004830152600160a81b90940467ffffffffffffffff1660248201529193921690633a46b1a890604401602060405180830381865afa15801561228a573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906122ae9190613237565b6001600160a01b038516600090815260068401602052604090205490915060ff1660028160038111156122e3576122e3612ca6565b036123025760048301546122f890839061320d565b6004840155612364565b600381600381111561231657612316612ca6565b0361233557600583015461232b90839061320d565b6005840155612364565b600181600381111561234957612349612ca6565b0361236457600383015461235e90839061320d565b60038401555b600286600381111561237857612378612ca6565b0361239757600483015461238d908390613250565b60048401556123f9565b60038660038111156123ab576123ab612ca6565b036123ca5760058301546123c0908390613250565b60058401556123f9565b60018660038111156123de576123de612ca6565b036123f95760038301546123f3908390613250565b60038401555b6001600160a01b03851660009081526006840160205260409020805487919060ff1916600183600381111561243057612430612ca6565b0217905550846001600160a01b0316877fb83d25c6a5d258561330739951487acb4bd09ba5190b5d32c4f261817d9067928885604051612471929190613847565b60405180910390a383801561248a575061248a87612152565b1561249857612498876124a1565b50505050505050565b600081815261015f60205260409020805460ff19166001179055611c286124d060c9546001600160a01b031690565b8261015f6000858152602001908152602001600020600701805480602002602001604051908101604052809291908181526020016000905b828210156125ec576000848152602090819020604080516060810182526003860290920180546001600160a01b031683526001810154938301939093526002830180549293929184019161255b90613299565b80601f016020809104026020016040519081016040528092919081815260200182805461258790613299565b80156125d45780601f106125a9576101008083540402835291602001916125d4565b820191906000526020600020905b8154815290600101906020018083116125b757829003601f168201915b50505050508152505081526020019060010190612508565b505050600086815261015f602052604090206008015490506127d8565b60006001600160e01b031982167fda35c6640000000000000000000000000000000000000000000000000000000014806106cf57506106cf826128a7565b6001600160a01b0381163b6126c45760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e747261637400000000000000000000000000000000000000606482015260840161089e565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b61271b83612976565b6000825111806127285750805b15611c285761136683836129b6565b6000612741611695565b9050610bf361012d80546001019055565b600054610100900460ff166127cf5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b6109a3816129db565b6040517fc71bf3240000000000000000000000000000000000000000000000000000000081526060906000906001600160a01b0387169063c71bf3249061282790889088908890600401613862565b6000604051808303816000875af1158015612846573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261286e919081019061388b565b604051919350915085907f712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f90600090a294509492505050565b60006001600160e01b031982167f41de683000000000000000000000000000000000000000000000000000000000148061290a57506001600160e01b031982167f2ae9c60000000000000000000000000000000000000000000000000000000000145b8061293e57506001600160e01b031982167f52d1902d00000000000000000000000000000000000000000000000000000000145b806106cf57507f01ffc9a7000000000000000000000000000000000000000000000000000000006001600160e01b03198316146106cf565b61297f81612647565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b60606107d383836040518060600160405280602781526020016139b760279139612a87565b600054610100900460ff16612a585760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b60c9805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b6060600080856001600160a01b031685604051612aa49190613991565b600060405180830381855af49150503d8060008114612adf576040519150601f19603f3d011682016040523d82523d6000602084013e612ae4565b606091505b5091509150612af586838387612aff565b9695505050505050565b60608315612b6e578251600003612b67576001600160a01b0385163b612b675760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604482015260640161089e565b5081612b78565b612b788383612b80565b949350505050565b815115612b905781518083602001fd5b8060405162461bcd60e51b815260040161089e91906139a3565b60405180606001604052806003906020820280368337509192915050565b600060208284031215612bda57600080fd5b81356001600160e01b0319811681146107d357600080fd5b600060208284031215612c0457600080fd5b5035919050565b600060a08284031215612c1d57600080fd5b50919050565b600060a08284031215612c3557600080fd5b6107d38383612c0b565b6001600160a01b03811681146109a357600080fd5b803560048110612c6357600080fd5b919050565b600080600060608486031215612c7d57600080fd5b833592506020840135612c8f81612c3f565b9150612c9d60408501612c54565b90509250925092565b634e487b7160e01b600052602160045260246000fd5b600381106109a3576109a3612ca6565b60208101612cd983612cbc565b91905290565b60608101818360005b6003811015612d0a57815160ff16835260209283019290910190600101612ce8565b50505092915050565b600060208284031215612d2557600080fd5b81356107d381612c3f565b634e487b7160e01b600052604160045260246000fd5b604051601f8201601f1916810167ffffffffffffffff81118282101715612d6f57612d6f612d30565b604052919050565b600067ffffffffffffffff821115612d9157612d91612d30565b50601f01601f191660200190565b60008060408385031215612db257600080fd5b8235612dbd81612c3f565b9150602083013567ffffffffffffffff811115612dd957600080fd5b8301601f81018513612dea57600080fd5b8035612dfd612df882612d77565b612d46565b818152866020838501011115612e1257600080fd5b816020840160208301376000602083830101528093505050509250929050565b60008060408385031215612e4557600080fd5b823591506020830135612e5781612c3f565b809150509250929050565b60048110612e7257612e72612ca6565b9052565b602081016106cf8284612e62565b60008083601f840112612e9657600080fd5b50813567ffffffffffffffff811115612eae57600080fd5b6020830191508360208260051b8501011115612ec957600080fd5b9250929050565b67ffffffffffffffff811681146109a357600080fd5b8035612c6381612ed0565b80151581146109a357600080fd5b8035612c6381612ef1565b600080600080600080600080600060e08a8c031215612f2857600080fd5b893567ffffffffffffffff80821115612f4057600080fd5b818c0191508c601f830112612f5457600080fd5b813581811115612f6357600080fd5b8d6020828501011115612f7557600080fd5b60209283019b509950908b01359080821115612f9057600080fd5b50612f9d8c828d01612e84565b90985096505060408a01359450612fb660608b01612ee6565b9350612fc460808b01612ee6565b9250612fd260a08b01612c54565b9150612fe060c08b01612eff565b90509295985092959850929598565b600080600060e0848603121561300457600080fd5b833561300f81612c3f565b925061301e8560208601612c0b565b915060c084013561302e81612c3f565b809150509250925092565b60005b8381101561305457818101518382015260200161303c565b50506000910152565b60008151808452613075816020860160208601613039565b601f01601f19169290920160200192915050565b600082825180855260208086019550808260051b84010181860160005b848110156130fd57858303601f19018952815180516001600160a01b0316845284810151858501526040908101516060918501829052906130e98186018361305d565b9a86019a94505050908301906001016130a6565b5090979650505050505050565b60006101a088151583528715156020840152865161312781612cbc565b8060408501525063ffffffff6020880151166060840152604087015167ffffffffffffffff80821660808601528060608a01511660a08601528060808a01511660c0860152505060a087015160e084015261319a6101008401878051825260208082015190830152604090810151910152565b806101608401526131ad81840186613089565b91505082610180830152979650505050505050565b6000806000606084860312156131d757600080fd5b833592506131e760208501612c54565b9150604084013561302e81612ef1565b634e487b7160e01b600052601160045260246000fd5b818103818111156106cf576106cf6131f7565b80820281158282048414176106cf576106cf6131f7565b60006020828403121561324957600080fd5b5051919050565b808201808211156106cf576106cf6131f7565b634e487b7160e01b600052603260045260246000fd5b60008235605e1983360301811261328f57600080fd5b9190910192915050565b600181811c908216806132ad57607f821691505b602082108103612c1d57634e487b7160e01b600052602260045260246000fd5b601f821115611c2857600081815260208120601f850160051c810160208610156132f45750805b601f850160051c820191505b8181101561184457828155600101613300565b813561331e81612c3f565b6001600160a01b03811673ffffffffffffffffffffffffffffffffffffffff1983541617825550600160208084013582840155600283016040850135601e1986360301811261336c57600080fd5b8501803567ffffffffffffffff81111561338557600080fd5b803603848301131561339657600080fd5b6133aa816133a48554613299565b856132cd565b6000601f8211600181146133e057600083156133c857508382018601355b600019600385901b1c1916600184901b178555613439565b600085815260209020601f19841690835b82811015613410578685018901358255938801939089019088016133f1565b508482101561342f5760001960f88660031b161c198885880101351681555b50508683881b0185555b505050505050505050565b8381526001600160a01b038316602082015260608101612b786040830184612e62565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60006001600160a01b038088168352808716602084015250846040830152608060608301526134c5608083018486613467565b979650505050505050565b6000602082840312156134e257600080fd5b81516107d381612ef1565b63ffffffff811681146109a357600080fd5b60006020828403121561351157600080fd5b81356107d3816134ed565b60006020828403121561352e57600080fd5b81356107d381612ed0565b600381106109a357600080fd5b600081356106cf81612ed0565b813561355e81613539565b61356781612cbc565b815460ff821691508160ff1982161783556020840135613586816134ed565b64ffffffff008160081b16905080837fffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000084161717845560408501356135ca816134ed565b68ffffffff00000000008160281b16847fffffffffffffffffffffffffffffffffffffffffffffff00000000000000000085161783171785555050505061365861361660608401613546565b82547fffffffffffffffffffffffffffffff0000000000000000ffffffffffffffffff1660489190911b70ffffffffffffffff00000000000000000016178255565b608082013560018201555050565b60006020828403121561367857600080fd5b81356107d381613539565b60a0810161369087612cbc565b95815263ffffffff948516602082015292909316604083015267ffffffffffffffff1660608201526080015290565b67ffffffffffffffff81811683821601908082111561204e5761204e6131f7565b600067ffffffffffffffff808a1683526020818a1681850152604060a08186015261370f60a086018a8c613467565b606086820381880152818983528483019050848a60051b8401018b60005b8c8110156137d157601f198684030184528135605e198f360301811261375257600080fd5b8e01803561375f81612c3f565b6001600160a01b0316845280890135898501528781013536829003601e1901811261378957600080fd5b0188810190358a81111561379c57600080fd5b8036038213156137ab57600080fd5b86898601526137bd8786018284613467565b958a0195945050509087019060010161372d565b50508097505050505050505082608083015298975050505050505050565b634e487b7160e01b600052601260045260246000fd5b600082613814576138146137ef565b500690565b600082613828576138286137ef565b500490565b60006000198203613840576138406131f7565b5060010190565b604081016138558285612e62565b8260208301529392505050565b83815260606020820152600061387b6060830185613089565b9050826040830152949350505050565b600080604080848603121561389f57600080fd5b835167ffffffffffffffff808211156138b757600080fd5b818601915086601f8301126138cb57600080fd5b81516020828211156138df576138df612d30565b8160051b6138ee828201612d46565b928352848101820192828101908b85111561390857600080fd5b83870192505b8483101561397d578251868111156139265760008081fd5b8701603f81018d136139385760008081fd5b84810151613948612df882612d77565b8181528e8b83850101111561395d5760008081fd5b61396c828883018d8601613039565b84525050918301919083019061390e565b9990920151989a9899505050505050505050565b6000825161328f818460208701613039565b6020815260006107d3602083018461305d56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a2646970667358221220ec687212f9fea973e1616f5970c147e474da7ccfa6b1ce7c76601932fd167a7664736f6c63430008110033',
  deployedBytecode:
    '0x6080604052600436106101d85760003560e01c80635c60da1b11610102578063c9c4bfca11610095578063da35c66411610064578063da35c664146105f3578063e28c3b1914610608578063f60046b214610627578063fe0d94c11461063d57600080fd5b8063c9c4bfca1461055f578063cc63604a14610593578063ce6366c4146105b3578063cf131149146105d357600080fd5b80639cba3021116100d15780639cba3021146104cd578063a230c524146104ed578063b2673b071461050d578063c7f758a81461052d57600080fd5b80635c60da1b1461041f5780637c36e8e8146104345780638a4b00f814610455578063970601d81461047557600080fd5b80632ae9c6001161017a5780634f1ef286116101495780634f1ef2861461039657806352d1902d146103a9578063536f9f42146103be57806356715761146103de57600080fd5b80632ae9c6001461030e5780633659cfe6146103305780634162169f1461035057806341de68301461038257600080fd5b80630dfb278e116101b65780630dfb278e1461026857806317d1b4041461028a5780631befc405146102aa57806323d07188146102ec57600080fd5b806301ffc9a7146101dd578063054fd2c2146102125780630de2185614610248575b600080fd5b3480156101e957600080fd5b506101fd6101f8366004612bc8565b61065d565b60405190151581526020015b60405180910390f35b34801561021e57600080fd5b506101605465010000000000900463ffffffff165b60405163ffffffff9091168152602001610209565b34801561025457600080fd5b506101fd610263366004612bf2565b6106d5565b34801561027457600080fd5b50610288610283366004612c23565b610778565b005b34801561029657600080fd5b506101fd6102a5366004612c68565b6107c3565b3480156102b657600080fd5b506102de7fbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe581565b604051908152602001610209565b3480156102f857600080fd5b506101605460ff165b6040516102099190612ccc565b34801561031a57600080fd5b506103236107da565b6040516102099190612cdf565b34801561033c57600080fd5b5061028861034b366004612d13565b610804565b34801561035c57600080fd5b5060c9546001600160a01b03165b6040516001600160a01b039091168152602001610209565b34801561038e57600080fd5b506000610301565b6102886103a4366004612d9f565b6109a6565b3480156103b557600080fd5b506102de610b30565b3480156103ca57600080fd5b506102de6103d9366004612bf2565b610bf6565b3480156103ea57600080fd5b50610160546901000000000000000000900467ffffffffffffffff1660405167ffffffffffffffff9091168152602001610209565b34801561042b57600080fd5b5061036a610c7e565b34801561044057600080fd5b5061016054610100900463ffffffff16610233565b34801561046157600080fd5b506101fd610470366004612bf2565b610cb6565b34801561048157600080fd5b506104c0610490366004612e32565b600082815261015f602090815260408083206001600160a01b038516845260060190915290205460ff1692915050565b6040516102099190612e76565b3480156104d957600080fd5b506102de6104e8366004612f0a565b610cf6565b3480156104f957600080fd5b506101fd610508366004612d13565b6110cf565b34801561051957600080fd5b50610288610528366004612fef565b6111f2565b34801561053957600080fd5b5061054d610548366004612bf2565b61136c565b6040516102099695949392919061310a565b34801561056b57600080fd5b506102de7f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f581565b34801561059f57600080fd5b506101fd6105ae366004612bf2565b6115d4565b3480156105bf57600080fd5b506102886105ce3660046131c2565b6115df565b3480156105df57600080fd5b506101fd6105ee366004612bf2565b611633565b3480156105ff57600080fd5b506102de611695565b34801561061457600080fd5b50610191546001600160a01b031661036a565b34801561063357600080fd5b50610161546102de565b34801561064957600080fd5b50610288610658366004612bf2565b6116a1565b60006001600160e01b031982167f50eb001e0000000000000000000000000000000000000000000000000000000014806106c057506001600160e01b031982167fa230c52400000000000000000000000000000000000000000000000000000000145b806106cf57506106cf826116ec565b92915050565b600081815261015f602052604081206003810154600482015460018301548492919061071190600160a81b900467ffffffffffffffff16610bf6565b61071b919061320d565b610725919061320d565b6001830154909150610743908290610100900463ffffffff16613220565b6004830154600184015461076590610100900463ffffffff16620f424061320d565b61076f9190613220565b11949350505050565b60c9547fbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe5906107b6906001600160a01b031630335b8460003661175e565b6107bf8261184c565b5050565b60006107d0848484611a4f565b90505b9392505050565b6107e2612baa565b5060408051606081018252600181526004602082015260009181019190915290565b6001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001630036108a75760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c000000000000000000000000000000000000000060648201526084015b60405180910390fd5b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03166109027f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b03161461097e5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f78790000000000000000000000000000000000000000606482015260840161089e565b61098781611bbc565b604080516000808252602082019092526109a391839190611bf5565b50565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610a445760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c0000000000000000000000000000000000000000606482015260840161089e565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316610a9f7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b031614610b1b5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f78790000000000000000000000000000000000000000606482015260840161089e565b610b2482611bbc565b6107bf82826001611bf5565b6000306001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001614610bd05760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c0000000000000000606482015260840161089e565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5b90565b610191546040517f8e539e8c000000000000000000000000000000000000000000000000000000008152600481018390526000916001600160a01b031690638e539e8c90602401602060405180830381865afa158015610c5a573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906106cf9190613237565b6000610cb17f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b905090565b600081815261015f602052604081206002810154600382015460058301546004840154610ce39190613250565b610ced9190613250565b10159392505050565b600080610d036101615490565b90508015610e48576101915481906001600160a01b0316639ab24eb0336040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610d64573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610d889190613237565b108015610e0f57506101915481906001600160a01b03166370a08231336040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610de9573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610e0d9190613237565b105b15610e48576040517feab9934400000000000000000000000000000000000000000000000000000000815233600482015260240161089e565b5060001943016000610e5982610bf6565b905080600003610e95576040517f7c176b7400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610e9f8787611d9a565b9097509550610eb4338d8d8a8a8f8f8f611edb565b600081815261015f6020526040902060018101805467ffffffffffffffff8a81166d0100000000000000000000000000027fffffffffffffffffffffff0000000000000000ffffffffffffffffffffffffff918d166501000000000002919091167fffffffffffffffffffffff00000000000000000000000000000000ffffffffff90921691909117179055909350610f4c83611f41565b60018201805467ffffffffffffffff92909216600160a81b027fffffff0000000000000000ffffffffffffffffffffffffffffffffffffffffff909216919091179055610f9c6101605460ff1690565b60018083018054909160ff1990911690836002811115610fbe57610fbe612ca6565b021790555061016054610100900463ffffffff166001820180547fffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000ff1661010063ffffffff93841602179055610160546110289184916501000000000090041663ffffffff16611fc5565b6002820155881561103b57600881018990555b60005b8a81101561109a57816007018c8c8381811061105c5761105c613263565b905060200281019061106e9190613279565b8154600181018355600092835260209092209091600302016110908282613313565b505060010161103e565b5060008660038111156110af576110af612ca6565b146110bf576110bf8487876115df565b5050509998505050505050505050565b610191546040517f9ab24eb00000000000000000000000000000000000000000000000000000000081526001600160a01b0383811660048301526000928392911690639ab24eb090602401602060405180830381865afa158015611137573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061115b9190613237565b11806106cf5750610191546040517f70a082310000000000000000000000000000000000000000000000000000000081526001600160a01b03848116600483015260009216906370a0823190602401602060405180830381865afa1580156111c7573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906111eb9190613237565b1192915050565b600054610100900460ff16158080156112125750600054600160ff909116105b8061122c5750303b15801561122c575060005460ff166001145b61129e5760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a6564000000000000000000000000000000000000606482015260840161089e565b6000805460ff1916600117905580156112c1576000805461ff0019166101001790555b6112cb8484612055565b610191805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0384169081179091556040517f3f1ec22954d444cb99f80a1989ac8f631616b8a575a89379e514c0f7f748c93390600090a28015611366576000805461ff0019169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b50505050565b6040805160c081018252600080825260208201819052918101829052606081018290526080810182905260a0810182905281906113c360405180606001604052806000815260200160008152602001600081525090565b600085815261015f60205260408120606091906113df816120e4565b81546040805160c08101909152600184018054939a5060ff928316995090929091839116600281111561141457611414612ca6565b600281111561142557611425612ca6565b8152815463ffffffff61010082041660208084019190915267ffffffffffffffff65010000000000830481166040808601919091526d010000000000000000000000000084048216606080870191909152600160a81b909404909116608085015260019094015460a090930192909252825190810183526003850154815260048501548183015260058501548184015260078501805484518185028101850190955280855294995090975091929060009084015b828210156115bd576000848152602090819020604080516060810182526003860290920180546001600160a01b031683526001810154938301939093526002830180549293929184019161152c90613299565b80601f016020809104026020016040519081016040528092919081815260200182805461155890613299565b80156115a55780601f1061157a576101008083540402835291602001916115a5565b820191906000526020600020905b81548152906001019060200180831161158857829003601f168201915b505050505081525050815260200190600101906114d9565b505050509250806008015491505091939550919395565b60006106cf82612152565b336115eb848285611a4f565b611627578381846040517f70b4b25400000000000000000000000000000000000000000000000000000000815260040161089e93929190613444565b611366848483856121fa565b600081815261015f60205260408120600581015460018201546116619190610100900463ffffffff16613220565b6004820154600183015461168390610100900463ffffffff16620f424061320d565b61168d9190613220565b119392505050565b6000610cb161012d5490565b6116aa81612152565b6116e3576040517f9fefd0f10000000000000000000000000000000000000000000000000000000081526004810182905260240161089e565b6109a3816124a1565b60006001600160e01b031982167f8678b01e00000000000000000000000000000000000000000000000000000000148061174f57506001600160e01b031982167f4d19145e00000000000000000000000000000000000000000000000000000000145b806106cf57506106cf82612609565b6040517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0387169063fdef9106906117ab9088908890889088908890600401613492565b602060405180830381865afa1580156117c8573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906117ec91906134d0565b611844576040517f32dbe3b40000000000000000000000000000000000000000000000000000000081526001600160a01b0380881660048301528087166024830152851660448201526064810184905260840161089e565b505050505050565b61185a6001620f424061320d565b61186a60408301602084016134ff565b63ffffffff1611156118d5576118846001620f424061320d565b61189460408301602084016134ff565b6040517fcc80c195000000000000000000000000000000000000000000000000000000008152600481019290925263ffffffff16602482015260440161089e565b620f42406118e960608301604084016134ff565b63ffffffff16111561190957620f424061189460608301604084016134ff565b610e1061191c608083016060840161351c565b67ffffffffffffffff16101561198557610e1061193f608083016060840161351c565b6040517fc51033ee00000000000000000000000000000000000000000000000000000000815267ffffffffffffffff92831660048201529116602482015260440161089e565b6301e1338061199a608083016060840161351c565b67ffffffffffffffff1611156119bf576301e1338061193f608083016060840161351c565b806101606119cd8282613553565b507fa8a18d06ddd19f24a872740e3d364c86f62be25f7154525dda18ef07fda46f3e90506119fe6020830183613666565b611a0e60408401602085016134ff565b611a1e60608501604086016134ff565b611a2e608086016060870161351c565b8560800135604051611a44959493929190613683565b60405180910390a150565b600083815261015f60205260408120611a67816120e4565b611a755760009150506107d3565b6000836003811115611a8957611a89612ca6565b03611a985760009150506107d3565b6101915460018201546040517f3a46b1a80000000000000000000000000000000000000000000000000000000081526001600160a01b038781166004830152600160a81b90920467ffffffffffffffff166024820152911690633a46b1a890604401602060405180830381865afa158015611b17573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611b3b9190613237565b600003611b4c5760009150506107d3565b6001600160a01b038416600090815260068201602052604081205460ff166003811115611b7b57611b7b612ca6565b14158015611ba257506002600182015460ff166002811115611b9f57611b9f612ca6565b14155b15611bb15760009150506107d3565b506001949350505050565b60c9547f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f5906107bf906001600160a01b031630336107ad565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff1615611c2d57611c2883612647565b505050565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015611c87575060408051601f3d908101601f19168201909252611c8491810190613237565b60015b611cf95760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f742055555053000000000000000000000000000000000000606482015260840161089e565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc8114611d8e5760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c65555549440000000000000000000000000000000000000000000000606482015260840161089e565b50611c28838383612712565b6000806000611da842611f41565b90508467ffffffffffffffff16600003611dc457809250611e29565b8492508067ffffffffffffffff168367ffffffffffffffff161015611e29576040517f4cc9c0f400000000000000000000000000000000000000000000000000000000815267ffffffffffffffff80831660048301528416602482015260440161089e565b61016054600090611e51906901000000000000000000900467ffffffffffffffff16856136bf565b90508467ffffffffffffffff16600003611e6d57809250611ed2565b8492508067ffffffffffffffff168367ffffffffffffffff161015611ed2576040517f4cc9c0f400000000000000000000000000000000000000000000000000000000815267ffffffffffffffff80831660048301528416602482015260440161089e565b50509250929050565b6000611ee5612737565b9050886001600160a01b0316817fa6c1f8f4276dc3f243459e13b557c84e8f4e90b2e09070bad5f6909cee687c9288888c8c8a8a8a604051611f2d97969594939291906136e0565b60405180910390a398975050505050505050565b600067ffffffffffffffff821115611fc15760405162461bcd60e51b815260206004820152602660248201527f53616665436173743a2076616c756520646f65736e27742066697420696e203660448201527f3420626974730000000000000000000000000000000000000000000000000000606482015260840161089e565b5090565b6000620f4240821115612010576040517fcc80c195000000000000000000000000000000000000000000000000000000008152620f424060048201526024810183905260440161089e565b61201a8284613220565b9250600061202b620f424085613805565b905061203a620f424085613819565b9150801561204e5761204b8261382d565b91505b5092915050565b600054610100900460ff166120d25760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b6120db82612752565b6107bf8161184c565b6000806120f042611f41565b600184015490915067ffffffffffffffff80831665010000000000909204161180159061213f5750600183015467ffffffffffffffff6d01000000000000000000000000009091048116908216105b80156107d3575050905460ff1615919050565b600081815261015f60205260408120805460ff16156121745750600092915050565b61217d816120e4565b156121c55760018082015460ff16600281111561219c5761219c612ca6565b146121aa5750600092915050565b6121b3836106d5565b6121c05750600092915050565b6121db565b6121ce83611633565b6121db5750600092915050565b6121e483610cb6565b6121f15750600092915050565b50600192915050565b600084815261015f602052604080822061019154600182015492517f3a46b1a80000000000000000000000000000000000000000000000000000000081526001600160a01b038781166004830152600160a81b90940467ffffffffffffffff1660248201529193921690633a46b1a890604401602060405180830381865afa15801561228a573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906122ae9190613237565b6001600160a01b038516600090815260068401602052604090205490915060ff1660028160038111156122e3576122e3612ca6565b036123025760048301546122f890839061320d565b6004840155612364565b600381600381111561231657612316612ca6565b0361233557600583015461232b90839061320d565b6005840155612364565b600181600381111561234957612349612ca6565b0361236457600383015461235e90839061320d565b60038401555b600286600381111561237857612378612ca6565b0361239757600483015461238d908390613250565b60048401556123f9565b60038660038111156123ab576123ab612ca6565b036123ca5760058301546123c0908390613250565b60058401556123f9565b60018660038111156123de576123de612ca6565b036123f95760038301546123f3908390613250565b60038401555b6001600160a01b03851660009081526006840160205260409020805487919060ff1916600183600381111561243057612430612ca6565b0217905550846001600160a01b0316877fb83d25c6a5d258561330739951487acb4bd09ba5190b5d32c4f261817d9067928885604051612471929190613847565b60405180910390a383801561248a575061248a87612152565b1561249857612498876124a1565b50505050505050565b600081815261015f60205260409020805460ff19166001179055611c286124d060c9546001600160a01b031690565b8261015f6000858152602001908152602001600020600701805480602002602001604051908101604052809291908181526020016000905b828210156125ec576000848152602090819020604080516060810182526003860290920180546001600160a01b031683526001810154938301939093526002830180549293929184019161255b90613299565b80601f016020809104026020016040519081016040528092919081815260200182805461258790613299565b80156125d45780601f106125a9576101008083540402835291602001916125d4565b820191906000526020600020905b8154815290600101906020018083116125b757829003601f168201915b50505050508152505081526020019060010190612508565b505050600086815261015f602052604090206008015490506127d8565b60006001600160e01b031982167fda35c6640000000000000000000000000000000000000000000000000000000014806106cf57506106cf826128a7565b6001600160a01b0381163b6126c45760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e747261637400000000000000000000000000000000000000606482015260840161089e565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b61271b83612976565b6000825111806127285750805b15611c285761136683836129b6565b6000612741611695565b9050610bf361012d80546001019055565b600054610100900460ff166127cf5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b6109a3816129db565b6040517fc71bf3240000000000000000000000000000000000000000000000000000000081526060906000906001600160a01b0387169063c71bf3249061282790889088908890600401613862565b6000604051808303816000875af1158015612846573d6000803e3d6000fd5b505050506040513d6000823e601f3d908101601f1916820160405261286e919081019061388b565b604051919350915085907f712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f90600090a294509492505050565b60006001600160e01b031982167f41de683000000000000000000000000000000000000000000000000000000000148061290a57506001600160e01b031982167f2ae9c60000000000000000000000000000000000000000000000000000000000145b8061293e57506001600160e01b031982167f52d1902d00000000000000000000000000000000000000000000000000000000145b806106cf57507f01ffc9a7000000000000000000000000000000000000000000000000000000006001600160e01b03198316146106cf565b61297f81612647565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b60606107d383836040518060600160405280602781526020016139b760279139612a87565b600054610100900460ff16612a585760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e67000000000000000000000000000000000000000000606482015260840161089e565b60c9805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b6060600080856001600160a01b031685604051612aa49190613991565b600060405180830381855af49150503d8060008114612adf576040519150601f19603f3d011682016040523d82523d6000602084013e612ae4565b606091505b5091509150612af586838387612aff565b9695505050505050565b60608315612b6e578251600003612b67576001600160a01b0385163b612b675760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604482015260640161089e565b5081612b78565b612b788383612b80565b949350505050565b815115612b905781518083602001fd5b8060405162461bcd60e51b815260040161089e91906139a3565b60405180606001604052806003906020820280368337509192915050565b600060208284031215612bda57600080fd5b81356001600160e01b0319811681146107d357600080fd5b600060208284031215612c0457600080fd5b5035919050565b600060a08284031215612c1d57600080fd5b50919050565b600060a08284031215612c3557600080fd5b6107d38383612c0b565b6001600160a01b03811681146109a357600080fd5b803560048110612c6357600080fd5b919050565b600080600060608486031215612c7d57600080fd5b833592506020840135612c8f81612c3f565b9150612c9d60408501612c54565b90509250925092565b634e487b7160e01b600052602160045260246000fd5b600381106109a3576109a3612ca6565b60208101612cd983612cbc565b91905290565b60608101818360005b6003811015612d0a57815160ff16835260209283019290910190600101612ce8565b50505092915050565b600060208284031215612d2557600080fd5b81356107d381612c3f565b634e487b7160e01b600052604160045260246000fd5b604051601f8201601f1916810167ffffffffffffffff81118282101715612d6f57612d6f612d30565b604052919050565b600067ffffffffffffffff821115612d9157612d91612d30565b50601f01601f191660200190565b60008060408385031215612db257600080fd5b8235612dbd81612c3f565b9150602083013567ffffffffffffffff811115612dd957600080fd5b8301601f81018513612dea57600080fd5b8035612dfd612df882612d77565b612d46565b818152866020838501011115612e1257600080fd5b816020840160208301376000602083830101528093505050509250929050565b60008060408385031215612e4557600080fd5b823591506020830135612e5781612c3f565b809150509250929050565b60048110612e7257612e72612ca6565b9052565b602081016106cf8284612e62565b60008083601f840112612e9657600080fd5b50813567ffffffffffffffff811115612eae57600080fd5b6020830191508360208260051b8501011115612ec957600080fd5b9250929050565b67ffffffffffffffff811681146109a357600080fd5b8035612c6381612ed0565b80151581146109a357600080fd5b8035612c6381612ef1565b600080600080600080600080600060e08a8c031215612f2857600080fd5b893567ffffffffffffffff80821115612f4057600080fd5b818c0191508c601f830112612f5457600080fd5b813581811115612f6357600080fd5b8d6020828501011115612f7557600080fd5b60209283019b509950908b01359080821115612f9057600080fd5b50612f9d8c828d01612e84565b90985096505060408a01359450612fb660608b01612ee6565b9350612fc460808b01612ee6565b9250612fd260a08b01612c54565b9150612fe060c08b01612eff565b90509295985092959850929598565b600080600060e0848603121561300457600080fd5b833561300f81612c3f565b925061301e8560208601612c0b565b915060c084013561302e81612c3f565b809150509250925092565b60005b8381101561305457818101518382015260200161303c565b50506000910152565b60008151808452613075816020860160208601613039565b601f01601f19169290920160200192915050565b600082825180855260208086019550808260051b84010181860160005b848110156130fd57858303601f19018952815180516001600160a01b0316845284810151858501526040908101516060918501829052906130e98186018361305d565b9a86019a94505050908301906001016130a6565b5090979650505050505050565b60006101a088151583528715156020840152865161312781612cbc565b8060408501525063ffffffff6020880151166060840152604087015167ffffffffffffffff80821660808601528060608a01511660a08601528060808a01511660c0860152505060a087015160e084015261319a6101008401878051825260208082015190830152604090810151910152565b806101608401526131ad81840186613089565b91505082610180830152979650505050505050565b6000806000606084860312156131d757600080fd5b833592506131e760208501612c54565b9150604084013561302e81612ef1565b634e487b7160e01b600052601160045260246000fd5b818103818111156106cf576106cf6131f7565b80820281158282048414176106cf576106cf6131f7565b60006020828403121561324957600080fd5b5051919050565b808201808211156106cf576106cf6131f7565b634e487b7160e01b600052603260045260246000fd5b60008235605e1983360301811261328f57600080fd5b9190910192915050565b600181811c908216806132ad57607f821691505b602082108103612c1d57634e487b7160e01b600052602260045260246000fd5b601f821115611c2857600081815260208120601f850160051c810160208610156132f45750805b601f850160051c820191505b8181101561184457828155600101613300565b813561331e81612c3f565b6001600160a01b03811673ffffffffffffffffffffffffffffffffffffffff1983541617825550600160208084013582840155600283016040850135601e1986360301811261336c57600080fd5b8501803567ffffffffffffffff81111561338557600080fd5b803603848301131561339657600080fd5b6133aa816133a48554613299565b856132cd565b6000601f8211600181146133e057600083156133c857508382018601355b600019600385901b1c1916600184901b178555613439565b600085815260209020601f19841690835b82811015613410578685018901358255938801939089019088016133f1565b508482101561342f5760001960f88660031b161c198885880101351681555b50508683881b0185555b505050505050505050565b8381526001600160a01b038316602082015260608101612b786040830184612e62565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b60006001600160a01b038088168352808716602084015250846040830152608060608301526134c5608083018486613467565b979650505050505050565b6000602082840312156134e257600080fd5b81516107d381612ef1565b63ffffffff811681146109a357600080fd5b60006020828403121561351157600080fd5b81356107d3816134ed565b60006020828403121561352e57600080fd5b81356107d381612ed0565b600381106109a357600080fd5b600081356106cf81612ed0565b813561355e81613539565b61356781612cbc565b815460ff821691508160ff1982161783556020840135613586816134ed565b64ffffffff008160081b16905080837fffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000084161717845560408501356135ca816134ed565b68ffffffff00000000008160281b16847fffffffffffffffffffffffffffffffffffffffffffffff00000000000000000085161783171785555050505061365861361660608401613546565b82547fffffffffffffffffffffffffffffff0000000000000000ffffffffffffffffff1660489190911b70ffffffffffffffff00000000000000000016178255565b608082013560018201555050565b60006020828403121561367857600080fd5b81356107d381613539565b60a0810161369087612cbc565b95815263ffffffff948516602082015292909316604083015267ffffffffffffffff1660608201526080015290565b67ffffffffffffffff81811683821601908082111561204e5761204e6131f7565b600067ffffffffffffffff808a1683526020818a1681850152604060a08186015261370f60a086018a8c613467565b606086820381880152818983528483019050848a60051b8401018b60005b8c8110156137d157601f198684030184528135605e198f360301811261375257600080fd5b8e01803561375f81612c3f565b6001600160a01b0316845280890135898501528781013536829003601e1901811261378957600080fd5b0188810190358a81111561379c57600080fd5b8036038213156137ab57600080fd5b86898601526137bd8786018284613467565b958a0195945050509087019060010161372d565b50508097505050505050505082608083015298975050505050505050565b634e487b7160e01b600052601260045260246000fd5b600082613814576138146137ef565b500690565b600082613828576138286137ef565b500490565b60006000198203613840576138406131f7565b5060010190565b604081016138558285612e62565b8260208301529392505050565b83815260606020820152600061387b6060830185613089565b9050826040830152949350505050565b600080604080848603121561389f57600080fd5b835167ffffffffffffffff808211156138b757600080fd5b818601915086601f8301126138cb57600080fd5b81516020828211156138df576138df612d30565b8160051b6138ee828201612d46565b928352848101820192828101908b85111561390857600080fd5b83870192505b8483101561397d578251868111156139265760008081fd5b8701603f81018d136139385760008081fd5b84810151613948612df882612d77565b8181528e8b83850101111561395d5760008081fd5b61396c828883018d8601613039565b84525050918301919083019061390e565b9990920151989a9899505050505050505050565b6000825161328f818460208701613039565b6020815260006107d3602083018461305d56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a2646970667358221220ec687212f9fea973e1616f5970c147e474da7ccfa6b1ce7c76601932fd167a7664736f6c63430008110033',
  linkReferences: {},
  deployedLinkReferences: {},
}
