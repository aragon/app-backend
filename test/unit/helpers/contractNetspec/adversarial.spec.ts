import * as ContractNetspecHelper from '@helpers/contractNetspec'
import * as parser from '@helpers/contractNetspec/parser'
import * as resolver from '@helpers/contractNetspec/resolver'
import { expect } from 'chai'

/**
 * Attribution-safety cases: for a transaction-decoding UI, documentation copied from the wrong
 * declaration is worse than no documentation. Every case here asserts that we do NOT invent or
 * misattribute text.
 */

const run = (source: string, contractName: string, abi: any[]) =>
  ContractNetspecHelper.parseNetspec(source, contractName, abi, '0.8.19')

describe('Helpers:ContractNetspec:Attribution', () => {
  it('must not take documentation from an unrelated internal library function', () => {
    const source = `
      contract Target {
        function execute(uint256 value) external {}
      }

      library Unrelated {
        /// @notice Burns the supplied amount.
        /// @param value The amount to burn.
        function execute(uint256 value) internal {}
      }
    `
    const abi = [{ type: 'function', name: 'execute', inputs: [{ name: 'value', type: 'uint256' }], outputs: [] }]
    const result = run(source, 'Target', abi)
    expect(result[0].notice, 'notice must not come from an unrelated internal function').to.be.undefined
    expect(result[0].inputs[0].notice).to.be.undefined
  })

  it('must not take documentation from an unrelated external contract with no relationship', () => {
    const source = `
      contract Target {
        function execute(uint256 value) external {}
      }

      contract Unrelated {
        /// @notice Burns the supplied amount.
        function execute(uint256 value) external {}
      }
    `
    const abi = [{ type: 'function', name: 'execute', inputs: [{ name: 'value', type: 'uint256' }], outputs: [] }]
    const result = run(source, 'Target', abi)
    expect(result[0].notice, 'unrelated contract must not donate documentation').to.be.undefined
  })

  it('must not attach a zero-arg declaration to a multi-arg ABI function', () => {
    const source = `
      contract Target {
        /// @notice Resets the contract to defaults.
        function initialize() external {}
      }
    `
    const abi = [
      {
        type: 'function',
        name: 'initialize',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'cap', type: 'uint256' },
        ],
        outputs: [],
      },
    ]
    const result = run(source, 'Target', abi)
    expect(result[0].notice, 'arity mismatch must not borrow an unrelated overload').to.be.undefined
  })

  it('must prefer the correctly-sized overload over a shorter same-name one', () => {
    const source = `
      contract Target {
        /// @notice No-arg form.
        function initialize() external {}

        /// @notice Two-arg form.
        /// @param owner The owner.
        /// @param cap The cap.
        function initialize(address owner, uint256 cap) external {}
      }
    `
    const abi = [
      {
        type: 'function',
        name: 'initialize',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'cap', type: 'uint256' },
        ],
        outputs: [],
      },
    ]
    const result = run(source, 'Target', abi)
    expect(result[0].notice).to.equal('Two-arg form.')
  })

  it('must not resolve a qualified base reference to an unrelated global contract', () => {
    const parsed = parser.parseBundle(
      {
        language: 'unknown',
        units: [
          { path: 'other/Base.sol', content: 'contract Base { function f() external {} }', order: 0 },
          { path: 'main/Child.sol', content: 'contract Child is MissingAlias.Base {}', order: 1 },
        ],
      },
      'solidity',
    )
    const child = parsed.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
    const line = resolver.linearizeContract(parsed, child).map(c => c.qualifiedName)
    expect(line, 'unresolvable qualified parent must not bind to an unrelated Base').to.deep.equal([
      'main/Child.sol:Child',
    ])
  })

  it('must not let an unrelated contract win target selection via inflated coverage', () => {
    const source = `
      contract Target {
        function transfer(address to, uint256 amount) external {}
      }

      contract Decoy {
        /// @notice Decoy documentation.
        function transfer() external {}
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
        outputs: [],
      },
    ]
    // Name does not match either contract, so selection falls back to ABI coverage.
    const result = run(source, 'NotPresent', abi)
    expect(result[0].notice, 'a zero-arg decoy must not win coverage for a two-arg ABI').to.be.undefined
  })

  it('preserves external function array types through canonicalization', () => {
    const parsed = parser.parseBundle(
      { language: 'unknown', units: [{ path: 'a.sol', content: 'contract T {}', order: 0 }] },
      'solidity',
    )
    expect(resolver.canonicalSourceType(parsed, 'function (uint256) external returns (bool) [ ]')).to.equal(
      'function[]',
    )
    expect(resolver.canonicalSourceType(parsed, 'function (uint256) external [ 3 ]')).to.equal('function[3]')
  })
})
