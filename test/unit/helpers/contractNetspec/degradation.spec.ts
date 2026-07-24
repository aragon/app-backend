import * as ContractNetspecHelper from '@helpers/contractNetspec'
import * as parser from '@helpers/contractNetspec/parser'
import * as resolver from '@helpers/contractNetspec/resolver'
import { expect } from 'chai'

/**
 * Degradation and recovery paths. Verified explorer source is routinely truncated, mangled, or
 * only partially uploaded, so most of this module is error recovery. These cases exercise the
 * branches that keep a malformed payload from throwing, hanging, or inventing documentation.
 */

const bundleOf = (files: Record<string, string>): parser.SourceBundle => ({
  language: 'unknown',
  units: Object.entries(files).map(([path, content], order) => ({ path, content, order })),
})
const parseSol = (files: Record<string, string>) => parser.parseBundle(bundleOf(files), 'solidity')
const parseVy = (source: string, path = 'a.vy') => parser.parseBundle(bundleOf({ [path]: source }), 'vyper')
const run = (source: unknown, name: string, abi: any[], compiler = '0.8.19') =>
  ContractNetspecHelper.parseNetspec(source, name, abi, compiler)

const fnAbi = (name: string, types: string[] = []) => [
  { type: 'function', name, inputs: types.map((t, i) => ({ name: `p${i}`, type: t })), outputs: [] },
]

