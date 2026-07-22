import * as ContractNetspecHelper from '@helpers/contractNetspec'
import { expect } from 'chai'

describe('Helpers:ContractNetspec:Public', () => {
  it('should enrich a simple function with notice and param notices', () => {
    const sourceCode = `
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.0;

      /**
       * @title Sample Contract
       * @dev This is a sample contract to demonstrate NatSpec extraction
       */
      contract SampleContract {
          /**
           * @notice Adds two numbers
           * @param a The first number
           * @param b The second number
           * @return The sum of a and b
           */
          function add(uint256 a, uint256 b) public pure returns (uint256) {
              return a + b;
          }
      }
    `
    const abi = [
      {
        inputs: [
          { internalType: 'uint256', name: 'a', type: 'uint256' },
          { internalType: 'uint256', name: 'b', type: 'uint256' },
        ],
        name: 'add',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'pure',
        type: 'function',
      },
    ]

    const results = ContractNetspecHelper.parseNetspec(sourceCode, 'SampleContract', abi)
    expect(results[0].notice).to.be.eq('Adds two numbers')
    expect(results[0].inputs[0].notice).to.be.eq('The first number')
    expect(results[0].inputs[1].notice).to.be.eq('The second number')
  })

  it('should survive mangled Etherscan double-brace source and still attach the nearest doc', () => {
    const mockResponse = `{{
    "sources": {
        "contracts/DAO.sol": {
            "content":"// SPDX-License-Identifier: MIT\\n\\rpragma solidity ^0.8.0\\"contract DAO \\\\{@notice Thrown for permission grants where \`who\` and \`where\` are both \`ANY_ADDR\`.\\n    error AnyAddressDisallowedForWhoAndWhere();\\n\\n    /// @notice Thrown if \`Operation\` \\n  function add(uint256 a, uint256 b) public pure returns (uint256) \\\\{ return a + b;\\\\}}"
        }
    }
}}`
    const results = ContractNetspecHelper.parseNetspec(mockResponse, 'DAO', [
      {
        inputs: [
          { internalType: 'uint256', name: 'a', type: 'uint256' },
          { internalType: 'uint256', name: 'b', type: 'uint256' },
        ],
        name: 'add',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'pure',
        type: 'function',
      },
    ])

    expect(results[0].notice).to.be.eq('Thrown if `Operation`')
  })

  it('should attach natspec to the correct function overload (APP-822)', () => {
    const sourceCode = `
      interface IProposal {
        /// @notice Creates a new proposal.
        /// @param _metadata The metadata of the proposal.
        /// @param _actions The actions that will be executed after the proposal passes.
        /// @param _startDate The start date of the proposal.
        /// @param _endDate The end date of the proposal.
        /// @param _data The additional abi-encoded data to include more necessary fields.
        function createProposal(bytes calldata _metadata, Action[] calldata _actions, uint64 _startDate, uint64 _endDate, bytes memory _data) external returns (uint256);
      }

      contract Multisig is IProposal {
        /// @notice Creates a new multisig proposal.
        /// @param _metadata The metadata of the proposal.
        /// @param _actions The actions that will be executed after the proposal passes.
        /// @param _allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert.
        /// @param _approveProposal If \`true\`, the sender will approve the proposal.
        /// @param _tryExecution If \`true\`, execution is tried after the vote cast.
        /// @param _startDate The start date of the proposal.
        /// @param _endDate The end date of the proposal.
        function createProposal(bytes calldata _metadata, Action[] calldata _actions, uint256 _allowFailureMap, bool _approveProposal, bool _tryExecution, uint64 _startDate, uint64 _endDate) external returns (uint256 proposalId) {}

        /// @inheritdoc IProposal
        function createProposal(bytes calldata _metadata, Action[] calldata _actions, uint64 _startDate, uint64 _endDate, bytes memory _data) external override returns (uint256) {}
      }
    `
    const abi = [
      {
        type: 'function',
        name: 'createProposal',
        inputs: [
          { name: '_metadata', type: 'bytes' },
          { name: '_actions', type: 'tuple[]' },
          { name: '_allowFailureMap', type: 'uint256' },
          { name: '_approveProposal', type: 'bool' },
          { name: '_tryExecution', type: 'bool' },
          { name: '_startDate', type: 'uint64' },
          { name: '_endDate', type: 'uint64' },
        ],
        outputs: [],
      },
      {
        type: 'function',
        name: 'createProposal',
        inputs: [
          { name: '_metadata', type: 'bytes' },
          { name: '_actions', type: 'tuple[]' },
          { name: '_startDate', type: 'uint64' },
          { name: '_endDate', type: 'uint64' },
          { name: '_data', type: 'bytes' },
        ],
        outputs: [],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Multisig', abi, '0.8.17')

    const sevenArg = result.find((f: any) => f.inputs.length === 7)
    expect(sevenArg.notice).to.equal('Creates a new multisig proposal.')
    expect(sevenArg.inputs.find((i: any) => i.name === '_allowFailureMap').notice).to.contain('A bitmap')
    expect(sevenArg.inputs.find((i: any) => i.name === '_approveProposal').notice).to.equal(
      'If `true`, the sender will approve the proposal.',
    )
    expect(sevenArg.inputs.find((i: any) => i.name === '_tryExecution').notice).to.contain('execution is tried')

    const fiveArg = result.find((f: any) => f.inputs.length === 5)
    expect(fiveArg.notice).to.equal('Creates a new proposal.')
    expect(fiveArg.inputs.find((i: any) => i.name === '_data').notice).to.contain('additional abi-encoded data')
  })

  it('should resolve @inheritdoc against the matching parent overload (APP-822 #1)', () => {
    const sourceCode = `
      interface IProposal {
        /// @notice Creates a proposal (long form).
        /// @param _metadata The metadata.
        /// @param _allowFailureMap The failure bitmap.
        /// @param _startDate The start date.
        function createProposal(bytes _metadata, uint256 _allowFailureMap, uint64 _startDate) external returns (uint256);

        /// @notice Creates a proposal (short form).
        /// @param _metadata The metadata.
        /// @param _data The extra data.
        function createProposal(bytes _metadata, bytes _data) external returns (uint256);
      }

      contract Multisig is IProposal {
        /// @inheritdoc IProposal
        function createProposal(bytes _metadata, uint256 _allowFailureMap, uint64 _startDate) external override returns (uint256) {}

        /// @inheritdoc IProposal
        function createProposal(bytes _metadata, bytes _data) external override returns (uint256) {}
      }
    `
    const abi = [
      {
        type: 'function',
        name: 'createProposal',
        inputs: [
          { name: '_metadata', type: 'bytes' },
          { name: '_allowFailureMap', type: 'uint256' },
          { name: '_startDate', type: 'uint64' },
        ],
        outputs: [],
      },
      {
        type: 'function',
        name: 'createProposal',
        inputs: [
          { name: '_metadata', type: 'bytes' },
          { name: '_data', type: 'bytes' },
        ],
        outputs: [],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Multisig', abi, '0.8.17')

    const longForm = result.find((f: any) => f.inputs.length === 3)
    expect(longForm.notice).to.equal('Creates a proposal (long form).')
    expect(longForm.inputs.find((i: any) => i.name === '_allowFailureMap').notice).to.equal('The failure bitmap.')

    const shortForm = result.find((f: any) => f.inputs.length === 2)
    expect(shortForm.notice).to.equal('Creates a proposal (short form).')
    expect(shortForm.inputs.find((i: any) => i.name === '_data').notice).to.equal('The extra data.')
  })

  it('should disambiguate overloads inherited from a base contract, not redeclared (APP-822 #2)', () => {
    const sourceCode = `
      contract Base {
        /// @notice Transfer (with data).
        /// @param to The recipient.
        /// @param id The token id.
        /// @param data Extra data.
        function safeTransferFrom(address to, uint256 id, bytes data) public {}

        /// @notice Transfer (no data).
        /// @param to The recipient.
        /// @param id The token id.
        function safeTransferFrom(address to, uint256 id) public {}
      }

      contract MyNFT is Base {}
    `
    const abi = [
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'id', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
        outputs: [],
      },
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'id', type: 'uint256' },
        ],
        outputs: [],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'MyNFT', abi, '0.8.17')

    const withData = result.find((f: any) => f.inputs.length === 3)
    expect(withData.notice).to.equal('Transfer (with data).')
    expect(withData.inputs.find((i: any) => i.name === 'data').notice).to.equal('Extra data.')

    const noData = result.find((f: any) => f.inputs.length === 2)
    expect(noData.notice).to.equal('Transfer (no data).')
    expect(noData.inputs.every((i: any) => i.notice !== undefined)).to.be.true
  })

  it('should distinguish overloads that only differ by parameter type', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Uses a number.
        /// @param value The numeric value.
        function configure(uint256 value) public {}

        /// @notice Uses an address.
        /// @param value The address value.
        function configure(address value) public {}
      }
    `
    const abi = [
      { type: 'function', name: 'configure', inputs: [{ name: 'value', type: 'uint256' }], outputs: [] },
      { type: 'function', name: 'configure', inputs: [{ name: 'value', type: 'address' }], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'TestContract', abi, '0.8.17')

    expect(result[0].notice).to.equal('Uses a number.')
    expect(result[0].inputs[0].notice).to.equal('The numeric value.')
    expect(result[1].notice).to.equal('Uses an address.')
    expect(result[1].inputs[0].notice).to.equal('The address value.')
  })

  it('should retain overloads formed by a child and its base contract', () => {
    const sourceCode = `
      contract Base {
        /// @notice Uses a number.
        /// @param number The number.
        function configure(uint256 number) public {}
      }

      contract Child is Base {
        /// @notice Uses an account.
        /// @param account The account.
        function configure(address account) public {}
      }
    `
    const abi = [
      { type: 'function', name: 'configure', inputs: [{ name: 'number', type: 'uint256' }], outputs: [] },
      { type: 'function', name: 'configure', inputs: [{ name: 'account', type: 'address' }], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Child', abi, '0.8.17')

    expect(result[0].notice).to.equal('Uses a number.')
    expect(result[0].inputs[0].notice).to.equal('The number.')
    expect(result[1].notice).to.equal('Uses an account.')
    expect(result[1].inputs[0].notice).to.equal('The account.')
  })

  it('should label a zero-arg overload with its own notice, not a same-name overload (#6)', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Renounce a specific account.
        /// @param account The account to renounce.
        function renounce(address account) public {}

        /// @notice Renounce the caller's own role.
        function renounce() public {}
      }
    `
    const abi = [
      { type: 'function', name: 'renounce', inputs: [{ name: 'account', type: 'address' }], outputs: [] },
      { type: 'function', name: 'renounce', inputs: [], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'TestContract', abi, '0.8.17')

    expect(result.find((f: any) => f.inputs.length === 1).notice).to.equal('Renounce a specific account.')
    expect(result.find((f: any) => f.inputs.length === 0).notice).to.equal("Renounce the caller's own role.")
  })

  it('should prefer a child overload override over the inherited parent doc (#7)', () => {
    const sourceCode = `
      contract Parent {
        /// @notice Parent uint overload.
        /// @param a The number.
        function f(uint256 a) public {}

        /// @notice Parent address overload (stale).
        /// @param b The address.
        function f(address b) public {}
      }

      contract Child is Parent {
        /// @notice Child address overload (fresh).
        /// @param b The child address.
        function f(address b) public override {}
      }
    `
    const abi = [
      { type: 'function', name: 'f', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] },
      { type: 'function', name: 'f', inputs: [{ name: 'b', type: 'address' }], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Child', abi, '0.8.17')

    const uintForm = result.find((f: any) => f.inputs[0].name === 'a')
    expect(uintForm.notice).to.equal('Parent uint overload.')

    const addressForm = result.find((f: any) => f.inputs[0].name === 'b')
    expect(addressForm.notice).to.equal('Child address overload (fresh).')
    expect(addressForm.inputs[0].notice).to.equal('The child address.')
  })

  it('should not attach an event doc to a same-name function overload (#8)', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Deposit function.
        /// @param amount The deposited amount.
        function Deposit(uint256 amount) public {}

        /// @notice Deposit event (not a function).
        /// @param amount The logged amount.
        event Deposit(uint256 amount);
      }
    `
    const abi = [{ type: 'function', name: 'Deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] }]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'TestContract', abi, '0.8.17')

    expect(result[0].notice).to.equal('Deposit function.')
    expect(result[0].inputs[0].notice).to.equal('The deposited amount.')
  })

  it('should resolve @inheritdoc from a function when the parent has a same-name event', () => {
    const sourceCode = `
      contract Parent {
        /// @notice Function documentation.
        /// @param value The function value.
        function configure(uint256 value) public virtual {}

        /// @notice Event documentation.
        /// @param value The logged value.
        event configure(uint256 value);
      }

      contract Child is Parent {
        /// @inheritdoc Parent
        function configure(uint256 value) public override {}
      }
    `
    const abi = [{ type: 'function', name: 'configure', inputs: [{ name: 'value', type: 'uint256' }], outputs: [] }]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Child', abi, '0.8.17')

    expect(result[0].notice).to.equal('Function documentation.')
    expect(result[0].inputs[0].notice).to.equal('The function value.')
  })

  it('should parse a function whose name collides with an Object.prototype member (#11)', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Renders the value.
        /// @param value The value to render.
        function toString(uint256 value) public pure returns (string memory) {}

        /// @notice Reads the stored value.
        function valueOf() public view returns (uint256) {}
      }
    `
    const abi = [
      { type: 'function', name: 'toString', inputs: [{ name: 'value', type: 'uint256' }], outputs: [] },
      { type: 'function', name: 'valueOf', inputs: [], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'TestContract', abi, '0.8.17')

    const toStr = result.find((f: any) => f.name === 'toString')
    expect(toStr.notice).to.equal('Renders the value.')
    expect(toStr.inputs[0].notice).to.equal('The value to render.')
    expect(result.find((f: any) => f.name === 'valueOf').notice).to.equal('Reads the stored value.')
  })

  it('should enrich functions documented only in a base through inheritance', () => {
    const solidityCode = `
      pragma solidity ^0.8.0;

      /// @title Base Contract
      contract BaseContract {
        /// @notice Base function
        /// @param x Input parameter
        function baseFunc(uint x) public virtual {}
      }

      /// @title Derived Contract
      contract DerivedContract is BaseContract {
        /// @inheritdoc BaseContract
        function baseFunc(uint x) public override {}

        /// @notice New function
        /// @param y New parameter
        function newFunc(uint y) public {}
      }`

    const abi = [
      { name: 'baseFunc', type: 'function', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] },
      { name: 'newFunc', type: 'function', inputs: [{ name: 'y', type: 'uint256' }], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(solidityCode, 'DerivedContract', abi, '0.8.19')

    expect(result.find((f: any) => f.name === 'baseFunc')?.notice).to.equal('Base function')
    expect(result.find((f: any) => f.name === 'newFunc')?.notice).to.equal('New function')
  })

  it('should enrich interface functions', () => {
    const sourceCode = `
      /// @title Test Interface
      interface ITest {
        /// @notice Interface function
        function interfaceFunc() external;
      }
    `
    const abi = [{ name: 'interfaceFunc', type: 'function', inputs: [], outputs: [] }]
    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'ITest', abi, '0.8.19')
    expect(result[0].notice).to.equal('Interface function')
  })

  it('should enrich generated public-variable getters', () => {
    const sourceCode = `
      contract Token {
        /// @notice Total number of tokens in circulation.
        uint256 public totalSupply;

        /// @notice Token balance per account.
        mapping(address => uint256) public balanceOf;
      }
    `
    const abi = [
      { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }] },
      {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Token', abi, '0.8.19')

    expect(result[0].notice).to.equal('Total number of tokens in circulation.')
    expect(result[1].notice).to.equal('Token balance per account.')
  })

  it('should attach parameter notices by position for unnamed ABI inputs', () => {
    const sourceCode = `
      contract T {
        /// @notice Sets both values.
        /// @param a The first value.
        /// @param b The second value.
        function set(uint256 a, uint256 b) public {}
      }
    `
    const abi = [
      {
        type: 'function',
        name: 'set',
        inputs: [
          { name: '', type: 'uint256' },
          { name: '', type: 'uint256' },
        ],
        outputs: [],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'T', abi, '0.8.19')

    expect(result[0].notice).to.equal('Sets both values.')
    expect(result[0].inputs[0].notice).to.equal('The first value.')
    expect(result[0].inputs[1].notice).to.equal('The second value.')
  })

  it('should not leak the block-comment terminator into a notice', () => {
    const sourceCode = `
      contract TestContract {
        /** @notice Short notice */
        function test() public {}
      }
    `
    const abi = [{ type: 'function', name: 'test', inputs: [], outputs: [] }]
    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'TestContract', abi, '0.8.19')
    expect(result[0].notice).to.equal('Short notice')
  })

  it('should preserve an existing notice when no documentation resolves', () => {
    const sourceCode = `
      contract T {
        /// @notice Fresh notice.
        function a() public {}

        function b() public {}
      }
    `
    const abi = [
      { type: 'function', name: 'a', inputs: [], outputs: [], notice: 'stale notice' },
      { type: 'function', name: 'b', inputs: [], outputs: [], notice: 'kept notice' },
      { type: 'function', name: 'missing', inputs: [], outputs: [], notice: 'also kept' },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'T', abi, '0.8.19')

    expect(result[0].notice).to.equal('Fresh notice.')
    expect(result[1].notice).to.equal('kept notice')
    expect(result[1]).to.equal(abi[1])
    expect(result[2].notice).to.equal('also kept')
  })

  it('should not enrich constructors, events, errors, fallback, or receive entries', () => {
    const sourceCode = `
      contract T {
        /// @notice Constructs.
        constructor(uint256 a) {}

        /// @notice Emitted.
        event Done(uint256 a);

        /// @notice Thrown.
        error Bad();

        /// @notice Falls back.
        fallback() external payable {}

        /// @notice Receives.
        receive() external payable {}
      }
    `
    const abi = [
      { type: 'constructor', inputs: [{ name: 'a', type: 'uint256' }] },
      { type: 'event', name: 'Done', inputs: [{ name: 'a', type: 'uint256' }] },
      { type: 'error', name: 'Bad', inputs: [] },
      { type: 'fallback', stateMutability: 'payable' },
      { type: 'receive', stateMutability: 'payable' },
    ]

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'T', abi, '0.8.19')

    for (let idx = 0; idx < abi.length; idx++) {
      expect(result[idx]).to.equal(abi[idx])
      expect(result[idx].notice).to.be.undefined
    }
  })

  it('should not mutate the input ABI', () => {
    const sourceCode = `
      contract Test {
        /// @notice Does a thing
        /// @param x the x value
        function doThing(uint x) public {}
      }`
    const abi = [
      {
        type: 'function',
        name: 'doThing',
        inputs: [{ name: 'x', type: 'uint256' }],
        outputs: [],
      },
    ]
    const abiSnapshot = JSON.parse(JSON.stringify(abi))

    const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Test', abi, '0.8.19')

    expect(abi).to.deep.equal(abiSnapshot)
    expect(result[0].notice).to.equal('Does a thing')
    expect(result[0].inputs[0].notice).to.equal('the x value')
  })

  it('should return the ABI unchanged for invalid JSON that is not source code', () => {
    const result = ContractNetspecHelper.parseNetspec('{invalid json}', 'Test', [])
    expect(result).to.be.an('array')
    expect(result).to.be.empty
  })

  it('should return an empty array for a non-array ABI', () => {
    expect(ContractNetspecHelper.parseNetspec('contract T {}', 'T', null)).to.deep.equal([])
    expect(ContractNetspecHelper.parseNetspec('contract T {}', 'T', undefined)).to.deep.equal([])
    expect(ContractNetspecHelper.parseNetspec('contract T {}', 'T', 'not-an-abi')).to.deep.equal([])
  })

  it('should never throw on missing or malformed source and target', () => {
    const abi = [{ type: 'function', name: 'f', inputs: [], outputs: [] }]
    expect(ContractNetspecHelper.parseNetspec(null, 'T', abi)).to.deep.equal(abi)
    expect(ContractNetspecHelper.parseNetspec(undefined, 'T', abi)).to.deep.equal(abi)
    expect(ContractNetspecHelper.parseNetspec('', 'T', abi)).to.deep.equal(abi)
    expect(ContractNetspecHelper.parseNetspec(12345, 'T', abi)).to.deep.equal(abi)
    expect(ContractNetspecHelper.parseNetspec('contract Test {}', 'MissingContract', abi)).to.deep.equal(abi)
    expect(ContractNetspecHelper.parseNetspec('contract T {}', undefined as any, abi)).to.deep.equal(abi)
    const malformed = [null, 42, { type: 'function' }, { type: 'function', name: 'f' }]
    expect(ContractNetspecHelper.parseNetspec('contract T { function f() public {} }', 'T', malformed)).to.have.length(
      4,
    )
  })

  it('should not hang on a contract declaration with no closing brace', () => {
    const truncated = `
      pragma solidity ^0.8.0;
      contract Foo is Bar`
    const abi = [{ type: 'function', name: 'f', inputs: [], outputs: [] }]
    const result = ContractNetspecHelper.parseNetspec(truncated, 'Foo', abi, '0.8.19')
    expect(result).to.deep.equal(abi)
  })

  it('should return the ABI unchanged when the language is undecidable', () => {
    const ambiguous = `
      // Just comments
      /* More comments */
      # Some comment
    `
    const abi = [{ type: 'function', name: 'f', inputs: [], outputs: [] }]
    const result = ContractNetspecHelper.parseNetspec(ambiguous, 'Test', abi)
    expect(result).to.deep.equal(abi)
  })

  describe('undecidable language selection', () => {
    /**
     * Language detection scores syntax per line; a trailing comment is worth half a point to its
     * language. Appending the right number of them balances the scores so `detectLanguage` returns
     * `unknown` and the public entry point has to disambiguate the two parses itself.
     */
    const tieBreak = (source: string, lines: number) =>
      `${source}\n${(lines > 0 ? '// pad\n' : '# pad\n').repeat(Math.abs(lines))}`

    const solidityFn = (name: string) => `    /// @notice Solidity ${name}.
    /// @param a The solidity ${name} value.
    function ${name}(uint256 a) public {}`

    const vyperFn = (name: string) => `@external
def ${name}(a: uint256):
    """
    @notice Vyper ${name}.
    @param a The vyper ${name} value.
    """
    pass
`

    const source = (contractName: string, solidityFns: string[], vyperFns: string[]) => `contract ${contractName} {
${solidityFns.map(solidityFn).join('\n\n')}
}

${vyperFns.map(vyperFn).join('\n')}`

    const abiFor = (names: string[]) =>
      names.map(name => ({ type: 'function', name, inputs: [{ name: 'a', type: 'uint256' }], outputs: [] }))

    it('should take the only parse that yields a contract when the other finds none', () => {
      const abi = abiFor(['ping'])

      const solidityBody = tieBreak(`contract Foo {\n${solidityFn('ping')}\n}`, -32)
      const solidityOnly = ContractNetspecHelper.parseNetspec(solidityBody, 'Foo', abi)
      expect(solidityOnly[0].notice).to.equal('Solidity ping.')
      expect(solidityOnly[0].inputs[0].notice).to.equal('The solidity ping value.')

      const vyperOnly = ContractNetspecHelper.parseNetspec(tieBreak(vyperFn('ping'), 34), 'VyperContract', abi)
      expect(vyperOnly[0].notice).to.equal('Vyper ping.')
      expect(vyperOnly[0].inputs[0].notice).to.equal('The vyper ping value.')
    })

    it('should prefer the parse whose contract carries the requested name', () => {
      const ambiguous = tieBreak(source('Foo', ['ping'], ['ping']), 2)
      const abi = abiFor(['ping'])

      const solidityTarget = ContractNetspecHelper.parseNetspec(ambiguous, 'Foo', abi)
      expect(solidityTarget[0].notice).to.equal('Solidity ping.')
      expect(solidityTarget[0].inputs[0].notice).to.equal('The solidity ping value.')

      const vyperTarget = ContractNetspecHelper.parseNetspec(ambiguous, 'VyperContract', abi)
      expect(vyperTarget[0].notice).to.equal('Vyper ping.')
      expect(vyperTarget[0].inputs[0].notice).to.equal('The vyper ping value.')
    })

    it('should fall back to the parse with the greater ABI coverage when neither is named', () => {
      const solidityWins = tieBreak(source('Bar', ['ping', 'pong'], ['ping']), -10)
      const solidityResult = ContractNetspecHelper.parseNetspec(solidityWins, 'Missing', abiFor(['ping', 'pong']))
      expect(solidityResult[0].notice).to.equal('Solidity ping.')
      expect(solidityResult[1].notice).to.equal('Solidity pong.')

      const vyperWins = tieBreak(source('Bar', ['ping'], ['ping', 'pong']), 36)
      const vyperResult = ContractNetspecHelper.parseNetspec(vyperWins, 'Missing', abiFor(['ping', 'pong']))
      expect(vyperResult[0].notice).to.equal('Vyper ping.')
      expect(vyperResult[1].notice).to.equal('Vyper pong.')
    })

    it('should return the ABI unchanged when neither parse is named nor better covered', () => {
      const ambiguous = tieBreak(source('Bar', ['ping'], ['ping']), 2)
      const abi = abiFor(['ping'])

      const result = ContractNetspecHelper.parseNetspec(ambiguous, 'Missing', abi)

      expect(result).to.deep.equal(abi)
      expect(result[0].notice).to.be.undefined
    })
  })

  it('should enrich a Vyper contract end to end', () => {
    const vyperCode = `# @version 0.3.10

"""
@title Token Contract
@notice ERC20-like token implementation
"""

@external
def transfer(to: address, amount: uint256) -> bool:
    """
    @notice Transfer tokens
    @param to Recipient address
    @param amount Amount to transfer
    @return Success status
    """
    return True`

    const abi = [
      {
        name: 'transfer',
        type: 'function',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
      },
    ]

    const result = ContractNetspecHelper.parseNetspec(vyperCode, 'TokenContract', abi, '0.3.10')

    expect(result[0].notice).to.equal('Transfer tokens')
    expect(result[0].inputs[0].notice).to.equal('Recipient address')
    expect(result[0].inputs[1].notice).to.equal('Amount to transfer')
  })

  it('should not enrich Vyper internal functions', () => {
    const vyperCode = `# @version 0.3.10

@internal
def helper(x: uint256) -> uint256:
    """
    @notice Internal helper docs must be ignored.
    """
    return x

@external
def use(x: uint256):
    """
    @notice External function.
    """
    pass`

    const abi = [
      { name: 'helper', type: 'function', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] },
      { name: 'use', type: 'function', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] },
    ]

    const result = ContractNetspecHelper.parseNetspec(vyperCode, 'Token', abi, 'vyper:0.3.10')

    expect(result[0].notice).to.be.undefined
    expect(result[1].notice).to.equal('External function.')
  })
})
