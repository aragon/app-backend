import * as ContractNetspecHelper from '@helpers/contractNetspec'
import * as parser from '@helpers/contractNetspec/parser'
import * as resolver from '@helpers/contractNetspec/resolver'
import { expect } from 'chai'

/**
 * Reference-resolution and matching internals: import paths, module lookup, candidate arity and the
 * fallbacks that decide when evidence is too weak to attribute documentation.
 */

const bundleOf = (files: Record<string, string>): parser.SourceBundle => ({
  language: 'unknown',
  units: Object.entries(files).map(([path, content], order) => ({ path, content, order })),
})
const parseSol = (files: Record<string, string>) => parser.parseBundle(bundleOf(files), 'solidity')
const parseVy = (files: Record<string, string>) => parser.parseBundle(bundleOf(files), 'vyper')
const fnAbi = (name: string, types: string[] = []) => [
  { type: 'function', name, inputs: types.map((t, i) => ({ name: `p${i}`, type: t })), outputs: [] },
]
const run = (source: unknown, name: string, abi: any[], compiler = '0.8.19') =>
  ContractNetspecHelper.parseNetspec(source, name, abi, compiler)

describe('Helpers:ContractNetspec:Resolution', () => {
  describe('contract references', () => {
    it('should reject an empty reference name', () => {
      const parsed = parseSol({ 'a.sol': 'contract A {}' })
      expect(resolver.resolveContractReference(parsed, 'a.sol', '')).to.be.undefined
    })

    it('should resolve a bare import path recorded verbatim', () => {
      const parsed = parseSol({
        'Base.sol': 'contract Base { /// @notice Bare path.\n function f() public {} }',
        'Child.sol': 'import "Base.sol";\ncontract Child is Base {}',
      })
      const child = parsed.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, child).map(c => c.name)).to.deep.equal(['Child', 'Base'])
    })

    it('should give up on a relative path that escapes the tree', () => {
      const parsed = parseSol({
        'Base.sol': 'contract Base {}',
        'Child.sol': 'import "../../../../Base.sol";\ncontract Child is Nowhere {}',
      })
      const child = parsed.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, child).map(c => c.name)).to.deep.equal(['Child'])
    })

    it('should skip unit aliases that do not match the qualifier', () => {
      const parsed = parseSol({
        'types/T.sol': 'contract Inner {}',
        'main.sol': 'import * as Other from "./types/T.sol";\ncontract C is Missing.Inner {}',
      })
      const c = parsed.contracts.find(x => x.name === 'C') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, c).map(x => x.name)).to.deep.equal(['C'])
    })

    it('should fall back to a unique global match for an imported symbol', () => {
      const parsed = parseSol({
        'elsewhere/Base.sol': 'contract Base { /// @notice Global fallback.\n function f() public {} }',
        'main.sol': 'import { Base } from "./missing-file.sol";\ncontract Child is Base {}',
      })
      const child = parsed.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, child).map(c => c.name)).to.deep.equal(['Child', 'Base'])
    })

    it('should stay unresolved when a simple name is ambiguous', () => {
      const parsed = parseSol({
        'a.sol': 'contract Base { function f() public {} }',
        'b.sol': 'contract Base { function g() public {} }',
        'c.sol': 'contract Child is Base {}',
      })
      const child = parsed.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, child).map(c => c.name)).to.deep.equal(['Child'])
    })
  })

  describe('type scope lookups', () => {
    it('should skip symbol aliases whose import path cannot be resolved', () => {
      const parsed = parseSol({ 'main.sol': 'import { Types as T } from "./gone.sol";\ncontract C {}' })
      expect(resolver.canonicalSourceType(parsed, 'T.Point', { unit: 'main.sol' })).to.be.undefined
    })

    it('should stop recursing on absurd nesting depth', () => {
      const structs = ['struct S0 { uint256 a; }']
      for (let i = 1; i < 40; i++) structs.push(`struct S${i} { S${i - 1} inner; }`)
      const parsed = parseSol({ 'a.sol': `contract T { ${structs.join('\n')} }` })
      expect(resolver.canonicalSourceType(parsed, 'S39', { unit: 'a.sol' })).to.be.undefined
    })

    it('should refuse a vyper struct containing an unknown field type', () => {
      const parsed = parseVy({ 'a.vy': 'struct Bad:\n    x: NotAType\n\n@external\ndef f():\n    pass' })
      expect(resolver.canonicalSourceType(parsed, 'Bad', { unit: 'a.vy' })).to.be.undefined
    })
  })

  describe('vyper arity variants and exports', () => {
    it('should reject an arity larger than the declaration', () => {
      const source = `@external
def f(a: uint256):
    """
    @notice One arg.
    """
    pass`
      const abi = fnAbi('f', ['uint256', 'uint256'])
      expect(ContractNetspecHelper.parseNetspec(source, 'a', abi, 'vyper')[0]).to.equal(abi[0])
    })

    it('should reject an arity below the required parameter count', () => {
      const source = `@external
def f(a: uint256, b: uint256 = 1):
    """
    @notice Needs one.
    """
    pass`
      const abi = fnAbi('f', [])
      expect(ContractNetspecHelper.parseNetspec(source, 'a', abi, 'vyper')[0]).to.equal(abi[0])
    })

    it('should ignore export entries whose module cannot be found', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: { 'main.vy': { content: 'import ghost\n\nexports: ghost.missing' } },
      })
      const abi = fnAbi('missing')
      expect(ContractNetspecHelper.parseNetspec(source, 'main', abi, 'vyper')[0]).to.equal(abi[0])
    })

    it('should ignore an export that points back at the target module', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': {
            content:
              'import main\n\nexports: main.f\n\n@external\ndef f():\n    """\n    @notice Local.\n    """\n    pass',
          },
        },
      })
      expect(ContractNetspecHelper.parseNetspec(source, 'main', fnAbi('f'), 'vyper')[0].notice).to.equal('Local.')
    })

    it('should pick a vyper module by coverage when names do not match', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'one.vy': { content: '@external\ndef alpha():\n    """\n    @notice Alpha.\n    """\n    pass' },
          'two.vy': { content: '@external\ndef beta():\n    """\n    @notice Beta.\n    """\n    pass' },
        },
      })
      expect(ContractNetspecHelper.parseNetspec(source, 'nomatch', fnAbi('beta'), 'vyper')[0].notice).to.equal('Beta.')
    })
  })

  describe('target selection', () => {
    it('should refuse to guess when duplicates tie with zero coverage', () => {
      const files = {
        'a.sol': 'contract Alpha { function x() public {} }',
        'b.sol': 'contract Beta { function y() public {} }',
      }
      const parsed = parseSol(files)
      expect(resolver.resolveTargetContract(parsed, bundleOf(files), 'Missing', fnAbi('zzz'))).to.be.undefined
    })

    it('should ignore malformed ABI entries when scoring coverage', () => {
      const parsed = parseSol({ 'a.sol': 'contract T { /// @notice hi\n function f() public {} }' })
      const target = parsed.contracts[0]
      const abi: any[] = [null, { type: 'event', name: 'f' }, { type: 'function', name: 7 }, ...fnAbi('f')]
      expect(resolver.coverageScore(parsed, target, abi)).to.be.greaterThan(0)
    })

    it('should prefer an exact compilation target over a same-named contract elsewhere', () => {
      const source = JSON.stringify({
        language: 'Solidity',
        sources: {
          'wrong.sol': { content: 'contract T { /// @notice Wrong one.\n function f() public {} }' },
          'right.sol': { content: 'contract T { /// @notice Right one.\n function f() public {} }' },
        },
        settings: { compilationTarget: { 'right.sol': 'T' } },
      })
      expect(ContractNetspecHelper.parseNetspec(source, 'T', fnAbi('f'))[0].notice).to.equal('Right one.')
    })

    it('should accept a qualified unit:Name contract name', () => {
      const source = JSON.stringify({
        language: 'Solidity',
        sources: {
          'a.sol': { content: 'contract T { /// @notice From A.\n function f() public {} }' },
          'b.sol': { content: 'contract T { /// @notice From B.\n function f() public {} }' },
        },
      })
      expect(ContractNetspecHelper.parseNetspec(source, 'b.sol:T', fnAbi('f'))[0].notice).to.equal('From B.')
    })
  })

  describe('inheritdoc matching', () => {
    it('should not match a base declaration of a different name', () => {
      const abi = fnAbi('act', ['uint256'])
      const result = run(
        `contract Base { /// @notice Other thing.\n function other(uint256 v) public {} }
         contract Child is Base {
           /// @inheritdoc Base
           function act(uint256 v) public {}
         }`,
        'Child',
        abi,
      )
      expect(result[0]).to.equal(abi[0])
    })

    it('should not match when same-arity base declarations disagree on type', () => {
      const abi = fnAbi('act', ['bytes32'])
      const result = run(
        `contract Base {
           /// @notice Uint form.
           function act(uint256 v) public {}
           /// @notice Address form.
           function act(address v) public {}
         }
         contract Child is Base {
           /// @inheritdoc Base
           function act(bytes32 v) public {}
         }`,
        'Child',
        abi,
      )
      expect(result[0]).to.equal(abi[0])
    })

    it('should ignore events when searching a base for @inheritdoc', () => {
      const result = run(
        `contract Base {
           event act(uint256 v);
           /// @notice Real function.
           function act(uint256 v) public {}
         }
         contract Child is Base {
           /// @inheritdoc Base
           function act(uint256 v) public {}
         }`,
        'Child',
        fnAbi('act', ['uint256']),
      )
      expect(result[0].notice).to.equal('Real function.')
    })
  })
})