describe('Helpers:ContractNetspec:Degradation', () => {
  describe('source normalization', () => {
    it('should ignore JSON payloads that are not source maps', () => {
      for (const payload of ['[1,2,3]', '"a string"', '42', 'null', '{"sources":null}', '{"unrelated":1}']) {
        expect(parser.normalizeSource(payload).units.length, payload).to.be.at.most(1)
      }
    })

    it('should ignore array and primitive inputs', () => {
      expect(parser.normalizeSource([]).units).to.be.empty
      expect(parser.normalizeSource(true).units).to.be.empty
      expect(parser.normalizeSource({}).units).to.be.empty
      expect(parser.normalizeSource({ sources: {} }).units).to.be.empty
    })

    it('should fall back to raw source when the double-brace body is not valid JSON', () => {
      const bundle = parser.normalizeSource('{{ not json at all }}')
      expect(bundle.units).to.have.length(1)
      expect(bundle.units[0].content).to.contain('not json')
    })

    it('should ignore a compilationTarget that carries no string contract name', () => {
      const bundle = parser.normalizeSource(
        JSON.stringify({
          language: 'Solidity',
          sources: { 'a.sol': { content: 'contract A {}' } },
          settings: { compilationTarget: { 'a.sol': 123 } },
        }),
      )
      expect(bundle.compilationTarget).to.be.undefined
    })

    it('should never throw when reading the payload itself explodes', () => {
      const hostile = {
        get sources() {
          throw new Error('boom')
        },
      }
      const abi = fnAbi('f')
      expect(run(hostile, 'T', abi)).to.deep.equal(abi)
    })
  })

  describe('language detection', () => {
    it('should treat an empty or unrecognised compiler version as no evidence', () => {
      const bundle = bundleOf({ '': 'contract A { uint x; }' })
      expect(parser.detectLanguage(bundle, '')).to.equal('solidity')
      expect(parser.detectLanguage(bundle, '   ')).to.equal('solidity')
      expect(parser.detectLanguage(bundle, 'not-a-version')).to.equal('solidity')
    })

    it('should return the ABI unchanged when neither parser finds the target', () => {
      const abi = fnAbi('f')
      expect(ContractNetspecHelper.parseNetspec('%%% not code %%%', 'T', abi)).to.deep.equal(abi)
    })

    it('should score vyper storage and declaration lines', () => {
      const vyper = bundleOf({
        '': ['owner: public(address)', 'balances: HashMap[address, uint256]', 'event Transfer:', 'struct Point:'].join(
          '\n',
        ),
      })
      expect(parser.detectLanguage(vyper)).to.equal('vyper')
    })
  })

  describe('solidity recovery', () => {
    it('should survive declarations truncated at every stage', () => {
      const fragments = [
        'contract',
        'contract T',
        'contract T is',
        'contract T {',
        'contract T { function',
        'contract T { function f',
        'contract T { function f(',
        'contract T { function f(uint256',
        'contract T { event',
        'contract T { event E(',
        'contract T { error',
        'contract T { struct',
        'contract T { struct S {',
        'contract T { enum',
        'contract T { enum E {',
        'contract T { type',
        'contract T { type P is',
        'contract T { mapping(address =>',
        'contract T { uint256 public',
        'contract T { modifier',
        'contract T { modifier m(',
        'import',
        'import {',
        'import { A } from',
        'pragma',
        'using A for',
      ]
      for (const fragment of fragments) {
        expect(() => parseSol({ 'a.sol': fragment }), fragment).to.not.throw()
      }
    })

    it('should record import forms including aliases after the path', () => {
      const parsed = parseSol({
        'main.sol': [
          'import "./plain.sol";',
          'import "./aliased.sol" as Legacy;',
          'import * as Star from "./star.sol";',
          'import { A as B, C } from "./named.sol";',
          'contract T {}',
        ].join('\n'),
        'plain.sol': 'contract P {}',
        'aliased.sol': 'contract Q {}',
        'star.sol': 'contract R {}',
        'named.sol': 'contract A {} contract C {}',
      })
      const imports = parsed.imports.get('main.sol') ?? []
      expect(imports).to.have.length(4)
      expect(imports[1].unitAlias).to.equal('Legacy')
      expect(imports[2].unitAlias).to.equal('Star')
      expect(imports[3].symbols.map(s => s.alias ?? s.name)).to.deep.equal(['B', 'C'])
    })

    it('should resolve imports by path suffix and by basename', () => {
      const bySuffix = parseSol({
        'deep/nested/Base.sol': 'contract Base { /// @notice Suffix hit.\n function f() public {} }',
        'main.sol': 'import "nested/Base.sol";\ncontract Child is Base {}',
      })
      const target = bySuffix.contracts.find(c => c.name === 'Child') as parser.ContractDocumentation
      expect(resolver.linearizeContract(bySuffix, target).map(c => c.name)).to.deep.equal(['Child', 'Base'])

      const byBase = parseSol({
        'somewhere/Other.sol': 'contract Other { /// @notice Base hit.\n function f() public {} }',
        'main.sol': 'import "./totally/wrong/Other.sol";\ncontract Kid is Other {}',
      })
      const kid = byBase.contracts.find(c => c.name === 'Kid') as parser.ContractDocumentation
      expect(resolver.linearizeContract(byBase, kid).map(c => c.name)).to.deep.equal(['Kid', 'Other'])
    })

    it('should skip declarations that cannot yield a callable name', () => {
      const parsed = parseSol({
        'a.sol': 'contract T { event (uint256 a); error (); function (uint256 a) public {} }',
      })
      const contract = parsed.contracts[0]
      expect(contract.declarations.filter(d => !d.name)).to.be.empty
    })

    it('should handle state variables with initialisers, overrides and non-public visibility', () => {
      const parsed = parseSol({
        'a.sol': `contract T {
          /// @notice Public with initialiser.
          uint256 public counter = 7;
          /// @notice Overriding getter.
          uint256 public override total;
          uint256 private hidden;
          uint256 internal alsoHidden;
          uint256 constant CONST = 1;
          mapping(address => mapping(uint256 => bool)) public nested;
          uint256[][3] public grid;
        }`,
      })
      const names = parsed.contracts[0].declarations.filter(d => d.kind === 'getter').map(d => d.name)
      expect(names).to.include.members(['counter', 'total', 'nested', 'grid'])
      expect(names).to.not.include.members(['hidden', 'alsoHidden'])
    })

    it('should not treat malformed mapping getters as documented', () => {
      const parsed = parseSol({ 'a.sol': 'contract T { mapping(address uint256) public broken; }' })
      const getter = parsed.contracts[0].declarations.find(d => d.name === 'broken')
      expect(getter === undefined || getter.parameters.length === 0).to.be.true
    })

    it('should keep parsing after inline assembly, using-for and nested blocks', () => {
      const result = run(
        `contract T {
          using SafeMath for uint256;
          /// @notice Runs the thing.
          function go(uint256 a) public {
            assembly { let x := 1 }
            { uint256 inner = a; }
            if (a > 0) { revert("no"); }
          }
        }`,
        'T',
        fnAbi('go', ['uint256']),
      )
      expect(result[0].notice).to.equal('Runs the thing.')
    })

    it('should ignore free functions and file-level events when matching', () => {
      const abi = fnAbi('helper', ['uint256'])
      const result = run(
        `/// @notice Free function docs.
         function helper(uint256 a) pure returns (uint256) { return a; }
         event Global(uint256 a);
         contract T { }`,
        'T',
        abi,
      )
      expect(result[0]).to.equal(abi[0])
    })
  })

  describe('type canonicalization edges', () => {
    const parsed = parseSol({
      'a.sol': `contract T {
        struct Empty { }
        struct WithUnknown { Missing m; }
        enum E { A }
        type P is uint64;
      }`,
    })

    it('should return undefined for unresolvable and malformed types', () => {
      expect(resolver.canonicalSourceType(parsed, '')).to.be.undefined
      expect(resolver.canonicalSourceType(parsed, 'Missing')).to.be.undefined
      expect(resolver.canonicalSourceType(parsed, 'WithUnknown', { unit: 'a.sol' })).to.be.undefined
      expect(resolver.canonicalSourceType(parsed, '[[[')).to.be.undefined
    })

    it('should canonicalize an empty struct as an empty tuple', () => {
      expect(resolver.canonicalSourceType(parsed, 'Empty', { unit: 'a.sol' })).to.equal('()')
    })

    it('should normalize fixed-point and byte aliases', () => {
      expect(resolver.canonicalSourceType(parsed, 'fixed')).to.equal('fixed128x18')
      expect(resolver.canonicalSourceType(parsed, 'ufixed')).to.equal('ufixed128x18')
      expect(resolver.canonicalSourceType(parsed, 'byte')).to.equal('bytes1')
    })

    it('should canonicalize ABI inputs with missing or odd type fields', () => {
      expect(resolver.canonicalAbiInput({} as any)).to.equal('')
      expect(resolver.canonicalAbiInput({ type: 123 } as any)).to.equal('')
      expect(resolver.canonicalAbiInput({ type: 'tuple[2]', components: [{ type: 'uint' }] })).to.equal('(uint256)[2]')
    })

    it('should treat a contract-typed parameter reached only by member name as an address', () => {
      const withInterface = parseSol({ 'a.sol': 'interface IThing {}\ncontract T {}' })
      expect(resolver.canonicalSourceType(withInterface, 'Some.IThing', { unit: 'a.sol' })).to.equal('address')
    })
  })

  describe('candidate and target resolution edges', () => {
    it('should award partial coverage when types are unknown but arity matches', () => {
      const files = {
        'a.sol': 'contract Soft { function f(Unknown u) public {} }',
        'b.sol': 'contract Other { function unrelated() public {} }',
      }
      const parsed = parseSol(files)
      const soft = parsed.contracts.find(c => c.name === 'Soft') as parser.ContractDocumentation
      expect(resolver.coverageScore(parsed, soft, fnAbi('f', ['address']))).to.be.greaterThan(0)
    })

    it('should fall back to source order when duplicates tie on coverage', () => {
      const files = {
        'a.sol': 'contract Dup { /// @notice first\n function f() public {} }',
        'b.sol': 'contract Dup { /// @notice second\n function f() public {} }',
      }
      const parsed = parseSol(files)
      const chosen = resolver.resolveTargetContract(parsed, bundleOf(files), 'Dup', fnAbi('f'))
      expect(chosen?.qualifiedName).to.equal('a.sol:Dup')
    })

    it('should return undefined when no contract is parsed at all', () => {
      const parsed = parseSol({ 'a.sol': '// only a comment' })
      expect(resolver.resolveTargetContract(parsed, bundleOf({ 'a.sol': '' }), 'T', [])).to.be.undefined
    })

    it('should tolerate an inconsistent hierarchy that C3 cannot linearize', () => {
      const parsed = parseSol({
        'a.sol': `contract A {}
          contract B {}
          contract X is A, B {}
          contract Y is B, A {}
          contract Z is X, Y { /// @notice still documented\n function f() public {} }`,
      })
      const z = parsed.contracts.find(c => c.name === 'Z') as parser.ContractDocumentation
      const line = resolver.linearizeContract(parsed, z)
      expect(line[0].name).to.equal('Z')
      expect(line.length).to.be.greaterThan(1)
    })

    it('should inherit through @inheritdoc when only the arity is unambiguous', () => {
      const result = run(
        `contract Base {
           /// @notice Base notice.
           /// @param v The value.
           function act(Unknown v) public virtual {}
         }
         contract Child is Base {
           /// @inheritdoc Base
           function act(uint256 v) public override {}
         }`,
        'Child',
        fnAbi('act', ['uint256']),
      )
      expect(result[0].notice).to.equal('Base notice.')
    })

    it('should keep local docs when @inheritdoc names the declaring contract itself', () => {
      const result = run(
        `contract Solo {
           /// @notice Local only.
           /// @inheritdoc Solo
           function f() public {}
         }`,
        'Solo',
        fnAbi('f'),
      )
      expect(result[0].notice).to.equal('Local only.')
    })
  })

  describe('vyper recovery', () => {
    it('should survive truncated vyper declarations', () => {
      for (const fragment of [
        'def',
        'def f',
        'def f(',
        'def f(a: uint256',
        '@external',
        'event',
        'struct',
        'interface',
        'exports:',
        'exports: (',
        'import',
        'from',
        'x: public(',
        '"""',
      ]) {
        expect(() => parseVy(fragment), fragment).to.not.throw()
      }
    })

    it('should canonicalize vyper containers and structs', () => {
      const parsed = parseVy(`struct Point:
    x: uint256
    y: address

@external
def use(p: Point, amounts: DynArray[uint256, 5], memo: String[32], raw: Bytes[64], fixedList: uint256[3]):
    """
    @notice Uses containers.
    """
    pass`)
      const scope = { unit: 'a.vy' }
      expect(resolver.canonicalSourceType(parsed, 'Point', scope)).to.equal('(uint256,address)')
      expect(resolver.canonicalSourceType(parsed, 'DynArray[uint256, 5]', scope)).to.equal('uint256[]')
      expect(resolver.canonicalSourceType(parsed, 'String[32]', scope)).to.equal('string')
      expect(resolver.canonicalSourceType(parsed, 'Bytes[64]', scope)).to.equal('bytes')
      expect(resolver.canonicalSourceType(parsed, 'uint256[3]', scope)).to.equal('uint256[3]')
      expect(resolver.canonicalSourceType(parsed, 'decimal', scope)).to.equal('int168')
      expect(resolver.canonicalSourceType(parsed, 'NotAThing', scope)).to.be.undefined
    })

    it('should resolve a vyper module by basename when the path does not line up', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': { content: 'import deeply.nested.ownable\n\nexports: deeply.nested.ownable.set_owner' },
          'contracts/ownable.vy': {
            content: '@external\ndef set_owner(o: address):\n    """\n    @notice Sets the owner.\n    """\n    pass',
          },
        },
      })
      const result = ContractNetspecHelper.parseNetspec(source, 'main', fnAbi('set_owner', ['address']), 'vyper')
      expect(result[0].notice).to.equal('Sets the owner.')
    })

    it('should pick the vyper module named by the compilation target', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'a.vy': { content: '@external\ndef f():\n    """\n    @notice From A.\n    """\n    pass' },
          'b.vy': { content: '@external\ndef f():\n    """\n    @notice From B.\n    """\n    pass' },
        },
        settings: { compilationTarget: { 'b.vy': 'b' } },
      })
      expect(ContractNetspecHelper.parseNetspec(source, 'b', fnAbi('f'), 'vyper')[0].notice).to.equal('From B.')
    })

    it('should ignore ordinary comments, decorators with arguments and blank docstrings', () => {
      const parsed = parseVy(`# a comment
@nonreentrant("lock")
@external
def f(a: uint256):
    """
    """
    pass`)
      const decl = parsed.contracts[0].declarations.find(d => d.name === 'f')
      expect(decl?.visibility).to.equal('external')
      expect(decl?.documentation).to.be.undefined
    })

    it('should not confuse a # inside a default string with a comment', () => {
      const parsed = parseVy(`@external
def tag(memo: String[8] = "a#b"):
    """
    @notice Tags it.
    """
    pass`)
      const decl = parsed.contracts[0].declarations.find(d => d.name === 'tag')
      expect(decl?.parameters).to.have.length(1)
      expect(decl?.documentation?.notice).to.equal('Tags it.')
    })
  })

  describe('documentation text edges', () => {
    it('should ignore comment blocks that carry no tags at all', () => {
      expect(parser.parseDocLines(['   ', '***', ''])).to.be.undefined
    })

    it('should keep repeated custom and unknown tags', () => {
      const doc = parser.parseDocLines([
        '@custom:audit first',
        '@custom:audit second',
        '@weird one',
        '@weird two',
        '@custom: ignored-empty-name',
      ])
      expect(doc?.custom.get('audit')).to.deep.equal(['first', 'second'])
      expect(doc?.unknown.get('weird')).to.deep.equal(['one', 'two'])
    })

    it('should ignore an @inheritdoc with no target', () => {
      const doc = parser.parseDocLines(['@notice Something.', '@inheritdoc'])
      expect(doc?.inheritdoc).to.be.undefined
      expect(doc?.notice).to.equal('Something.')
    })
  })

  describe('enrichment output', () => {
    it('should leave non-function and unnamed ABI entries untouched', () => {
      const abi: any[] = [
        null,
        42,
        'nonsense',
        { type: 'function' },
        { type: 'function', name: 5 },
        { type: 'event', name: 'f', inputs: [] },
        { type: 'constructor', inputs: [] },
      ]
      const result = run('contract T { /// @notice hi\n function f() public {} }', 'T', abi)
      expect(result).to.have.length(abi.length)
      for (let i = 0; i < abi.length; i++) expect(result[i], `entry ${i}`).to.equal(abi[i])
    })

    it('should treat a non-array inputs field as a zero-argument function', () => {
      // Defensive: the field is unusable, so it degrades to "no inputs" rather than throwing.
      const abi: any[] = [{ type: 'function', name: 'f', inputs: 'not-an-array' }]
      const result = run('contract T { /// @notice hi\n function f() public {} }', 'T', abi)
      expect(result[0].notice).to.equal('hi')
      expect(result[0].inputs).to.equal('not-an-array')
    })

    it('should keep inputs identical when only the notice resolves', () => {
      const abi = [{ type: 'function', name: 'f', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] }]
      const result = run('contract T { /// @notice Only a notice.\n function f(uint256 a) public {} }', 'T', abi)
      expect(result[0].notice).to.equal('Only a notice.')
      expect(result[0].inputs[0].notice).to.be.undefined
    })
  })
})
