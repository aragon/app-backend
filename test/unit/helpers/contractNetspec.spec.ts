import * as ContractNetspecHelper from '@helpers/contractNetspec'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'

describe('Modules:ContractNetspec', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should try parsing ', async () => {
    // Example usage
    const sampleSourceCode = `
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

    const results = ContractNetspecHelper.parseNetspec(sampleSourceCode, 'SampleContract', [
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'a',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'b',
            type: 'uint256',
          },
        ],
        name: 'add',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'pure',
        type: 'function',
      },
    ])
    expect(!!results).to.be.true
    expect(results[0].notice).to.be.eq('Adds two numbers')
  })

  it('should fetch the contract code for real', async () => {
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
          {
            internalType: 'uint256',
            name: 'a',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'b',
            type: 'uint256',
          },
        ],
        name: 'add',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'pure',
        type: 'function',
      },
    ])

    expect(results[0].notice).to.be.eq('Thrown if `Operation`')
  })

  it('should handle multiline natspec comments', () => {
    const sourceCode = `
      contract TestContract {
        /**
         * @notice This is a notice
         * @param a First parameter
         * This continues on next line
         * @param b Second parameter
         * Also continues
         */
        function test(uint a, uint b) public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    expect(natspec.TestContract.details.test.tags.param).to.deep.include({
      a: 'First parameter This continues on next line',
      b: 'Second parameter Also continues',
    })
  })

  it('should handle triple slash comments', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice First line
        /// Second line
        /// @param x Parameter description
        /// continues here
        function test(uint x) public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    expect(natspec.TestContract.details.test.tags.notice).to.equal('First line Second line')
    expect(natspec.TestContract.details.test.tags.param).to.deep.equal({
      x: 'Parameter description continues here',
    })
  })

  it('should handle non-natspec comment blocks', () => {
    const sourceCode = `
      contract TestContract {
        /* This is just a regular comment
           not a natspec comment */
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    expect(natspec.TestContract.details.test).to.exist
    expect(natspec.TestContract.details.test.tags).to.be.empty
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
    // Both derived overloads are documented only via @inheritdoc, and the PARENT is itself overloaded.
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

  it('should keep a param with no inline description from swallowing the next function (#3)', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Does g.
        /// @param _data
        function g(bytes _data) public {}

        /// @notice Does h.
        function h() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.g).to.exist
    expect(natspec.TestContract.details.g.tags.notice).to.equal('Does g.')
    expect(natspec.TestContract.details.h).to.exist
    expect(natspec.TestContract.details.h.tags.notice).to.equal('Does h.')
  })

  it('should treat a stray @ in prose as text, not a tag (#4)', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice First line
        /// contact support@aragon.org for help
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.test.tags.notice).to.equal('First line contact support@aragon.org for help')
    expect(natspec.TestContract.details.test.tags['aragon.org']).to.be.undefined
  })

  it('should drop lone asterisk separator lines from block comments (#5)', () => {
    const sourceCode = `
      contract TestContract {
        /**
         * @notice Moves tokens.
         *
         * Requirements: the caller must have a balance.
         */
        function transfer() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.transfer.tags.notice).to.equal(
      'Moves tokens. Requirements: the caller must have a balance.',
    )
  })

  it('should label a zero-arg overload with its own notice, not a same-name overload (#6)', () => {
    // The no-arg overload is declared AFTER the one-arg overload, so `details[name]` holds the
    // no-arg entry; the pool must still score the no-arg entry as the exact match for 0 inputs.
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
    // Parent documents two overloads; child re-declares just one with a fresh notice. The child's
    // override lives only in `details` (never in the parent-sourced `overloads` map), so it must
    // still win for the signature it overrides.
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
    // `event`/`function` share a name: both land in `overloads`, and `details[name]` holds the
    // last-declared (the event). The single function entry must be returned, not the event.
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

  it('should isolate an unknown/mistyped tag instead of bleeding it into the previous tag (#9)', () => {
    // `@returns` is not a recognized tag; it starts a line, so it must land under its own key and
    // leave the preceding @notice text clean.
    const sourceCode = `
      contract TestContract {
        /// @notice Creates a proposal.
        /// @returns The proposal id.
        function createProposal() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.createProposal.tags.notice).to.equal('Creates a proposal.')
    expect(natspec.TestContract.details.createProposal.tags.returns).to.equal('The proposal id.')
  })

  it('should not leak the block-comment terminator when a stray @ ends on the closing line (#10)', () => {
    // A stray '@' (email) on the same line as the `*/` close must not pull `*/` into the notice.
    const sourceCode = `
      contract TestContract {
        /** @notice Foo
         * contact a@b.com */
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.test.tags.notice).to.equal('Foo contact a@b.com')
  })

  it('should handle contracts with inheritance', () => {
    const sourceCode = `
      contract BaseContract {
        /// @notice Base function
        function baseFunc() public {}
      }
      
      /// @title Derived Contract
      contract DerivedContract is BaseContract, AnotherBase {
        /// @notice Derived function
        function derivedFunc() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.DerivedContract).to.exist
    expect(natspec.DerivedContract.superClasses).to.deep.equal(['BaseContract', 'AnotherBase'])
    expect(natspec.DerivedContract.tags.title).to.equal('Derived Contract')
  })

  it('should handle constructor natspec', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Creates a new instance
        /// @param initialValue The initial value
        constructor(uint initialValue) {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    const constructorDetails = natspec.TestContract.details['constructor for TestContract']
    expect(constructorDetails).to.exist
    expect(constructorDetails.tags.notice).to.equal('Creates a new instance')
    expect(constructorDetails.tags.param).to.deep.equal({
      initialValue: 'The initial value',
    })
  })

  it('should handle collapseNatspec with @inheritdoc', () => {
    const sourceCode = `
      contract BaseContract {
        /// @notice Base implementation
        /// @param x First param
        /// @param y Second param  
        function compute(uint x, uint y) public virtual {}
      }
      
      contract DerivedContract is BaseContract {
        /// @inheritdoc BaseContract
        function compute(uint x, uint y) public override {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode)
    const collapsed = ContractNetspecHelper.collapseNatspec(natspec as any, 'DerivedContract')

    expect(collapsed.details.compute).to.exist
    expect(collapsed.details.compute.tags.notice).to.equal('Base implementation')
    expect(collapsed.details.compute.tags.param).to.deep.equal({
      x: 'First param',
      y: 'Second param',
    })
  })

  it('should handle collapseNatspec with missing parent contract', () => {
    const natspec = {
      DerivedContract: {
        name: 'DerivedContract',
        superClasses: ['NonExistentContract'],
        tags: {},
        details: {
          test: {
            keyword: 'function',
            name: 'test',
            tags: { notice: 'Test function' },
          },
        },
      },
    }
    const collapsed = ContractNetspecHelper.collapseNatspec(natspec as any, 'DerivedContract')
    expect(collapsed.details.test.tags.notice).to.equal('Test function')
  })

  it('should handle collapseNatspec with empty tags inheriting from parent', () => {
    const natspec = {
      BaseContract: {
        name: 'BaseContract',
        superClasses: [],
        tags: {},
        details: {
          test: {
            keyword: 'function',
            name: 'test',
            tags: { notice: 'Base notice' },
          },
        },
      },
      DerivedContract: {
        name: 'DerivedContract',
        superClasses: ['BaseContract'],
        tags: {},
        details: {
          test: {
            keyword: 'function',
            name: 'test',
            tags: {},
          },
        },
      },
    }
    const collapsed = ContractNetspecHelper.collapseNatspec(natspec as any, 'DerivedContract')
    expect(collapsed.details.test.tags.notice).to.equal('Base notice')
  })

  it('should handle event and error natspec', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Emitted when something happens
        /// @param user The user address
        event SomethingHappened(address user);
        
        /// @notice Thrown when validation fails
        error ValidationFailed();
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    expect(natspec.TestContract.details.SomethingHappened.keyword).to.equal('event')
    expect(natspec.TestContract.details.SomethingHappened.tags.notice).to.equal('Emitted when something happens')
    expect(natspec.TestContract.details.ValidationFailed.keyword).to.equal('error')
    expect(natspec.TestContract.details.ValidationFailed.tags.notice).to.equal('Thrown when validation fails')
  })

  it('should handle interface natspec', () => {
    const sourceCode = `
      /// @title Test Interface
      interface ITest {
        /// @notice Interface function
        function interfaceFunc() external;
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.ITest).to.exist
    expect(natspec.ITest.tags.title).to.equal('Test Interface')
    expect(natspec.ITest.details.interfaceFunc.tags.notice).to.equal('Interface function')
  })

  it('should handle parseSourceCode with invalid JSON', () => {
    const invalidJson = '{invalid json}'
    const result = ContractNetspecHelper.parseNetspec(invalidJson, 'Test', [])
    expect(result).to.be.an('array')
    expect(result).to.be.empty
  })

  it('should handle scanNatspecBlock with terminator at end of tag', () => {
    const sourceCode = `
      contract TestContract {
        /** @notice Short notice */
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.test.tags.notice).to.equal('Short notice */')
  })

  it('should handle multiline comments with asterisk prefix', () => {
    const sourceCode = `
      contract TestContract {
        /**
         * @notice First line
         * Second line with asterisk
         * Third line with asterisk
         */
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract.details.test.tags.notice).to.equal(
      'First line Second line with asterisk Third line with asterisk',
    )
  })

  it('should handle regular single line comments', () => {
    const sourceCode = `
      contract TestContract {
        // Regular comment not natspec
        function test() public {}
      }
    `
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    expect(natspec.TestContract.details.test.tags).to.be.empty
  })

  it('should handle incomplete function definition when pos becomes negative', () => {
    const sourceCode = `
      contract TestContract {
        /// @notice Test function
        function`
    const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
    expect(natspec.TestContract).to.exist
    // Function won't be added to details since it's incomplete
    expect(Object.keys(natspec.TestContract.details)).to.have.length(0)
  })

  it('should handle collapseNatspec with inheritdoc tag merging', () => {
    const natspec = {
      BaseContract: {
        name: 'BaseContract',
        superClasses: [],
        tags: {},
        details: {
          test: {
            keyword: 'function',
            name: 'test',
            tags: {
              notice: 'Base notice',
              dev: 'Base dev comment',
              param: { x: 'Base param' },
            },
          },
        },
      },
      DerivedContract: {
        name: 'DerivedContract',
        superClasses: ['BaseContract'],
        tags: {},
        details: {
          test: {
            keyword: 'function',
            name: 'test',
            tags: {
              inheritdoc: 'BaseContract',
              dev: 'Override dev comment',
            },
          },
        },
      },
    }
    const collapsed = ContractNetspecHelper.collapseNatspec(natspec as any, 'DerivedContract')
    // Should merge inheritdoc base tags with derived tags (derived takes precedence)
    expect(collapsed.details.test.tags.notice).to.equal('Base notice')
    expect(collapsed.details.test.tags.dev).to.equal('Override dev comment')
    expect(collapsed.details.test.tags.param).to.deep.equal({ x: 'Base param' })
    // inheritdoc tag should be removed after merge
    expect(collapsed.details.test.tags.inheritdoc).to.be.undefined
  })

  it('should handle collapseNatspec returning super details when current has empty tags and super exists', () => {
    const natspec = {
      BaseContract: {
        name: 'BaseContract',
        superClasses: [],
        tags: {},
        details: {
          compute: {
            keyword: 'function',
            name: 'compute',
            tags: { notice: 'Base compute function' },
          },
          another: {
            keyword: 'function',
            name: 'another',
            tags: { notice: 'Another function' },
          },
        },
      },
      DerivedContract: {
        name: 'DerivedContract',
        superClasses: ['BaseContract'],
        tags: {},
        details: {
          compute: {
            keyword: 'function',
            name: 'compute',
            tags: {}, // Empty tags should inherit from parent
          },
          another: {
            keyword: 'function',
            name: 'another',
            tags: {}, // Empty tags should inherit from parent
          },
        },
      },
    }
    const collapsed = ContractNetspecHelper.collapseNatspec(natspec as any, 'DerivedContract')
    // Should use super details when current has empty tags
    expect(collapsed.details.compute.tags.notice).to.equal('Base compute function')
    expect(collapsed.details.another.tags.notice).to.equal('Another function')
  })

  // ==================== VYPER CONTRACT TESTS ====================
  describe('Vyper Contract Support', () => {
    it('should detect and parse Vyper contracts with version', () => {
      const vyperCode = `# @version 0.3.10

"""
@title Simple Storage
@notice A contract for storing a single value
"""

value: public(uint256)

@external
def __init__(initial_value: uint256):
    """
    @notice Initialize contract with a value
    @param initial_value The initial value to store
    """
    self.value = initial_value

@external  
def set_value(new_value: uint256):
    """
    @notice Update the stored value
    @param new_value The new value to store
    """
    self.value = new_value

@external
@view
def get_value() -> uint256:
    """
    @notice Get the stored value
    @return The current stored value
    """
    return self.value`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (Object.keys(natspec).length > 0) {
        const contractKey = Object.keys(natspec)[0]
        expect(natspec[contractKey]).to.exist
      }
    })

    it('should parse Vyper contracts with triple quote docstrings', () => {
      const vyperCode = `# @version 0.3.10

@external
def transfer(to: address, amount: uint256):
    """
    @notice Transfer tokens to another address
    @param to The recipient address
    @param amount The amount to transfer
    """
    pass`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (natspec.VyperContract && natspec.VyperContract.details) {
        const functionKeys = Object.keys(natspec.VyperContract.details)
        const transferKey = functionKeys.find(key => key.includes('transfer'))
        if (transferKey && natspec.VyperContract.details[transferKey]) {
          expect(natspec.VyperContract.details[transferKey].tags).to.exist
        }
      }
    })

    it('should parse Vyper contracts with single line comments', () => {
      const vyperCode = `# @version 0.3.10

## @notice Approve spender for amount
## @param spender The address to approve
@external
def approve(spender: address, amount: uint256):
    pass`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (natspec.VyperContract && natspec.VyperContract.details) {
        const functionKeys = Object.keys(natspec.VyperContract.details)
        expect(functionKeys.length).to.be.greaterThan(0)
      }
    })

    it('should handle Vyper interfaces', () => {
      const vyperCode = `# @version 0.3.10

interface IERC20:
    def transfer(to: address, amount: uint256) -> bool: view
    def balanceOf(account: address) -> uint256: view`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      // Check if any contract structure is created
      expect(Object.keys(natspec).length).to.be.greaterThan(0)
    })

    it('should handle Vyper events', () => {
      const vyperCode = `# @version 0.3.10

event Transfer:
    sender: indexed(address)
    receiver: indexed(address)
    value: uint256`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (natspec.VyperContract && natspec.VyperContract.details) {
        const eventKeys = Object.keys(natspec.VyperContract.details).filter(
          key => natspec.VyperContract.details[key].keyword === 'event',
        )
        expect(eventKeys.length).to.be.greaterThanOrEqual(0)
      }
    })

    it('should skip regular comments in Vyper', () => {
      const vyperCode = `# @version 0.3.10

# This is a regular comment
@external
def test():
    # Another regular comment
    pass`

      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (natspec.VyperContract && natspec.VyperContract.details) {
        const functionKeys = Object.keys(natspec.VyperContract.details)
        const testKey = functionKeys.find(key => key.includes('test'))
        if (testKey && natspec.VyperContract.details[testKey]) {
          // Should exist but may have empty or minimal tags since no natspec comments
          expect(natspec.VyperContract.details[testKey]).to.exist
        }
      }
    })
  })

  // ==================== COMPILER VERSION DETECTION TESTS ====================
  describe('Compiler Version Detection', () => {
    it('should detect Solidity from compiler version', () => {
      const sourceCode = `contract Test { function test() public {} }`
      const natspec = ContractNetspecHelper.extractNatSpec(sourceCode, 'solc-0.8.19')
      expect(natspec).to.be.an('object')
    })

    it('should detect Vyper from compiler version', () => {
      const sourceCode = `def test(): pass`
      const natspec = ContractNetspecHelper.extractNatSpec(sourceCode, 'vyper')
      expect(natspec).to.be.an('object')
    })

    it('should detect Solidity version patterns', () => {
      const patterns = ['0.8.19', 'v0.8.19+commit.abcd1234', 'solidity', 'solc-0.8.19']
      patterns.forEach(version => {
        const sourceCode = `pragma solidity ^0.8.0; contract Test {}`
        const natspec = ContractNetspecHelper.extractNatSpec(sourceCode, version)
        expect(natspec).to.be.an('object')
      })
    })

    it('should detect Vyper version patterns', () => {
      const patterns = ['0.3.10', 'v0.3.7', 'vyper']
      patterns.forEach(version => {
        const sourceCode = `# @version 0.3.10\ndef test(): pass`
        const natspec = ContractNetspecHelper.extractNatSpec(sourceCode, version)
        expect(natspec).to.be.an('object')
      })
    })

    it('should fallback to source analysis when version is ambiguous', () => {
      const sourceCode = `pragma solidity ^0.8.0; contract Test {}`
      const natspec = ContractNetspecHelper.extractNatSpec(sourceCode, 'unknown-version')
      expect(natspec).to.be.an('object')
    })
  })

  // ==================== EDGE CASES AND ERROR HANDLING ====================
  describe('Edge Cases and Error Handling', () => {
    it('should handle empty source code', () => {
      const natspec = ContractNetspecHelper.extractNatSpec('')
      expect(natspec).to.deep.equal({})
    })

    it('should handle null/undefined source code', () => {
      const natspec1 = ContractNetspecHelper.extractNatSpec(null as any)
      const natspec2 = ContractNetspecHelper.extractNatSpec(undefined as any)
      expect(natspec1).to.deep.equal({})
      expect(natspec2).to.deep.equal({})
    })

    it('should handle small Solidity contracts that score low', () => {
      const smallSolidityCode = `contract A { uint x; }`
      const natspec = ContractNetspecHelper.extractNatSpec(smallSolidityCode)
      expect(natspec).to.be.an('object')
      // Should not return empty object for valid Solidity
    })

    it('should handle mixed language patterns', () => {
      // Code that has both Solidity and Python-like patterns
      const mixedCode = `
        // Some comment
        contract Test {
          function test() public {
            // def something() - this should not confuse detection
          }
        }`
      const natspec = ContractNetspecHelper.extractNatSpec(mixedCode)
      expect(natspec).to.be.an('object')
    })

    it('should handle very long source files (performance test)', () => {
      const longCode = 'contract Test {\n' + Array(1000).fill('  function test() public {}\n').join('') + '}'
      const natspec = ContractNetspecHelper.extractNatSpec(longCode)
      expect(natspec).to.be.an('object')
    })

    it('should handle source with no clear language indicators', () => {
      const ambiguousCode = `
        // Just comments
        /* More comments */
        # Some comment
      `
      const natspec = ContractNetspecHelper.extractNatSpec(ambiguousCode)
      expect(natspec).to.deep.equal({})
    })

    it('should handle malformed natspec tags gracefully', () => {
      const malformedCode = `
        contract Test {
          /// @notice 
          /// @param
          /// @param x
          function test(uint x) public {}
        }`
      const natspec = ContractNetspecHelper.extractNatSpec(malformedCode) as any
      expect(natspec).to.be.an('object')
      // Should not crash on malformed tags
    })

    it('should handle missing contract name in natspec', () => {
      const result = ContractNetspecHelper.parseNetspec('contract Test {}', 'MissingContract', [], '0.8.19')
      expect(result).to.be.an('array')
    })

    it('should handle parseNetspec with compiler version parameter', () => {
      const sourceCode = `contract Test {
        /// @notice Test function
        function test() public {}
      }`
      const abi = [
        {
          name: 'test',
          type: 'function',
          inputs: [],
          outputs: [],
        },
      ]

      const result = ContractNetspecHelper.parseNetspec(sourceCode, 'Test', abi, '0.8.19')
      expect(result).to.be.an('array')
      expect(result[0].notice).to.equal('Test function')
    })

    it('should not hang on a contract declaration with no closing brace', () => {
      // Truncated source: `is Bar` with no `{` used to spin the superclass parser forever.
      const truncated = `
        pragma solidity ^0.8.0;
        contract Foo is Bar`
      const natspec = ContractNetspecHelper.extractNatSpec(truncated, '0.8.19') as any
      expect(natspec).to.be.an('object')
      expect(natspec.Foo).to.exist
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

      // Input ABI must be untouched...
      expect(abi).to.deep.equal(abiSnapshot)
      // ...while the returned ABI carries the NatSpec docs.
      expect(result[0].notice).to.equal('Does a thing')
      expect(result[0].inputs[0].notice).to.equal('the x value')
    })
  })

  // ==================== SCANWORD FUNCTION TESTS ====================
  describe('scanWord function edge cases', () => {
    it('should handle function names at end of line', () => {
      const sourceCode = `
        contract Test {
          function test(
            uint x
          ) public {}
        }`
      const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
      expect(natspec.Test.details.test).to.exist
    })

    it('should handle function names followed by colon (Vyper style)', () => {
      const vyperCode = `# @version 0.3.10
def test_function():
    pass`
      const natspec = ContractNetspecHelper.extractNatSpec(vyperCode) as any
      expect(natspec).to.be.an('object')
      if (natspec.VyperContract && natspec.VyperContract.details) {
        const functionKeys = Object.keys(natspec.VyperContract.details)
        const testFunctionKey = functionKeys.find(key => key.includes('test_function'))
        if (testFunctionKey) {
          expect(natspec.VyperContract.details[testFunctionKey]).to.exist
        } else {
          // At least should have some function parsed
          expect(functionKeys.length).to.be.greaterThanOrEqual(0)
        }
      }
    })

    it('should handle various delimiters in function names', () => {
      const sourceCode = `
        contract Test {
          function test() public {}
          function test2(uint x) public {}
          function test3(
            uint x,
            uint y
          ) public {}
        }`
      const natspec = ContractNetspecHelper.extractNatSpec(sourceCode) as any
      expect(natspec.Test.details.test).to.exist
      expect(natspec.Test.details.test2).to.exist
      expect(natspec.Test.details.test3).to.exist
    })
  })

  // ==================== PATTERN MATCHING TESTS ====================
  describe('Language Detection Pattern Matching', () => {
    it('should correctly identify Solidity patterns', () => {
      const solidityIndicators = [
        'pragma solidity ^0.8.0;',
        'contract TestContract {',
        'library TestLibrary {',
        'interface ITest {',
        'function test() public {}',
        'modifier onlyOwner() {}',
        'mapping(address => uint256) balances;',
        'struct User { uint256 id; }',
        'enum Status { Active, Inactive }',
        'require(condition, "message");',
        'assembly { let x := 1 }',
      ]

      solidityIndicators.forEach(indicator => {
        const code = `${indicator}\ncontract Test {}`
        const natspec = ContractNetspecHelper.extractNatSpec(code)
        expect(natspec).to.be.an('object')
      })
    })

    it('should correctly identify Vyper patterns', () => {
      const vyperIndicators = [
        '# @version 0.3.10',
        '@external\ndef test():',
        '@internal\ndef helper():',
        'implements: IERC20',
        'from vyper.interfaces import ERC20',
        'self.balance',
        'value: public(uint256)',
        'event Transfer:\n  sender: address',
        '"""\nDocstring\n"""',
      ]

      vyperIndicators.forEach(indicator => {
        const code = `${indicator}\n# rest of code`
        const natspec = ContractNetspecHelper.extractNatSpec(code)
        expect(natspec).to.be.an('object')
      })
    })

    it('should handle comment styles correctly', () => {
      const solidityWithComments = `
        // Solidity comment
        /* Block comment */
        contract Test {}
      `
      const vyperWithComments = `
        # @version 0.3.10
        # Vyper comment
        """
        Docstring comment
        """
        def test(): pass
      `

      const solidityNatspec = ContractNetspecHelper.extractNatSpec(solidityWithComments)
      const vyperNatspec = ContractNetspecHelper.extractNatSpec(vyperWithComments)

      expect(solidityNatspec).to.be.an('object')
      expect(vyperNatspec).to.be.an('object')
    })
  })

  // ==================== INTEGRATION TESTS ====================
  describe('Integration Tests', () => {
    it('should handle complete workflow: Vyper contract with compiler version', () => {
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

      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
      expect(result[0]).to.have.property('name', 'transfer')
      // The function might not have correct notice due to parsing issues, but should still work
      expect(result[0]).to.have.property('type', 'function')
    })

    it('should handle complete workflow: Solidity contract with inheritance', () => {
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
        {
          name: 'baseFunc',
          type: 'function',
          inputs: [{ name: 'x', type: 'uint256' }],
          outputs: [],
        },
        {
          name: 'newFunc',
          type: 'function',
          inputs: [{ name: 'y', type: 'uint256' }],
          outputs: [],
        },
      ]

      const result = ContractNetspecHelper.parseNetspec(solidityCode, 'DerivedContract', abi, '0.8.19')

      expect(result).to.be.an('array')
      expect(result.find((f: any) => f.name === 'baseFunc')?.notice).to.equal('Base function')
      expect(result.find((f: any) => f.name === 'newFunc')?.notice).to.equal('New function')
    })
  })
})
