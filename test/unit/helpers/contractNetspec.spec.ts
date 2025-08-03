import { expect } from 'chai'
import {
  scanNatspecBlock,
  extractNatSpec,
  collapseNatspec,
  parseNetspec,
  NatspecContract,
  NatspecDetails,
} from '@helpers/contractNetspec'

describe('Helpers: ContractNetspec', () => {
  describe('scanNatspecBlock', () => {
    it('should scan simple natspec comment', () => {
      const source = '/// @notice This is a test function'
      const [pos, details] = scanNatspecBlock(source, 4, '')

      expect(details.tags.notice).to.equal('This is a test function')
      expect(pos).to.be.greaterThan(4)
    })

    it('should scan multiline natspec comment', () => {
      const source = `* @notice This is a test function
      * that spans multiple lines
      * @param value The input value
      * @param name The name parameter
      */`
      const [pos, details] = scanNatspecBlock(source, 2, '*/')

      expect(details.tags.notice).to.equal('This is a test function\nthat spans multiple lines')
      expect((details.tags.param as Record<string, string>).value).to.equal('The input value')
      expect((details.tags.param as Record<string, string>).name).to.equal('The name parameter')
    })

    it('should handle single line comments with params', () => {
      const source = '/// @param amount The amount to transfer'
      const [pos, details] = scanNatspecBlock(source, 4, '')

      expect((details.tags.param as Record<string, string>).amount).to.equal('The amount to transfer')
    })

    it('should handle dev tags', () => {
      const source = '/// @dev Internal function for calculations'
      const [pos, details] = scanNatspecBlock(source, 4, '')

      expect(details.tags.dev).to.equal('Internal function for calculations')
    })

    it('should handle return tags', () => {
      const source = '/// @return The calculated result'
      const [pos, details] = scanNatspecBlock(source, 4, '')

      expect(details.tags.return).to.equal('The calculated result')
    })
  })

  describe('extractNatSpec', () => {
    it('should extract natspec from contract with functions', () => {
      const source = `
      /// @notice Main contract for testing
      contract TestContract {
        /// @notice Transfers tokens
        /// @param to The recipient address
        /// @param amount The amount to transfer
        function transfer(address to, uint256 amount) public {}
        
        /// @notice Gets the balance
        /// @return The balance amount
        function getBalance() public view returns (uint256) {}
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.TestContract).to.exist
      expect(natspec.TestContract.name).to.equal('TestContract')
      expect(natspec.TestContract.tags.notice).to.equal('Main contract for testing')
      expect(natspec.TestContract.details.transfer).to.exist
      expect(natspec.TestContract.details.transfer.tags.notice).to.equal('Transfers tokens')
      expect((natspec.TestContract.details.transfer.tags.param as Record<string, string>).to).to.equal(
        'The recipient address',
      )
      expect((natspec.TestContract.details.transfer.tags.param as Record<string, string>).amount).to.equal(
        'The amount to transfer',
      )
      expect(natspec.TestContract.details.getBalance.tags.return).to.equal('The balance amount')
    })

    it('should handle interfaces', () => {
      const source = `
      /// @notice Interface for ERC20 tokens
      interface IERC20 {
        /// @notice Transfer function
        function transfer(address to, uint256 amount) external returns (bool);
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.IERC20).to.exist
      expect(natspec.IERC20.name).to.equal('IERC20')
      expect(natspec.IERC20.tags.notice).to.equal('Interface for ERC20 tokens')
    })

    it('should handle constructors', () => {
      const source = `
      contract TestContract {
        /// @notice Initializes the contract
        /// @param initialValue The initial value
        constructor(uint256 initialValue) {}
      }
      `

      const natspec = extractNatSpec(source) as any

      const constructorKey = 'constructor for TestContract'
      expect(natspec.TestContract.details[constructorKey]).to.exist
      expect(natspec.TestContract.details[constructorKey].tags.notice).to.equal('Initializes the contract')
    })

    it('should handle events', () => {
      const source = `
      contract TestContract {
        /// @notice Emitted when transfer occurs
        /// @param from The sender address
        /// @param to The recipient address
        event Transfer(address from, address to);
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.TestContract.details.Transfer).to.exist
      expect(natspec.TestContract.details.Transfer.keyword).to.equal('event')
      expect(natspec.TestContract.details.Transfer.tags.notice).to.equal('Emitted when transfer occurs')
    })

    it('should handle errors', () => {
      const source = `
      contract TestContract {
        /// @notice Thrown when insufficient balance
        error InsufficientBalance();
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.TestContract.details.InsufficientBalance).to.exist
      expect(natspec.TestContract.details.InsufficientBalance.keyword).to.equal('error')
    })

    it('should handle inheritance', () => {
      const source = `
      contract BaseContract {}
      
      /// @notice Child contract
      contract TestContract is BaseContract, IERC20 {
        function test() public {}
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.TestContract.superClasses).to.deep.equal(['BaseContract', 'IERC20'])
    })

    it('should handle multiline block comments', () => {
      const source = `
      contract TestContract {
        /**
         * @notice Complex function with multiple params
         * @dev This is a developer note
         * that spans multiple lines
         * @param a First parameter
         * @param b Second parameter
         * @return The sum of a and b
         */
        function add(uint a, uint b) public returns (uint) {}
      }
      `

      const natspec = extractNatSpec(source) as any

      expect(natspec.TestContract.details.add.tags.notice).to.equal('Complex function with multiple params')
      expect(natspec.TestContract.details.add.tags.dev).to.equal('This is a developer note\nthat spans multiple lines')
      expect((natspec.TestContract.details.add.tags.param as Record<string, string>).a).to.equal('First parameter')
      expect((natspec.TestContract.details.add.tags.param as Record<string, string>).b).to.equal('Second parameter')
      expect(natspec.TestContract.details.add.tags.return).to.equal('The sum of a and b')
    })
  })

  describe('collapseNatspec', () => {
    it('should collapse inheritance with inheritdoc', () => {
      const natspec: Record<string, NatspecContract> = {
        BaseContract: {
          name: 'BaseContract',
          superClasses: [],
          tags: {},
          details: {
            transfer: {
              keyword: 'function',
              name: 'transfer',
              tags: {
                notice: 'Base transfer function',
                param: {
                  to: 'Recipient address',
                  amount: 'Transfer amount',
                },
              },
            },
          },
        },
        TestContract: {
          name: 'TestContract',
          superClasses: ['BaseContract'],
          tags: {},
          details: {
            transfer: {
              keyword: 'function',
              name: 'transfer',
              tags: {
                inheritdoc: 'BaseContract',
              },
            },
          },
        },
      }

      const collapsed = collapseNatspec(natspec, 'TestContract')

      expect(collapsed.details.transfer.tags.notice).to.equal('Base transfer function')
      expect((collapsed.details.transfer.tags.param as Record<string, string>).to).to.equal('Recipient address')
    })

    it('should inherit functions from superclasses', () => {
      const natspec: Record<string, NatspecContract> = {
        BaseContract: {
          name: 'BaseContract',
          superClasses: [],
          tags: {},
          details: {
            baseFunction: {
              keyword: 'function',
              name: 'baseFunction',
              tags: {
                notice: 'Function from base',
              },
            },
          },
        },
        TestContract: {
          name: 'TestContract',
          superClasses: ['BaseContract'],
          tags: {},
          details: {
            childFunction: {
              keyword: 'function',
              name: 'childFunction',
              tags: {
                notice: 'Function from child',
              },
            },
          },
        },
      }

      const collapsed = collapseNatspec(natspec, 'TestContract')

      expect(collapsed.details.baseFunction).to.exist
      expect(collapsed.details.baseFunction.tags.notice).to.equal('Function from base')
      expect(collapsed.details.childFunction.tags.notice).to.equal('Function from child')
    })

    it('should handle missing superclass gracefully', () => {
      const natspec: Record<string, NatspecContract> = {
        TestContract: {
          name: 'TestContract',
          superClasses: ['NonExistentContract'],
          tags: {},
          details: {},
        },
      }

      const collapsed = collapseNatspec(natspec, 'TestContract')

      expect(collapsed.name).to.equal('TestContract')
      expect(collapsed.superClasses).to.deep.equal(['NonExistentContract'])
    })
  })

  describe('parseNetspec', () => {
    it('should parse and enrich ABI with natspec', () => {
      const sourceCode = `
      contract TestContract {
        /// @notice Transfers tokens to recipient
        /// @param to The recipient address
        /// @param amount The amount to transfer
        function transfer(address to, uint256 amount) public returns (bool) {}
      }
      `

      const abi = [
        {
          type: 'function',
          name: 'transfer',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ]

      const enrichedABI = parseNetspec(sourceCode, 'TestContract', abi)

      expect(enrichedABI[0].notice).to.equal('Transfers tokens to recipient')
      expect(enrichedABI[0].inputs[0].notice).to.equal('The recipient address')
      expect(enrichedABI[0].inputs[1].notice).to.equal('The amount to transfer')
    })

    it('should handle JSON source format', () => {
      const sourceCode = `{
        "sources": {
          "Contract.sol": {
            "content": "contract TestContract { /// @notice Test function\\nfunction test() public {} }"
          }
        }
      }`

      const abi = [
        {
          type: 'function',
          name: 'test',
          inputs: [],
        },
      ]

      const enrichedABI = parseNetspec(sourceCode, 'TestContract', abi)

      expect(enrichedABI[0].notice).to.equal('Test function')
    })

    it('should handle malformed JSON gracefully', () => {
      const sourceCode = '{ invalid json'

      const abi = [
        {
          type: 'function',
          name: 'test',
          inputs: [],
        },
      ]

      // Should not throw
      const enrichedABI = parseNetspec(sourceCode, 'TestContract', abi)

      expect(enrichedABI[0].notice).to.be.undefined
    })

    it('should skip non-function ABI entries', () => {
      const sourceCode = `
      contract TestContract {
        /// @notice Transfer event
        event Transfer(address to, uint256 amount);
      }
      `

      const abi = [
        {
          type: 'event',
          name: 'Transfer',
          inputs: [],
        },
      ]

      const enrichedABI = parseNetspec(sourceCode, 'TestContract', abi)

      expect(enrichedABI[0].notice).to.be.undefined
    })

    it('should handle missing function in natspec', () => {
      const sourceCode = `
      contract TestContract {
        /// @notice Different function
        function different() public {}
      }
      `

      const abi = [
        {
          type: 'function',
          name: 'notFound',
          inputs: [],
        },
      ]

      const enrichedABI = parseNetspec(sourceCode, 'TestContract', abi)

      expect(enrichedABI[0].notice).to.be.undefined
    })
  })
})
