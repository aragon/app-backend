export const ERC20 = {
  _format: 'hh-sol-artifact-1',
  contractName: 'ERC20',
  sourceName: 'solmate/src/tokens/ERC20.sol',
  abi: [
    {
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'minter_',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'mintingAllowedAfter_',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'owner',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'spender',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'Approval',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'delegator',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'fromDelegate',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'toDelegate',
          type: 'address',
        },
      ],
      name: 'DelegateChanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'delegate',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'previousBalance',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newBalance',
          type: 'uint256',
        },
      ],
      name: 'DelegateVotesChanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'minter',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'newMinter',
          type: 'address',
        },
      ],
      name: 'MinterChanged',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'from',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'Transfer',
      type: 'event',
    },
    {
      constant: true,
      inputs: [],
      name: 'DELEGATION_TYPEHASH',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'DOMAIN_TYPEHASH',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'PERMIT_TYPEHASH',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
          notice: 'The address of the account holding the funds',
        },
        {
          internalType: 'address',
          name: 'spender',
          type: 'address',
          notice: 'The address of the account spending the funds',
        },
      ],
      name: 'allowance',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
      notice: 'Get the number of tokens `spender` is approved to spend on behalf of `account`',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'spender',
          type: 'address',
          notice: 'The address of the account which may transfer tokens',
        },
        {
          internalType: 'uint256',
          name: 'rawAmount',
          type: 'uint256',
          notice: 'The number of tokens that are approved (2^256-1 means infinite)',
        },
      ],
      name: 'approve',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Approve `spender` to transfer up to `amount` from `src`',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
          notice: 'The address of the account to get the balance of',
        },
      ],
      name: 'balanceOf',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
      notice: 'Get the number of tokens held by the `account`',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
        {
          internalType: 'uint32',
          name: '',
          type: 'uint32',
        },
      ],
      name: 'checkpoints',
      outputs: [
        {
          internalType: 'uint32',
          name: 'fromBlock',
          type: 'uint32',
        },
        {
          internalType: 'uint96',
          name: 'votes',
          type: 'uint96',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'decimals',
      outputs: [
        {
          internalType: 'uint8',
          name: '',
          type: 'uint8',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'delegatee',
          type: 'address',
          notice: 'The address to delegate votes to',
        },
      ],
      name: 'delegate',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Delegate votes from `msg.sender` to `delegatee`',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'delegatee',
          type: 'address',
          notice: 'The address to delegate votes to',
        },
        {
          internalType: 'uint256',
          name: 'nonce',
          type: 'uint256',
          notice: 'The contract state required to match the signature',
        },
        {
          internalType: 'uint256',
          name: 'expiry',
          type: 'uint256',
          notice: 'The time at which to expire the signature',
        },
        {
          internalType: 'uint8',
          name: 'v',
          type: 'uint8',
          notice: 'The recovery byte of the signature',
        },
        {
          internalType: 'bytes32',
          name: 'r',
          type: 'bytes32',
          notice: 'Half of the ECDSA signature pair',
        },
        {
          internalType: 'bytes32',
          name: 's',
          type: 'bytes32',
          notice: 'Half of the ECDSA signature pair',
        },
      ],
      name: 'delegateBySig',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Delegates votes from signatory to `delegatee`',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      name: 'delegates',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
          notice: 'The address to get votes balance',
        },
      ],
      name: 'getCurrentVotes',
      outputs: [
        {
          internalType: 'uint96',
          name: '',
          type: 'uint96',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
      notice: 'Gets the current votes balance for `account`',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
          notice: 'The address of the account to check',
        },
        {
          internalType: 'uint256',
          name: 'blockNumber',
          type: 'uint256',
          notice: 'The block number to get the vote balance at',
        },
      ],
      name: 'getPriorVotes',
      outputs: [
        {
          internalType: 'uint96',
          name: '',
          type: 'uint96',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
      notice: 'Determine the prior number of votes for an account as of a block number',
    },
    {
      constant: true,
      inputs: [],
      name: 'minimumTimeBetweenMints',
      outputs: [
        {
          internalType: 'uint32',
          name: '',
          type: 'uint32',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'dst',
          type: 'address',
          notice: 'The address of the destination account',
        },
        {
          internalType: 'uint256',
          name: 'rawAmount',
          type: 'uint256',
          notice: 'The number of tokens to be minted',
        },
      ],
      name: 'mint',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Mint new tokens',
    },
    {
      constant: true,
      inputs: [],
      name: 'mintCap',
      outputs: [
        {
          internalType: 'uint8',
          name: '',
          type: 'uint8',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'minter',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'mintingAllowedAfter',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'name',
      outputs: [
        {
          internalType: 'string',
          name: '',
          type: 'string',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      name: 'nonces',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      name: 'numCheckpoints',
      outputs: [
        {
          internalType: 'uint32',
          name: '',
          type: 'uint32',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'owner',
          type: 'address',
          notice: 'The address to approve from',
        },
        {
          internalType: 'address',
          name: 'spender',
          type: 'address',
          notice: 'The address to be approved',
        },
        {
          internalType: 'uint256',
          name: 'rawAmount',
          type: 'uint256',
          notice: 'The number of tokens that are approved (2^256-1 means infinite)',
        },
        {
          internalType: 'uint256',
          name: 'deadline',
          type: 'uint256',
          notice: 'The time at which to expire the signature',
        },
        {
          internalType: 'uint8',
          name: 'v',
          type: 'uint8',
          notice: 'The recovery byte of the signature',
        },
        {
          internalType: 'bytes32',
          name: 'r',
          type: 'bytes32',
          notice: 'Half of the ECDSA signature pair',
        },
        {
          internalType: 'bytes32',
          name: 's',
          type: 'bytes32',
          notice: 'Half of the ECDSA signature pair',
        },
      ],
      name: 'permit',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Triggers an approval from owner to spends',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'minter_',
          type: 'address',
          notice: 'The address of the new minter',
        },
      ],
      name: 'setMinter',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Change the minter address',
    },
    {
      constant: true,
      inputs: [],
      name: 'symbol',
      outputs: [
        {
          internalType: 'string',
          name: '',
          type: 'string',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'dst',
          type: 'address',
          notice: 'The address of the destination account',
        },
        {
          internalType: 'uint256',
          name: 'rawAmount',
          type: 'uint256',
          notice: 'The number of tokens to transfer',
        },
      ],
      name: 'transfer',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Transfer `amount` tokens from `msg.sender` to `dst`',
    },
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'src',
          type: 'address',
          notice: 'The address of the source account',
        },
        {
          internalType: 'address',
          name: 'dst',
          type: 'address',
          notice: 'The address of the destination account',
        },
        {
          internalType: 'uint256',
          name: 'rawAmount',
          type: 'uint256',
          notice: 'The number of tokens to transfer',
        },
      ],
      name: 'transferFrom',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
      notice: 'Transfer `amount` tokens from `src` to `dst`',
    },
  ],
  bytecode: '0x',
  deployedBytecode: '0x',
  linkReferences: {},
  deployedLinkReferences: {},
}
