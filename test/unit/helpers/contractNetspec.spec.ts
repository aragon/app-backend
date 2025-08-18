import sinon, { SinonSandbox } from 'sinon'
import * as ContractNetspecHelper from '@helpers/contractNetspec'

import { expect } from 'chai'

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
      a: 'First parameter\nThis continues on next line',
      b: 'Second parameter\nAlso continues',
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
    expect(natspec.TestContract.details.test.tags.notice).to.equal('First line\nSecond line')
    expect(natspec.TestContract.details.test.tags.param).to.deep.equal({
      x: 'Parameter description\ncontinues here',
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
      'First line\nSecond line with asterisk\nThird line with asterisk',
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
})
