export const GaugeVoter = {
  _format: 'hh-sol-artifact-1',
  contractName: 'GaugeVoter',
  sourceName: '',
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
          name: 'tokenId',
          type: 'uint256',
        },
      ],
      name: 'AlreadyVoted',
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
      name: 'DoubleVote',
      type: 'error',
    },
    {
      inputs: [],
      name: 'GaugeActivationUnchanged',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_pool',
          type: 'address',
        },
      ],
      name: 'GaugeDoesNotExist',
      type: 'error',
    },
    {
      inputs: [],
      name: 'GaugeExists',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'GaugeInactive',
      type: 'error',
    },
    {
      inputs: [],
      name: 'NoVotes',
      type: 'error',
    },
    {
      inputs: [],
      name: 'NoVotingPower',
      type: 'error',
    },
    {
      inputs: [],
      name: 'NotApprovedOrOwner',
      type: 'error',
    },
    {
      inputs: [],
      name: 'NotCurrentlyVoting',
      type: 'error',
    },
    {
      inputs: [],
      name: 'VotingInactive',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ZeroGauge',
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
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
      ],
      name: 'GaugeActivated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'creator',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'string',
          name: 'metadataURI',
          type: 'string',
        },
      ],
      name: 'GaugeCreated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
      ],
      name: 'GaugeDeactivated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'string',
          name: 'metadataURI',
          type: 'string',
        },
      ],
      name: 'GaugeMetadataUpdated',
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
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
      ],
      name: 'Paused',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'voter',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'uint256',
          name: 'epoch',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'votingPowerRemovedFromGauge',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalVotingPowerInGauge',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalVotingPowerInContract',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'timestamp',
          type: 'uint256',
        },
      ],
      name: 'Reset',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
      ],
      name: 'Unpaused',
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
          internalType: 'address',
          name: 'voter',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'gauge',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'uint256',
          name: 'epoch',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'votingPowerCastForGauge',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalVotingPowerInGauge',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalVotingPowerInContract',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'timestamp',
          type: 'uint256',
        },
      ],
      name: 'Voted',
      type: 'event',
    },
    {
      inputs: [],
      name: 'GAUGE_ADMIN_ROLE',
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
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'activateGauge',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'clock',
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
          name: '_gauge',
          type: 'address',
        },
        {
          internalType: 'string',
          name: '_metadataURI',
          type: 'string',
        },
      ],
      name: 'createGauge',
      outputs: [
        {
          internalType: 'address',
          name: 'gauge',
          type: 'address',
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
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'deactivateGauge',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'epochId',
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
      name: 'epochStart',
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
      name: 'epochVoteEnd',
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
      name: 'epochVoteStart',
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
      name: 'escrow',
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
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'gaugeExists',
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
          name: '',
          type: 'uint256',
        },
      ],
      name: 'gaugeList',
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
          name: '',
          type: 'address',
        },
      ],
      name: 'gaugeVotes',
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
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      name: 'gauges',
      outputs: [
        {
          internalType: 'bool',
          name: 'active',
          type: 'bool',
        },
        {
          internalType: 'uint256',
          name: 'created',
          type: 'uint256',
        },
        {
          internalType: 'string',
          name: 'metadataURI',
          type: 'string',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_tokenId',
          type: 'uint256',
        },
      ],
      name: 'gaugesVotedFor',
      outputs: [
        {
          internalType: 'address[]',
          name: '',
          type: 'address[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getAllGauges',
      outputs: [
        {
          internalType: 'address[]',
          name: '',
          type: 'address[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'getGauge',
      outputs: [
        {
          components: [
            {
              internalType: 'bool',
              name: 'active',
              type: 'bool',
            },
            {
              internalType: 'uint256',
              name: 'created',
              type: 'uint256',
            },
            {
              internalType: 'string',
              name: 'metadataURI',
              type: 'string',
            },
          ],
          internalType: 'struct IGauge.Gauge',
          name: '',
          type: 'tuple',
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
          internalType: 'address',
          name: '_dao',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_escrow',
          type: 'address',
        },
        {
          internalType: 'bool',
          name: '_startPaused',
          type: 'bool',
        },
        {
          internalType: 'address',
          name: '_clock',
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
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'isActive',
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
          name: '_tokenId',
          type: 'uint256',
        },
      ],
      name: 'isVoting',
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
      name: 'pause',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'paused',
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
          internalType: 'uint256',
          name: '_tokenId',
          type: 'uint256',
        },
      ],
      name: 'reset',
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
      inputs: [],
      name: 'totalVotingPowerCast',
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
      name: 'unpause',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
        {
          internalType: 'string',
          name: '_metadataURI',
          type: 'string',
        },
      ],
      name: 'updateGaugeMetadata',
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
          name: '_tokenId',
          type: 'uint256',
        },
      ],
      name: 'usedVotingPower',
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
          internalType: 'uint256',
          name: '_tokenId',
          type: 'uint256',
        },
        {
          components: [
            {
              internalType: 'uint256',
              name: 'weight',
              type: 'uint256',
            },
            {
              internalType: 'address',
              name: 'gauge',
              type: 'address',
            },
          ],
          internalType: 'struct IGaugeVote.GaugeVote[]',
          name: '_votes',
          type: 'tuple[]',
        },
      ],
      name: 'vote',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256[]',
          name: '_tokenIds',
          type: 'uint256[]',
        },
        {
          components: [
            {
              internalType: 'uint256',
              name: 'weight',
              type: 'uint256',
            },
            {
              internalType: 'address',
              name: 'gauge',
              type: 'address',
            },
          ],
          internalType: 'struct IGaugeVote.GaugeVote[]',
          name: '_votes',
          type: 'tuple[]',
        },
      ],
      name: 'voteMultiple',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_tokenId',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: '_gauge',
          type: 'address',
        },
      ],
      name: 'votes',
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
      name: 'votingActive',
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
  ],
  bytecode:
    '0x60a0604052306080523480156200001557600080fd5b506200002062000030565b6200002a62000030565b620000f1565b600054610100900460ff16156200009d5760405162461bcd60e51b815260206004820152602760248201527f496e697469616c697a61626c653a20636f6e747261637420697320696e697469604482015266616c697a696e6760c81b606482015260840160405180910390fd5b60005460ff90811614620000ef576000805460ff191660ff9081179091556040519081527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b565b6080516138346200012960003960008181610f1701528181610fad015281816111df01528181611275015261137001526138346000f3fe6080604052600436106102a05760003560e01c8063954ef57e1161016e578063c946c5cc116100cb578063e2fdcc171161007f578063ecc44a3811610064578063ecc44a38146107c4578063f0363ae4146107d9578063fb162e03146107f057600080fd5b8063e2fdcc171461076f578063e79e5a231461079057600080fd5b8063d23254b4116100b0578063d23254b4146106eb578063d561f5b01461072f578063ddaf20791461074f57600080fd5b8063c946c5cc14610695578063c9c4bfca146106b757600080fd5b8063ad288fe811610122578063b4b1013c11610107578063b4b1013c1461060a578063b9a09fd51461062a578063bda46ea91461065957600080fd5b8063ad288fe8146105bd578063b1c6f0e9146105dd57600080fd5b80639ef13a41116101535780639ef13a41146105405780639f8a13d71461056e578063aa9bbc0c146105a857600080fd5b8063954ef57e146104dc57806397f723001461050d57600080fd5b80634162169f1161021c5780635c60da1b116101d057806382bbad24116101b557806382bbad24146104865780638456cb59146104a657806391ddadf4146104bb57600080fd5b80635c60da1b146104595780635c975abb1461046e57600080fd5b80634cea22f1116102015780634cea22f11461041c5780634f1ef2861461043157806352d1902d1461044457600080fd5b80634162169f146103e157806341de68301461040057600080fd5b8063244a26a6116102735780633659cfe6116102585780633659cfe6146103975780633f4ba83a146103b7578063408e2727146103cc57600080fd5b8063244a26a614610357578063310bd74b1461037757600080fd5b806301ffc9a7146102a5578063071d2171146102da57806315e5a1e51461031257806323303c6f14610335575b600080fd5b3480156102b157600080fd5b506102c56102c0366004612e7e565b610810565b60405190151581526020015b60405180910390f35b3480156102e657600080fd5b506102fa6102f5366004612edc565b6108f5565b6040516001600160a01b0390911681526020016102d1565b34801561031e57600080fd5b50610327610b34565b6040519081526020016102d1565b34801561034157600080fd5b50610355610350366004612f5f565b610bc1565b005b34801561036357600080fd5b50610355610372366004612fc6565b610d00565b34801561038357600080fd5b50610355610392366004613060565b610d9e565b3480156103a357600080fd5b506103556103b2366004612f5f565b610f0d565b3480156103c357600080fd5b506103556110a7565b3480156103d857600080fd5b506102c56110e9565b3480156103ed57600080fd5b5061012d546001600160a01b03166102fa565b34801561040c57600080fd5b5060006040516102d19190613079565b34801561042857600080fd5b50610327611171565b61035561043f3660046130e9565b6111d5565b34801561045057600080fd5b50610327611363565b34801561046557600080fd5b506102fa611428565b34801561047a57600080fd5b5060fb5460ff166102c5565b34801561049257600080fd5b506103556104a1366004612f5f565b61145b565b3480156104b257600080fd5b50610355611591565b3480156104c757600080fd5b50610192546102fa906001600160a01b031681565b3480156104e857600080fd5b506103276104f7366004613060565b6000908152610197602052604090206002015490565b34801561051957600080fd5b506102c5610528366004613060565b60009081526101976020526040902060030154151590565b34801561054c57600080fd5b5061032761055b366004612f5f565b6101966020526000908152604090205481565b34801561057a57600080fd5b506102c5610589366004612f5f565b6001600160a01b03166000908152610195602052604090205460ff1690565b3480156105b457600080fd5b506103276115d3565b3480156105c957600080fd5b506103556105d8366004612edc565b611637565b3480156105e957600080fd5b506105fd6105f8366004612f5f565b611740565b6040516102d191906131fb565b34801561061657600080fd5b506102fa610625366004613060565b611830565b34801561063657600080fd5b5061064a610645366004612f5f565b61185b565b6040516102d19392919061322c565b34801561066557600080fd5b506102c5610674366004612f5f565b6001600160a01b031660009081526101956020526040902060010154151590565b3480156106a157600080fd5b506106aa61190b565b6040516102d19190613256565b3480156106c357600080fd5b506103277f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f581565b3480156106f757600080fd5b506103276107063660046132a3565b6000918252610197602090815260408084206001600160a01b0393909316845291905290205490565b34801561073b57600080fd5b5061035561074a3660046132cf565b61196e565b34801561075b57600080fd5b506106aa61076a366004613060565b6119d5565b34801561077b57600080fd5b50610191546102fa906001600160a01b031681565b34801561079c57600080fd5b506103277ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201481565b3480156107d057600080fd5b50610327611a45565b3480156107e557600080fd5b506103276101935481565b3480156107fc57600080fd5b5061035561080b366004613329565b611aa9565b60007fffffffff0000000000000000000000000000000000000000000000000000000082167f41de68300000000000000000000000000000000000000000000000000000000014806108a357507fffffffff0000000000000000000000000000000000000000000000000000000082167f52d1902d00000000000000000000000000000000000000000000000000000000145b806108ef57507f01ffc9a7000000000000000000000000000000000000000000000000000000007fffffffff000000000000000000000000000000000000000000000000000000008316145b92915050565b61012d546000907ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490610937906001600160a01b031630335b84600036611c70565b61093f611d5e565b6001600160a01b03851661097f576040517f32e63e4400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03851660009081526101956020526040902060010154156109d3576040517f91fc82b600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604051806060016040528060011515815260200142815260200185858080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201829052509390945250506001600160a01b038816815261019560209081526040918290208451815460ff1916901515178155908401516001820155908301519091506002820190610a6c9082613418565b505061019480546001810182556000919091527fa6f1ac7ad7b125ba5a5e1c96b00ad6914f90a503b1ac3d85a9dadbb4c639df920180547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b03881617905550336001600160a01b0316856001600160a01b03167fe72b86315c30bd1bf352c4cf97594ba793f3e31b74bc874ce47ede0df6920ae98686604051610b1892919061353f565b60405180910390a3849150610b2c60018055565b509392505050565b61019254604080517fc75dd54100000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163c75dd5419160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610bbc9190613553565b905090565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490610bfb906001600160a01b0316303361092e565b6001600160a01b03821660009081526101956020526040902060010154610c5e576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024015b60405180910390fd5b6001600160a01b0382166000908152610195602052604090205460ff1615610cb2576040517fcf12acdd00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03821660008181526101956020526040808220805460ff19166001179055517f34521f8891f6149b4baf837b8eea01eeefc28708be34ac8e705484dd34dde8189190a25050565b610d08611d5e565b610d10611dbd565b610d186110e9565b610d4e576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60005b83811015610d8e57610d7c858583818110610d6e57610d6e61356c565b905060200201358484611e12565b80610d86816135ca565b915050610d51565b50610d9860018055565b50505050565b610da6611d5e565b610dae611dbd565b610db66110e9565b610dec576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610191546040517f430c2081000000000000000000000000000000000000000000000000000000008152336004820152602481018390526001600160a01b039091169063430c208190604401602060405180830381865afa158015610e55573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610e799190613602565b610eaf576040517fe433766c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008181526101976020526040902060030154610ef8576040517f51387b1a00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610f01816123d6565b610f0a60018055565b50565b6001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000163003610fab5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610c55565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03166110067f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b0316146110825760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610c55565b61108b81612559565b60408051600080825260208201909252610f0a91839190612593565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d42014906110e1906001600160a01b0316303361092e565b610f0a612733565b61019254604080517f408e272700000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163408e27279160048083019260209291908290030181865afa15801561114d573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610bbc9190613602565b61019254604080517f51b7d39900000000000000000000000000000000000000000000000000000000815290516000926001600160a01b0316916351b7d3999160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b6001600160a01b037f00000000000000000000000000000000000000000000000000000000000000001630036112735760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610c55565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03166112ce7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b03161461134a5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610c55565b61135382612559565b61135f82826001612593565b5050565b6000306001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016146114035760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c00000000000000006064820152608401610c55565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b6000610bbc7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490611495906001600160a01b0316303361092e565b6001600160a01b038216600090815261019560205260409020600101546114f3576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610c55565b6001600160a01b0382166000908152610195602052604090205460ff16611546576040517fcf12acdd00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03821660008181526101956020526040808220805460ff19169055517f4a6f8353ec8700967336a2982804d34c6a35d417d5cb457ac11caa9eb917f0d49190a25050565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d42014906115cb906001600160a01b0316303361092e565b610f0a612785565b61019254604080517f7667180800000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163766718089160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490611671906001600160a01b0316303361092e565b6001600160a01b038416600090815261019560205260409020600101546116cf576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0385166004820152602401610c55565b6001600160a01b0384166000908152610195602052604090206002016116f683858361361f565b50836001600160a01b03167f98c22290de5c8f771a9b53bc6833b5ad1b69539ef5fdd73a0ebf36fba1cdab6b848460405161173292919061353f565b60405180910390a250505050565b6040805160608082018352600080835260208084018290528385018390526001600160a01b038616825261019581529084902084519283018552805460ff16151583526001810154918301919091526002810180549394929391928401916117a79061337f565b80601f01602080910402602001604051908101604052809291908181526020018280546117d39061337f565b80156118205780601f106117f557610100808354040283529160200191611820565b820191906000526020600020905b81548152906001019060200180831161180357829003601f168201915b5050505050815250509050919050565b610194818154811061184157600080fd5b6000918252602090912001546001600160a01b0316905081565b6101956020526000908152604090208054600182015460028301805460ff9093169391926118889061337f565b80601f01602080910402602001604051908101604052809291908181526020018280546118b49061337f565b80156119015780601f106118d657610100808354040283529160200191611901565b820191906000526020600020905b8154815290600101906020018083116118e457829003601f168201915b5050505050905083565b606061019480548060200260200160405190810160405280929190818152602001828054801561196457602002820191906000526020600020905b81546001600160a01b03168152600190910190602001808311611946575b5050505050905090565b611976611d5e565b61197e611dbd565b6119866110e9565b6119bc576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6119c7838383611e12565b6119d060018055565b505050565b60008181526101976020908152604091829020600101805483518184028101840190945280845260609392830182828015611a3957602002820191906000526020600020905b81546001600160a01b03168152600190910190602001808311611a1b575b50505050509050919050565b61019254604080517fbed2e86b00000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163bed2e86b9160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b600054610100900460ff1615808015611ac95750600054600160ff909116105b80611ae35750303b158015611ae3575060005460ff166001145b611b555760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a65640000000000000000000000000000000000006064820152608401610c55565b6000805460ff191660011790558015611b9557600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff166101001790555b611b9e856127c2565b611ba6612848565b611bae6128cd565b61019180546001600160a01b038087167fffffffffffffffffffffffff0000000000000000000000000000000000000000928316179092556101928054928516929091169190911790558215611c0657611c06612785565b8015611c6957600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b5050505050565b6040517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0387169063fdef910690611cbd908890889088908890889060040161371b565b602060405180830381865afa158015611cda573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611cfe9190613602565b611d56576040517f32dbe3b40000000000000000000000000000000000000000000000000000000081526001600160a01b03808816600483015280871660248301528516604482015260648101849052608401610c55565b505050505050565b600260015403611db05760405162461bcd60e51b815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610c55565b6002600155565b60018055565b60fb5460ff1615611e105760405162461bcd60e51b815260206004820152601060248201527f5061757361626c653a20706175736564000000000000000000000000000000006044820152606401610c55565b565b610191546001600160a01b031663430c2081336040517fffffffff0000000000000000000000000000000000000000000000000000000060e084901b1681526001600160a01b03909116600482015260248101869052604401602060405180830381865afa158015611e88573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611eac9190613602565b611ee2576040517fe433766c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610191546040517f72c4a927000000000000000000000000000000000000000000000000000000008152600481018590526000916001600160a01b0316906372c4a92790602401602060405180830381865afa158015611f46573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611f6a9190613553565b905080600003611fa6576040517f7c176b7400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b816000819003611fe2576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600085815261019760205260409020600301541561200357612003856123d6565b6000858152610197602052604081209080805b84811015612057578787828181106120305761203061356c565b6120439260409091020135905083613759565b91508061204f816135ca565b915050612016565b5080600003612092576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60005b848110156123a95760008888838181106120b1576120b161356c565b90506040020160200160208101906120c99190612f5f565b90506120f0816001600160a01b031660009081526101956020526040902060010154151590565b612131576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0382166004820152602401610c55565b6001600160a01b0381166000908152610195602052604090205460ff1661218f576040517fd2b961e10000000000000000000000000000000000000000000000000000000081526001600160a01b0382166004820152602401610c55565b6001600160a01b038116600090815260208690526040902054156121df576040517ffdebb48000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600083888b8b868181106121f5576121f561356c565b90506040020160000135612209919061376c565b6122139190613783565b90508060000361224f576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001868101805491820181556000908152602080822090920180547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0386169081179091558152908790526040812080548392906122b6908490613759565b90915550506001600160a01b03821660009081526101966020526040812080548392906122e4908490613759565b909155506122f490508186613759565b94506122fe6115d3565b6001600160a01b038316336001600160a01b03167fc2e08dda2639fb332996dc4eee129c35a993f33a0362e69439c5d2e9df903c2e8e856101966000896001600160a01b03166001600160a01b03168152602001908152602001600020548b6101935461236b9190613759565b60408051948552602085019390935291830152606082015242608082015260a00160405180910390a4505080806123a1906135ca565b915050612095565b508161019360008282546123bd9190613759565b9091555050506002820155426003909101555050505050565b6000818152610197602052604081206002810182905560038101829055906001820190805b825481101561251a5760008382815481106124185761241861356c565b60009182526020808320909101546001600160a01b03168083528782526040808420546101969093528320805491945091928392916124589084906137be565b9091555061246890508185613759565b6001600160a01b038316600090815260208890526040812055935061248b6115d3565b6001600160a01b038316600081815261019660205260409020546101935433917f7a881a18bc3d2c64d59fea076f490b4df6ca4a14d87059fcab1e4c04ec516bf9918c9187916124dc908c906137be565b60408051948552602085019390935291830152606082015242608082015260a00160405180910390a450508080612512906135ca565b9150506123fb565b50604080516000815260208101918290525161253a916001860191612dec565b5080610193600082825461254e91906137be565b909155505050505050565b61012d547f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f59061135f906001600160a01b0316303361092e565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff16156125c6576119d083612952565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015612620575060408051601f3d908101601f1916820190925261261d91810190613553565b60015b6126925760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f7420555550530000000000000000000000000000000000006064820152608401610c55565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc81146127275760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c655555494400000000000000000000000000000000000000000000006064820152608401610c55565b506119d0838383612a28565b61273b612a4d565b60fb805460ff191690557f5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa335b6040516001600160a01b03909116815260200160405180910390a1565b61278d611dbd565b60fb805460ff191660011790557f62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a2586127683390565b600054610100900460ff1661283f5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b610f0a81612a9f565b600054610100900460ff166128c55760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b611e10612b57565b600054610100900460ff1661294a5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b611e10612bd4565b6001600160a01b0381163b6129cf5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e7472616374000000000000000000000000000000000000006064820152608401610c55565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0392909216919091179055565b612a3183612c5d565b600082511180612a3e5750805b156119d057610d988383612c9d565b60fb5460ff16611e105760405162461bcd60e51b815260206004820152601460248201527f5061757361626c653a206e6f74207061757365640000000000000000000000006044820152606401610c55565b600054610100900460ff16612b1c5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b61012d80547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0392909216919091179055565b600054610100900460ff16611db75760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b600054610100900460ff16612c515760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b60fb805460ff19169055565b612c6681612952565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b6060612cc2838360405180606001604052806027815260200161380160279139612cc9565b9392505050565b6060600080856001600160a01b031685604051612ce691906137d1565b600060405180830381855af49150503d8060008114612d21576040519150601f19603f3d011682016040523d82523d6000602084013e612d26565b606091505b5091509150612d3786838387612d41565b9695505050505050565b60608315612db0578251600003612da9576001600160a01b0385163b612da95760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e74726163740000006044820152606401610c55565b5081612dba565b612dba8383612dc2565b949350505050565b815115612dd25781518083602001fd5b8060405162461bcd60e51b8152600401610c5591906137ed565b828054828255906000526020600020908101928215612e59579160200282015b82811115612e5957825182547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b03909116178255602090920191600190910190612e0c565b50612e65929150612e69565b5090565b5b80821115612e655760008155600101612e6a565b600060208284031215612e9057600080fd5b81357fffffffff0000000000000000000000000000000000000000000000000000000081168114612cc257600080fd5b80356001600160a01b0381168114612ed757600080fd5b919050565b600080600060408486031215612ef157600080fd5b612efa84612ec0565b9250602084013567ffffffffffffffff80821115612f1757600080fd5b818601915086601f830112612f2b57600080fd5b813581811115612f3a57600080fd5b876020828501011115612f4c57600080fd5b6020830194508093505050509250925092565b600060208284031215612f7157600080fd5b612cc282612ec0565b60008083601f840112612f8c57600080fd5b50813567ffffffffffffffff811115612fa457600080fd5b6020830191508360208260061b8501011115612fbf57600080fd5b9250929050565b60008060008060408587031215612fdc57600080fd5b843567ffffffffffffffff80821115612ff457600080fd5b818701915087601f83011261300857600080fd5b81358181111561301757600080fd5b8860208260051b850101111561302c57600080fd5b60209283019650945090860135908082111561304757600080fd5b5061305487828801612f7a565b95989497509550505050565b60006020828403121561307257600080fd5b5035919050565b60208101600383106130b4577f4e487b7100000000000000000000000000000000000000000000000000000000600052602160045260246000fd5b91905290565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080604083850312156130fc57600080fd5b61310583612ec0565b9150602083013567ffffffffffffffff8082111561312257600080fd5b818501915085601f83011261313657600080fd5b813581811115613148576131486130ba565b604051601f8201601f19908116603f01168101908382118183101715613170576131706130ba565b8160405282815288602084870101111561318957600080fd5b8260208601602083013760006020848301015280955050505050509250929050565b60005b838110156131c65781810151838201526020016131ae565b50506000910152565b600081518084526131e78160208601602086016131ab565b601f01601f19169290920160200192915050565b602081528151151560208201526020820151604082015260006040830151606080840152612dba60808401826131cf565b831515815282602082015260606040820152600061324d60608301846131cf565b95945050505050565b6020808252825182820181905260009190848201906040850190845b818110156132975783516001600160a01b031683529284019291840191600101613272565b50909695505050505050565b600080604083850312156132b657600080fd5b823591506132c660208401612ec0565b90509250929050565b6000806000604084860312156132e457600080fd5b83359250602084013567ffffffffffffffff81111561330257600080fd5b61330e86828701612f7a565b9497909650939450505050565b8015158114610f0a57600080fd5b6000806000806080858703121561333f57600080fd5b61334885612ec0565b935061335660208601612ec0565b925060408501356133668161331b565b915061337460608601612ec0565b905092959194509250565b600181811c9082168061339357607f821691505b6020821081036133cc577f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b50919050565b601f8211156119d057600081815260208120601f850160051c810160208610156133f95750805b601f850160051c820191505b81811015611d5657828155600101613405565b815167ffffffffffffffff811115613432576134326130ba565b61344681613440845461337f565b846133d2565b602080601f83116001811461349957600084156134635750858301515b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600386901b1c1916600185901b178555611d56565b600085815260208120601f198616915b828110156134c8578886015182559484019460019091019084016134a9565b508582101561350457878501517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600388901b60f8161c191681555b5050505050600190811b01905550565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b602081526000612dba602083018486613514565b60006020828403121561356557600080fd5b5051919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036135fb576135fb61359b565b5060010190565b60006020828403121561361457600080fd5b8151612cc28161331b565b67ffffffffffffffff831115613637576136376130ba565b61364b83613645835461337f565b836133d2565b6000601f84116001811461369d57600085156136675750838201355b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600387901b1c1916600186901b178355611c69565b600083815260209020601f19861690835b828110156136ce57868501358255602094850194600190920191016136ae565b5086821015613709577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff60f88860031b161c19848701351681555b505060018560011b0183555050505050565b60006001600160a01b0380881683528087166020840152508460408301526080606083015261374e608083018486613514565b979650505050505050565b808201808211156108ef576108ef61359b565b80820281158282048414176108ef576108ef61359b565b6000826137b9577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b500490565b818103818111156108ef576108ef61359b565b600082516137e38184602087016131ab565b9190910192915050565b602081526000612cc260208301846131cf56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a164736f6c6343000811000a',
  deployedBytecode:
    '0x6080604052600436106102a05760003560e01c8063954ef57e1161016e578063c946c5cc116100cb578063e2fdcc171161007f578063ecc44a3811610064578063ecc44a38146107c4578063f0363ae4146107d9578063fb162e03146107f057600080fd5b8063e2fdcc171461076f578063e79e5a231461079057600080fd5b8063d23254b4116100b0578063d23254b4146106eb578063d561f5b01461072f578063ddaf20791461074f57600080fd5b8063c946c5cc14610695578063c9c4bfca146106b757600080fd5b8063ad288fe811610122578063b4b1013c11610107578063b4b1013c1461060a578063b9a09fd51461062a578063bda46ea91461065957600080fd5b8063ad288fe8146105bd578063b1c6f0e9146105dd57600080fd5b80639ef13a41116101535780639ef13a41146105405780639f8a13d71461056e578063aa9bbc0c146105a857600080fd5b8063954ef57e146104dc57806397f723001461050d57600080fd5b80634162169f1161021c5780635c60da1b116101d057806382bbad24116101b557806382bbad24146104865780638456cb59146104a657806391ddadf4146104bb57600080fd5b80635c60da1b146104595780635c975abb1461046e57600080fd5b80634cea22f1116102015780634cea22f11461041c5780634f1ef2861461043157806352d1902d1461044457600080fd5b80634162169f146103e157806341de68301461040057600080fd5b8063244a26a6116102735780633659cfe6116102585780633659cfe6146103975780633f4ba83a146103b7578063408e2727146103cc57600080fd5b8063244a26a614610357578063310bd74b1461037757600080fd5b806301ffc9a7146102a5578063071d2171146102da57806315e5a1e51461031257806323303c6f14610335575b600080fd5b3480156102b157600080fd5b506102c56102c0366004612e7e565b610810565b60405190151581526020015b60405180910390f35b3480156102e657600080fd5b506102fa6102f5366004612edc565b6108f5565b6040516001600160a01b0390911681526020016102d1565b34801561031e57600080fd5b50610327610b34565b6040519081526020016102d1565b34801561034157600080fd5b50610355610350366004612f5f565b610bc1565b005b34801561036357600080fd5b50610355610372366004612fc6565b610d00565b34801561038357600080fd5b50610355610392366004613060565b610d9e565b3480156103a357600080fd5b506103556103b2366004612f5f565b610f0d565b3480156103c357600080fd5b506103556110a7565b3480156103d857600080fd5b506102c56110e9565b3480156103ed57600080fd5b5061012d546001600160a01b03166102fa565b34801561040c57600080fd5b5060006040516102d19190613079565b34801561042857600080fd5b50610327611171565b61035561043f3660046130e9565b6111d5565b34801561045057600080fd5b50610327611363565b34801561046557600080fd5b506102fa611428565b34801561047a57600080fd5b5060fb5460ff166102c5565b34801561049257600080fd5b506103556104a1366004612f5f565b61145b565b3480156104b257600080fd5b50610355611591565b3480156104c757600080fd5b50610192546102fa906001600160a01b031681565b3480156104e857600080fd5b506103276104f7366004613060565b6000908152610197602052604090206002015490565b34801561051957600080fd5b506102c5610528366004613060565b60009081526101976020526040902060030154151590565b34801561054c57600080fd5b5061032761055b366004612f5f565b6101966020526000908152604090205481565b34801561057a57600080fd5b506102c5610589366004612f5f565b6001600160a01b03166000908152610195602052604090205460ff1690565b3480156105b457600080fd5b506103276115d3565b3480156105c957600080fd5b506103556105d8366004612edc565b611637565b3480156105e957600080fd5b506105fd6105f8366004612f5f565b611740565b6040516102d191906131fb565b34801561061657600080fd5b506102fa610625366004613060565b611830565b34801561063657600080fd5b5061064a610645366004612f5f565b61185b565b6040516102d19392919061322c565b34801561066557600080fd5b506102c5610674366004612f5f565b6001600160a01b031660009081526101956020526040902060010154151590565b3480156106a157600080fd5b506106aa61190b565b6040516102d19190613256565b3480156106c357600080fd5b506103277f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f581565b3480156106f757600080fd5b506103276107063660046132a3565b6000918252610197602090815260408084206001600160a01b0393909316845291905290205490565b34801561073b57600080fd5b5061035561074a3660046132cf565b61196e565b34801561075b57600080fd5b506106aa61076a366004613060565b6119d5565b34801561077b57600080fd5b50610191546102fa906001600160a01b031681565b34801561079c57600080fd5b506103277ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201481565b3480156107d057600080fd5b50610327611a45565b3480156107e557600080fd5b506103276101935481565b3480156107fc57600080fd5b5061035561080b366004613329565b611aa9565b60007fffffffff0000000000000000000000000000000000000000000000000000000082167f41de68300000000000000000000000000000000000000000000000000000000014806108a357507fffffffff0000000000000000000000000000000000000000000000000000000082167f52d1902d00000000000000000000000000000000000000000000000000000000145b806108ef57507f01ffc9a7000000000000000000000000000000000000000000000000000000007fffffffff000000000000000000000000000000000000000000000000000000008316145b92915050565b61012d546000907ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490610937906001600160a01b031630335b84600036611c70565b61093f611d5e565b6001600160a01b03851661097f576040517f32e63e4400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03851660009081526101956020526040902060010154156109d3576040517f91fc82b600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604051806060016040528060011515815260200142815260200185858080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201829052509390945250506001600160a01b038816815261019560209081526040918290208451815460ff1916901515178155908401516001820155908301519091506002820190610a6c9082613418565b505061019480546001810182556000919091527fa6f1ac7ad7b125ba5a5e1c96b00ad6914f90a503b1ac3d85a9dadbb4c639df920180547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b03881617905550336001600160a01b0316856001600160a01b03167fe72b86315c30bd1bf352c4cf97594ba793f3e31b74bc874ce47ede0df6920ae98686604051610b1892919061353f565b60405180910390a3849150610b2c60018055565b509392505050565b61019254604080517fc75dd54100000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163c75dd5419160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610bbc9190613553565b905090565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490610bfb906001600160a01b0316303361092e565b6001600160a01b03821660009081526101956020526040902060010154610c5e576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b03831660048201526024015b60405180910390fd5b6001600160a01b0382166000908152610195602052604090205460ff1615610cb2576040517fcf12acdd00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03821660008181526101956020526040808220805460ff19166001179055517f34521f8891f6149b4baf837b8eea01eeefc28708be34ac8e705484dd34dde8189190a25050565b610d08611d5e565b610d10611dbd565b610d186110e9565b610d4e576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60005b83811015610d8e57610d7c858583818110610d6e57610d6e61356c565b905060200201358484611e12565b80610d86816135ca565b915050610d51565b50610d9860018055565b50505050565b610da6611d5e565b610dae611dbd565b610db66110e9565b610dec576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610191546040517f430c2081000000000000000000000000000000000000000000000000000000008152336004820152602481018390526001600160a01b039091169063430c208190604401602060405180830381865afa158015610e55573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610e799190613602565b610eaf576040517fe433766c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008181526101976020526040902060030154610ef8576040517f51387b1a00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610f01816123d6565b610f0a60018055565b50565b6001600160a01b037f0000000000000000000000002f21661f0ee08e5397e2e734fb162e8871a5f765163003610fab5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610c55565b7f0000000000000000000000002f21661f0ee08e5397e2e734fb162e8871a5f7656001600160a01b03166110067f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b0316146110825760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610c55565b61108b81612559565b60408051600080825260208201909252610f0a91839190612593565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d42014906110e1906001600160a01b0316303361092e565b610f0a612733565b61019254604080517f408e272700000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163408e27279160048083019260209291908290030181865afa15801561114d573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610bbc9190613602565b61019254604080517f51b7d39900000000000000000000000000000000000000000000000000000000815290516000926001600160a01b0316916351b7d3999160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b6001600160a01b037f0000000000000000000000002f21661f0ee08e5397e2e734fb162e8871a5f7651630036112735760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f64656c656761746563616c6c00000000000000000000000000000000000000006064820152608401610c55565b7f0000000000000000000000002f21661f0ee08e5397e2e734fb162e8871a5f7656001600160a01b03166112ce7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b6001600160a01b03161461134a5760405162461bcd60e51b815260206004820152602c60248201527f46756e6374696f6e206d7573742062652063616c6c6564207468726f7567682060448201527f6163746976652070726f787900000000000000000000000000000000000000006064820152608401610c55565b61135382612559565b61135f82826001612593565b5050565b6000306001600160a01b037f0000000000000000000000002f21661f0ee08e5397e2e734fb162e8871a5f76516146114035760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a206d757374206e6f742062652063616c60448201527f6c6564207468726f7567682064656c656761746563616c6c00000000000000006064820152608401610c55565b507f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90565b6000610bbc7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490611495906001600160a01b0316303361092e565b6001600160a01b038216600090815261019560205260409020600101546114f3576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0383166004820152602401610c55565b6001600160a01b0382166000908152610195602052604090205460ff16611546576040517fcf12acdd00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001600160a01b03821660008181526101956020526040808220805460ff19169055517f4a6f8353ec8700967336a2982804d34c6a35d417d5cb457ac11caa9eb917f0d49190a25050565b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d42014906115cb906001600160a01b0316303361092e565b610f0a612785565b61019254604080517f7667180800000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163766718089160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b61012d547ffda1ae526c1fb38407f23e8b7712f7cfacc146f3e340a04221488331e0d4201490611671906001600160a01b0316303361092e565b6001600160a01b038416600090815261019560205260409020600101546116cf576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0385166004820152602401610c55565b6001600160a01b0384166000908152610195602052604090206002016116f683858361361f565b50836001600160a01b03167f98c22290de5c8f771a9b53bc6833b5ad1b69539ef5fdd73a0ebf36fba1cdab6b848460405161173292919061353f565b60405180910390a250505050565b6040805160608082018352600080835260208084018290528385018390526001600160a01b038616825261019581529084902084519283018552805460ff16151583526001810154918301919091526002810180549394929391928401916117a79061337f565b80601f01602080910402602001604051908101604052809291908181526020018280546117d39061337f565b80156118205780601f106117f557610100808354040283529160200191611820565b820191906000526020600020905b81548152906001019060200180831161180357829003601f168201915b5050505050815250509050919050565b610194818154811061184157600080fd5b6000918252602090912001546001600160a01b0316905081565b6101956020526000908152604090208054600182015460028301805460ff9093169391926118889061337f565b80601f01602080910402602001604051908101604052809291908181526020018280546118b49061337f565b80156119015780601f106118d657610100808354040283529160200191611901565b820191906000526020600020905b8154815290600101906020018083116118e457829003601f168201915b5050505050905083565b606061019480548060200260200160405190810160405280929190818152602001828054801561196457602002820191906000526020600020905b81546001600160a01b03168152600190910190602001808311611946575b5050505050905090565b611976611d5e565b61197e611dbd565b6119866110e9565b6119bc576040517f6d40818900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6119c7838383611e12565b6119d060018055565b505050565b60008181526101976020908152604091829020600101805483518184028101840190945280845260609392830182828015611a3957602002820191906000526020600020905b81546001600160a01b03168152600190910190602001808311611a1b575b50505050509050919050565b61019254604080517fbed2e86b00000000000000000000000000000000000000000000000000000000815290516000926001600160a01b03169163bed2e86b9160048083019260209291908290030181865afa158015610b98573d6000803e3d6000fd5b600054610100900460ff1615808015611ac95750600054600160ff909116105b80611ae35750303b158015611ae3575060005460ff166001145b611b555760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201527f647920696e697469616c697a65640000000000000000000000000000000000006064820152608401610c55565b6000805460ff191660011790558015611b9557600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff166101001790555b611b9e856127c2565b611ba6612848565b611bae6128cd565b61019180546001600160a01b038087167fffffffffffffffffffffffff0000000000000000000000000000000000000000928316179092556101928054928516929091169190911790558215611c0657611c06612785565b8015611c6957600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff169055604051600181527f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb38474024989060200160405180910390a15b5050505050565b6040517ffdef91060000000000000000000000000000000000000000000000000000000081526001600160a01b0387169063fdef910690611cbd908890889088908890889060040161371b565b602060405180830381865afa158015611cda573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611cfe9190613602565b611d56576040517f32dbe3b40000000000000000000000000000000000000000000000000000000081526001600160a01b03808816600483015280871660248301528516604482015260648101849052608401610c55565b505050505050565b600260015403611db05760405162461bcd60e51b815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610c55565b6002600155565b60018055565b60fb5460ff1615611e105760405162461bcd60e51b815260206004820152601060248201527f5061757361626c653a20706175736564000000000000000000000000000000006044820152606401610c55565b565b610191546001600160a01b031663430c2081336040517fffffffff0000000000000000000000000000000000000000000000000000000060e084901b1681526001600160a01b03909116600482015260248101869052604401602060405180830381865afa158015611e88573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611eac9190613602565b611ee2576040517fe433766c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b610191546040517f72c4a927000000000000000000000000000000000000000000000000000000008152600481018590526000916001600160a01b0316906372c4a92790602401602060405180830381865afa158015611f46573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611f6a9190613553565b905080600003611fa6576040517f7c176b7400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b816000819003611fe2576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600085815261019760205260409020600301541561200357612003856123d6565b6000858152610197602052604081209080805b84811015612057578787828181106120305761203061356c565b6120439260409091020135905083613759565b91508061204f816135ca565b915050612016565b5080600003612092576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60005b848110156123a95760008888838181106120b1576120b161356c565b90506040020160200160208101906120c99190612f5f565b90506120f0816001600160a01b031660009081526101956020526040902060010154151590565b612131576040517f4c8901850000000000000000000000000000000000000000000000000000000081526001600160a01b0382166004820152602401610c55565b6001600160a01b0381166000908152610195602052604090205460ff1661218f576040517fd2b961e10000000000000000000000000000000000000000000000000000000081526001600160a01b0382166004820152602401610c55565b6001600160a01b038116600090815260208690526040902054156121df576040517ffdebb48000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600083888b8b868181106121f5576121f561356c565b90506040020160000135612209919061376c565b6122139190613783565b90508060000361224f576040517f198e163000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6001868101805491820181556000908152602080822090920180547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0386169081179091558152908790526040812080548392906122b6908490613759565b90915550506001600160a01b03821660009081526101966020526040812080548392906122e4908490613759565b909155506122f490508186613759565b94506122fe6115d3565b6001600160a01b038316336001600160a01b03167fc2e08dda2639fb332996dc4eee129c35a993f33a0362e69439c5d2e9df903c2e8e856101966000896001600160a01b03166001600160a01b03168152602001908152602001600020548b6101935461236b9190613759565b60408051948552602085019390935291830152606082015242608082015260a00160405180910390a4505080806123a1906135ca565b915050612095565b508161019360008282546123bd9190613759565b9091555050506002820155426003909101555050505050565b6000818152610197602052604081206002810182905560038101829055906001820190805b825481101561251a5760008382815481106124185761241861356c565b60009182526020808320909101546001600160a01b03168083528782526040808420546101969093528320805491945091928392916124589084906137be565b9091555061246890508185613759565b6001600160a01b038316600090815260208890526040812055935061248b6115d3565b6001600160a01b038316600081815261019660205260409020546101935433917f7a881a18bc3d2c64d59fea076f490b4df6ca4a14d87059fcab1e4c04ec516bf9918c9187916124dc908c906137be565b60408051948552602085019390935291830152606082015242608082015260a00160405180910390a450508080612512906135ca565b9150506123fb565b50604080516000815260208101918290525161253a916001860191612dec565b5080610193600082825461254e91906137be565b909155505050505050565b61012d547f821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f59061135f906001600160a01b0316303361092e565b7f4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd91435460ff16156125c6576119d083612952565b826001600160a01b03166352d1902d6040518163ffffffff1660e01b8152600401602060405180830381865afa925050508015612620575060408051601f3d908101601f1916820190925261261d91810190613553565b60015b6126925760405162461bcd60e51b815260206004820152602e60248201527f45524331393637557067726164653a206e657720696d706c656d656e7461746960448201527f6f6e206973206e6f7420555550530000000000000000000000000000000000006064820152608401610c55565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc81146127275760405162461bcd60e51b815260206004820152602960248201527f45524331393637557067726164653a20756e737570706f727465642070726f7860448201527f6961626c655555494400000000000000000000000000000000000000000000006064820152608401610c55565b506119d0838383612a28565b61273b612a4d565b60fb805460ff191690557f5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa335b6040516001600160a01b03909116815260200160405180910390a1565b61278d611dbd565b60fb805460ff191660011790557f62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a2586127683390565b600054610100900460ff1661283f5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b610f0a81612a9f565b600054610100900460ff166128c55760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b611e10612b57565b600054610100900460ff1661294a5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b611e10612bd4565b6001600160a01b0381163b6129cf5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201527f6f74206120636f6e7472616374000000000000000000000000000000000000006064820152608401610c55565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0392909216919091179055565b612a3183612c5d565b600082511180612a3e5750805b156119d057610d988383612c9d565b60fb5460ff16611e105760405162461bcd60e51b815260206004820152601460248201527f5061757361626c653a206e6f74207061757365640000000000000000000000006044820152606401610c55565b600054610100900460ff16612b1c5760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b61012d80547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0392909216919091179055565b600054610100900460ff16611db75760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b600054610100900460ff16612c515760405162461bcd60e51b815260206004820152602b60248201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960448201527f6e697469616c697a696e670000000000000000000000000000000000000000006064820152608401610c55565b60fb805460ff19169055565b612c6681612952565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b6060612cc2838360405180606001604052806027815260200161380160279139612cc9565b9392505050565b6060600080856001600160a01b031685604051612ce691906137d1565b600060405180830381855af49150503d8060008114612d21576040519150601f19603f3d011682016040523d82523d6000602084013e612d26565b606091505b5091509150612d3786838387612d41565b9695505050505050565b60608315612db0578251600003612da9576001600160a01b0385163b612da95760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e74726163740000006044820152606401610c55565b5081612dba565b612dba8383612dc2565b949350505050565b815115612dd25781518083602001fd5b8060405162461bcd60e51b8152600401610c5591906137ed565b828054828255906000526020600020908101928215612e59579160200282015b82811115612e5957825182547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b03909116178255602090920191600190910190612e0c565b50612e65929150612e69565b5090565b5b80821115612e655760008155600101612e6a565b600060208284031215612e9057600080fd5b81357fffffffff0000000000000000000000000000000000000000000000000000000081168114612cc257600080fd5b80356001600160a01b0381168114612ed757600080fd5b919050565b600080600060408486031215612ef157600080fd5b612efa84612ec0565b9250602084013567ffffffffffffffff80821115612f1757600080fd5b818601915086601f830112612f2b57600080fd5b813581811115612f3a57600080fd5b876020828501011115612f4c57600080fd5b6020830194508093505050509250925092565b600060208284031215612f7157600080fd5b612cc282612ec0565b60008083601f840112612f8c57600080fd5b50813567ffffffffffffffff811115612fa457600080fd5b6020830191508360208260061b8501011115612fbf57600080fd5b9250929050565b60008060008060408587031215612fdc57600080fd5b843567ffffffffffffffff80821115612ff457600080fd5b818701915087601f83011261300857600080fd5b81358181111561301757600080fd5b8860208260051b850101111561302c57600080fd5b60209283019650945090860135908082111561304757600080fd5b5061305487828801612f7a565b95989497509550505050565b60006020828403121561307257600080fd5b5035919050565b60208101600383106130b4577f4e487b7100000000000000000000000000000000000000000000000000000000600052602160045260246000fd5b91905290565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080604083850312156130fc57600080fd5b61310583612ec0565b9150602083013567ffffffffffffffff8082111561312257600080fd5b818501915085601f83011261313657600080fd5b813581811115613148576131486130ba565b604051601f8201601f19908116603f01168101908382118183101715613170576131706130ba565b8160405282815288602084870101111561318957600080fd5b8260208601602083013760006020848301015280955050505050509250929050565b60005b838110156131c65781810151838201526020016131ae565b50506000910152565b600081518084526131e78160208601602086016131ab565b601f01601f19169290920160200192915050565b602081528151151560208201526020820151604082015260006040830151606080840152612dba60808401826131cf565b831515815282602082015260606040820152600061324d60608301846131cf565b95945050505050565b6020808252825182820181905260009190848201906040850190845b818110156132975783516001600160a01b031683529284019291840191600101613272565b50909695505050505050565b600080604083850312156132b657600080fd5b823591506132c660208401612ec0565b90509250929050565b6000806000604084860312156132e457600080fd5b83359250602084013567ffffffffffffffff81111561330257600080fd5b61330e86828701612f7a565b9497909650939450505050565b8015158114610f0a57600080fd5b6000806000806080858703121561333f57600080fd5b61334885612ec0565b935061335660208601612ec0565b925060408501356133668161331b565b915061337460608601612ec0565b905092959194509250565b600181811c9082168061339357607f821691505b6020821081036133cc577f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b50919050565b601f8211156119d057600081815260208120601f850160051c810160208610156133f95750805b601f850160051c820191505b81811015611d5657828155600101613405565b815167ffffffffffffffff811115613432576134326130ba565b61344681613440845461337f565b846133d2565b602080601f83116001811461349957600084156134635750858301515b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600386901b1c1916600185901b178555611d56565b600085815260208120601f198616915b828110156134c8578886015182559484019460019091019084016134a9565b508582101561350457878501517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600388901b60f8161c191681555b5050505050600190811b01905550565b818352818160208501375060006020828401015260006020601f19601f840116840101905092915050565b602081526000612dba602083018486613514565b60006020828403121561356557600080fd5b5051919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036135fb576135fb61359b565b5060010190565b60006020828403121561361457600080fd5b8151612cc28161331b565b67ffffffffffffffff831115613637576136376130ba565b61364b83613645835461337f565b836133d2565b6000601f84116001811461369d57600085156136675750838201355b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600387901b1c1916600186901b178355611c69565b600083815260209020601f19861690835b828110156136ce57868501358255602094850194600190920191016136ae565b5086821015613709577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff60f88860031b161c19848701351681555b505060018560011b0183555050505050565b60006001600160a01b0380881683528087166020840152508460408301526080606083015261374e608083018486613514565b979650505050505050565b808201808211156108ef576108ef61359b565b80820281158282048414176108ef576108ef61359b565b6000826137b9577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b500490565b818103818111156108ef576108ef61359b565b600082516137e38184602087016131ab565b9190910192915050565b602081526000612cc260208301846131cf56fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a164736f6c6343000811000a',
  linkReferences: {},
  deployedLinkReferences: {},
}
