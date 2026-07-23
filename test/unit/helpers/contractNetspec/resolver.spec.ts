import * as ContractNetspecHelper from '@helpers/contractNetspec'
import * as parser from '@helpers/contractNetspec/parser'
import * as resolver from '@helpers/contractNetspec/resolver'
import { expect } from 'chai'

const bundleOf = (files: Record<string, string>): parser.SourceBundle => ({
  language: 'unknown',
  units: Object.entries(files).map(([path, content], order) => ({ path, content, order })),
})

const parseSol = (files: Record<string, string>) => parser.parseBundle(bundleOf(files), 'solidity')

const run = (source: string, contractName: string, abi: any[]) =>
  ContractNetspecHelper.parseNetspec(source, contractName, abi, '0.8.19')

describe('Helpers:ContractNetspec:Resolver', () => {
  describe('type canonicalization', () => {
    const parsed = parseSol({
      'a.sol': `
        interface IERC20 {}
        contract T {
          struct Point { uint x; uint y; }
          struct Line { Point from; Point to; }
          enum Status { A, B }
          type Price is uint128;
        }
      `,
    })

    it('should normalize elementary aliases and data locations', () => {
      expect(resolver.canonicalSourceType(parsed, 'uint')).to.equal('uint256')
      expect(resolver.canonicalSourceType(parsed, 'int')).to.equal('int256')
      expect(resolver.canonicalSourceType(parsed, 'byte')).to.equal('bytes1')
      expect(resolver.canonicalSourceType(parsed, 'uint [ ] memory')).to.equal('uint256[]')
      expect(resolver.canonicalSourceType(parsed, 'address payable')).to.equal('address')
      expect(resolver.canonicalSourceType(parsed, 'bytes32 [ 4 ]')).to.equal('bytes32[4]')
      expect(resolver.canonicalSourceType(parsed, 'function ( uint ) external')).to.equal('function')
    })

    it('should map custom types to their ABI representation', () => {
      expect(resolver.canonicalSourceType(parsed, 'Status')).to.equal('uint8')
      expect(resolver.canonicalSourceType(parsed, 'Price')).to.equal('uint128')
      expect(resolver.canonicalSourceType(parsed, 'IERC20')).to.equal('address')
      expect(resolver.canonicalSourceType(parsed, 'Point')).to.equal('(uint256,uint256)')
      expect(resolver.canonicalSourceType(parsed, 'Line')).to.equal('((uint256,uint256),(uint256,uint256))')
      expect(resolver.canonicalSourceType(parsed, 'T.Point [ ]')).to.equal('(uint256,uint256)[]')
      expect(resolver.canonicalSourceType(parsed, 'UnknownThing')).to.be.undefined
    })

    it('should canonicalize ABI inputs including nested tuples', () => {
      expect(resolver.canonicalAbiInput({ type: 'uint' })).to.equal('uint256')
      expect(
        resolver.canonicalAbiInput({
          type: 'tuple[]',
          components: [{ type: 'uint256' }, { type: 'tuple', components: [{ type: 'address' }] }],
        }),
      ).to.equal('(uint256,(address))[]')
      expect(resolver.canonicalAbiInput({ type: 'tuple' })).to.equal('tuple')
    })

    it('should scope type lookups by source unit when simple names collide', () => {
      const collided = parseSol({
        'a.sol': 'contract A { struct Point { uint256 x; } }',
        'b.sol': 'contract B { struct Point { uint256 x; uint256 y; } }',
      })
      expect(resolver.canonicalSourceType(collided, 'Point', 'a.sol')).to.equal('(uint256)')
      expect(resolver.canonicalSourceType(collided, 'Point', 'b.sol')).to.equal('(uint256,uint256)')
      expect(resolver.canonicalSourceType(collided, 'Point')).to.be.undefined
    })

    it('should scope type lookups by contract when names collide within one source unit', () => {
      const source = `
        contract A {
          struct Point { uint256 x; }
          /// @notice Uses the A point.
          /// @param p The point.
          function use(Point memory p) external {}
        }
        contract B {
          struct Point { address x; }
          /// @notice Uses the B point.
          /// @param p The other point.
          function use(Point memory p) external {}
        }
      `
      const sameUnit = parseSol({ 'x.sol': source })
      expect(resolver.canonicalSourceType(sameUnit, 'Point', { unit: 'x.sol', container: 'A' })).to.equal('(uint256)')
      expect(resolver.canonicalSourceType(sameUnit, 'Point', { unit: 'x.sol', container: 'B' })).to.equal('(address)')
      expect(resolver.canonicalSourceType(sameUnit, 'Point', 'x.sol')).to.be.undefined

      const abiA = [
        {
          type: 'function',
          name: 'use',
          inputs: [{ name: 'p', type: 'tuple', components: [{ name: 'x', type: 'uint256' }] }],
          outputs: [],
        },
      ]
      expect(run(source, 'A', abiA)[0].notice).to.equal('Uses the A point.')
      const abiB = [
        {
          type: 'function',
          name: 'use',
          inputs: [{ name: 'p', type: 'tuple', components: [{ name: 'x', type: 'address' }] }],
          outputs: [],
        },
      ]
      expect(run(source, 'B', abiB)[0].notice).to.equal('Uses the B point.')
    })

    it('should resolve imported type names through import scope', () => {
      const parsed = parseSol({
        'types/Geometry.sol': 'struct Point { uint256 x; uint256 y; }',
        'other/Decoy.sol': 'struct Point { address holder; }',
        'main/C.sol':
          'import { Point } from "../types/Geometry.sol";\nimport * as Geo from "../types/Geometry.sol";\ncontract C {}',
      })
      expect(resolver.canonicalSourceType(parsed, 'Point')).to.be.undefined
      expect(resolver.canonicalSourceType(parsed, 'Point', { unit: 'main/C.sol' })).to.equal('(uint256,uint256)')
      expect(resolver.canonicalSourceType(parsed, 'Geo.Point', { unit: 'main/C.sol' })).to.equal('(uint256,uint256)')
    })

    it('should resolve types qualified through symbol-import aliases', () => {
      const parsed = parseSol({
        'types/Types.sol': 'contract Types { struct Point { uint256 x; uint256 y; } }',
        'other/Decoy.sol': 'struct Point { address holder; }',
        'main/C.sol': 'import { Types as T } from "../types/Types.sol";\ncontract C {}',
      })
      expect(resolver.canonicalSourceType(parsed, 'T.Point', { unit: 'main/C.sol' })).to.equal('(uint256,uint256)')
    })

    it('should not degrade a qualified type to an unrelated simple name', () => {
      const parsed = parseSol({ 'a.sol': 'struct Widget { uint256 w; }\ncontract C {}' })
      expect(resolver.canonicalSourceType(parsed, 'Widget', { unit: 'a.sol' })).to.equal('(uint256)')
      expect(resolver.canonicalSourceType(parsed, 'Unknown.Widget', { unit: 'a.sol' })).to.be.undefined
    })
  })

  describe('contract and target resolution', () => {
    it('should linearize diamonds in Solidity C3 order', () => {
      const parsed = parseSol({
        'a.sol': `
          contract A {}
          contract B is A {}
          contract C is A {}
          contract D is B, C {}
        `,
      })
      const d = parsed.contracts.find(contract => contract.name === 'D') as parser.ContractDocumentation
      expect(resolver.linearizeContract(parsed, d).map(contract => contract.name)).to.deep.equal(['D', 'C', 'B', 'A'])
    })

    it('should linearize a deep inheritance chain without superlinear cost', function () {
      // Guards a real regression: scanning sequence tails on every c3 iteration made this O(depth^3),
      // so a contract with a long (attacker-authorable) chain blocked the event loop for seconds.
      // Real contracts sit near depth 30; the budget here only has to fail the cubic implementation.
      this.timeout(5000)
      const depth = 1200
      const parts = ['contract C0 { /// @notice base doc\n function f(uint256 a) public virtual {} }']
      for (let i = 1; i < depth; i++) parts.push(`contract C${i} is C${i - 1} {}`)
      const abi = [{ type: 'function', name: 'f', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] }]

      const result = run(parts.join('\n'), `C${depth - 1}`, abi)
      expect(result[0].notice).to.equal('base doc')
    })

    it('should resolve parents across units through symbol aliases', () => {
      const json = JSON.stringify({
        language: 'Solidity',
        sources: {
          'contracts/Base.sol': {
            content: `contract Base {
              /// @notice Base does thing.
              /// @param x The x.
              function doThing(uint256 x) public virtual {}
            }`,
          },
          'contracts/Child.sol': {
            content: `import { Base as TheBase } from "./Base.sol";
              contract Child is TheBase {}`,
          },
        },
      })
      const abi = [{ type: 'function', name: 'doThing', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] }]
      const result = ContractNetspecHelper.parseNetspec(json, 'Child', abi)
      expect(result[0].notice).to.equal('Base does thing.')
      expect(result[0].inputs[0].notice).to.equal('The x.')
    })

    it('should resolve relative imports against the importing directory', () => {
      // lib/interfaces/I.sol exists as a decoy: only directory-relative resolution is deterministic.
      const json = JSON.stringify({
        language: 'Solidity',
        sources: {
          'lib/interfaces/I.sol': { content: 'interface I { function other() external; }' },
          'src/interfaces/I.sol': {
            content: `interface I {
              /// @notice Interface doc.
              /// @param v The v.
              function act(uint256 v) external;
            }`,
          },
          'src/foo/C.sol': {
            content: `import { I } from "../interfaces/I.sol";
              contract C is I {
                function act(uint256 v) public override {}
              }`,
          },
        },
      })
      const result = ContractNetspecHelper.parseNetspec(json, 'C', [
        { type: 'function', name: 'act', inputs: [{ name: 'v', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Interface doc.')
      expect(result[0].inputs[0].notice).to.equal('The v.')
    })

    it('should prefer the compilation target over same-name contracts', () => {
      const parsed = parseSol({
        'a.sol': 'contract Token { function a() public {} }',
        'b.sol': 'contract Token { function b() public {} }',
      })
      const bundle = {
        ...bundleOf({}),
        compilationTarget: { path: 'b.sol', contractName: 'Token' },
      }
      const target = resolver.resolveTargetContract(parsed, bundle, 'Token', [])
      expect(target?.qualifiedName).to.equal('b.sol:Token')
    })

    it('should resolve duplicate names by ABI coverage and qualified names exactly', () => {
      const files = {
        'a.sol': `contract Token {
          /// @notice Transfers.
          function transfer(address to, uint256 amount) public {}
        }`,
        'b.sol': `contract Token {
          /// @notice Mints.
          function mint(address to) public {}
        }`,
      }
      const parsed = parseSol(files)
      const bundle = bundleOf(files)
      const transferAbi = [
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
      expect(resolver.resolveTargetContract(parsed, bundle, 'Token', transferAbi)?.qualifiedName).to.equal(
        'a.sol:Token',
      )
      expect(resolver.resolveTargetContract(parsed, bundle, 'b.sol:Token', [])?.qualifiedName).to.equal('b.sol:Token')
    })

    it('should only stand in an unnamed contract on unique non-zero coverage', () => {
      const files = {
        'a.sol': `contract Real {
          /// @notice Transfers.
          function transfer(address to, uint256 amount) public {}
        }
        contract Empty {}`,
      }
      const parsed = parseSol(files)
      const bundle = bundleOf(files)
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
      expect(resolver.resolveTargetContract(parsed, bundle, 'WrongName', abi)?.name).to.equal('Real')
      expect(resolver.resolveTargetContract(parsed, bundle, 'WrongName', [])).to.be.undefined
    })
  })

  describe('candidate matching', () => {
    it('should match struct parameters through components and internalType', () => {
      const source = `
        contract T {
          struct Point { uint256 x; uint256 y; }

          /// @notice Takes a point.
          /// @param p The point.
          function set(Point memory p) public {}

          /// @notice Takes a number.
          /// @param p The number.
          function set(uint256 p) public {}
        }
      `
      const withComponents = run(source, 'T', [
        {
          type: 'function',
          name: 'set',
          inputs: [
            {
              name: 'p',
              type: 'tuple',
              internalType: 'struct T.Point',
              components: [
                { name: 'x', type: 'uint256' },
                { name: 'y', type: 'uint256' },
              ],
            },
          ],
          outputs: [],
        },
      ])
      expect(withComponents[0].notice).to.equal('Takes a point.')

      const withoutComponents = run(source, 'T', [
        {
          type: 'function',
          name: 'set',
          inputs: [{ name: 'p', type: 'tuple', internalType: 'struct T.Point' }],
          outputs: [],
        },
      ])
      expect(withoutComponents[0].notice).to.equal('Takes a point.')
    })

    it('should match enum, UDVT, and contract-typed parameters against their ABI types', () => {
      const source = `
        interface IERC20 {}
        contract T {
          enum Status { A, B }
          type Price is uint128;

          /// @notice Sets status.
          function set(Status s) public {}

          /// @notice Sets price.
          function setPrice(Price p) public {}

          /// @notice Sets token.
          function setToken(IERC20 token) public {}
        }
      `
      const result = run(source, 'T', [
        { type: 'function', name: 'set', inputs: [{ name: 's', type: 'uint8' }], outputs: [] },
        { type: 'function', name: 'setPrice', inputs: [{ name: 'p', type: 'uint128' }], outputs: [] },
        { type: 'function', name: 'setToken', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Sets status.')
      expect(result[1].notice).to.equal('Sets price.')
      expect(result[2].notice).to.equal('Sets token.')
    })

    it('should never use an internal or private function as a candidate', () => {
      const source = `
        contract T {
          /// @notice Internal helper.
          function calc(uint256 a) internal {}
        }
      `
      const abi = [{ type: 'function', name: 'calc', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] }]
      const result = run(source, 'T', abi)
      expect(result[0]).to.equal(abi[0])
    })

    it('should return items unchanged when no declaration of that name exists', () => {
      const source = `
        contract T {
          /// @notice One arg.
          function f(uint256 a) public {}
        }
      `
      const abi = [{ type: 'function', name: 'g', inputs: [], outputs: [] }]
      const result = run(source, 'T', abi)
      expect(result[0]).to.equal(abi[0])
    })

    it('should return nothing when the source arity disagrees with the ABI', () => {
      // Partially verified sources routinely disagree with the stored ABI. A same-name declaration
      // of a different arity is not evidence about this ABI entry, so it contributes nothing —
      // absent documentation beats documentation borrowed from another signature.
      const source = `
        contract T {
          /// @notice Initializes things.
          /// @param a The a value.
          /// @param b The b value.
          function init(uint256 a, uint256 b, uint256 c) public {}
        }
      `
      const abi = [
        {
          type: 'function',
          name: 'init',
          inputs: [
            { name: 'b', type: 'uint256' },
            { name: 'a', type: 'uint256' },
          ],
          outputs: [],
        },
      ]
      const result = run(source, 'T', abi)
      expect(result[0]).to.equal(abi[0])
    })

    it('should break exact ties by the last declaration in stable source order', () => {
      const source = `
        contract T {
          /// @notice First declaration.
          function dup(uint256 a) public {}

          /// @notice Second declaration.
          function dup(uint256 a) public {}
        }
      `
      const result = run(source, 'T', [
        { type: 'function', name: 'dup', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Second declaration.')
    })

    it('should match Vyper ABI variants shortened by trailing default arguments', () => {
      const vyperCode = `@external
def foo(a: uint256, b: uint256 = 0):
    """
    @notice Foo.
    @param a The a.
    @param b The b.
    """
    pass`
      const short = ContractNetspecHelper.parseNetspec(
        vyperCode,
        'M',
        [{ type: 'function', name: 'foo', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] }],
        'vyper',
      )
      expect(short[0].notice).to.equal('Foo.')
      expect(short[0].inputs[0].notice).to.equal('The a.')

      const full = ContractNetspecHelper.parseNetspec(
        vyperCode,
        'M',
        [
          {
            type: 'function',
            name: 'foo',
            inputs: [
              { name: 'a', type: 'uint256' },
              { name: 'b', type: 'uint256' },
            ],
            outputs: [],
          },
        ],
        'vyper',
      )
      expect(full[0].notice).to.equal('Foo.')
      expect(full[0].inputs[1].notice).to.equal('The b.')
    })
  })

  describe('documentation inheritance', () => {
    it('should use the nearest effective declaration for functions not redeclared by the child', () => {
      const source = `
        contract A {
          /// @notice From A.
          function f(uint256 x) public virtual {}
        }
        contract B is A {
          /// @notice From B.
          function f(uint256 x) public virtual override {}
        }
        contract C is B {}
      `
      const result = run(source, 'C', [
        { type: 'function', name: 'f', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('From B.')
    })

    it('should apply automatic inheritance when the override has no NatSpec and names match', () => {
      const source = `
        contract Base {
          /// @notice Base notice.
          /// @param v The value.
          function test(uint256 v) public virtual {}
        }
        contract Derived is Base {
          function test(uint256 v) public override {}
        }
      `
      const result = run(source, 'Derived', [
        { type: 'function', name: 'test', inputs: [{ name: 'v', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Base notice.')
      expect(result[0].inputs[0].notice).to.equal('The value.')
    })

    it('should inherit only the tags a partial local comment leaves empty', () => {
      // The OpenZeppelin shape: the interface documents @notice/@param, the implementation carries
      // only @dev. Tag-level inheritance fills the gaps without ever overriding a local tag.
      const source = `
        interface IToken {
          /// @notice Moves tokens and calls the receiver.
          /// @param to The address which you want to transfer to.
          /// @param value The amount of tokens to be transferred.
          function transferAndCall(address to, uint256 value) external returns (bool);
        }
        contract Token is IToken {
          /// @dev Requirements: the target must implement the receiver interface.
          /// @param value The locally documented amount.
          function transferAndCall(address to, uint256 value) external returns (bool) {}
        }
      `
      const result = run(source, 'Token', [
        {
          type: 'function',
          name: 'transferAndCall',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
          ],
          outputs: [],
        },
      ])
      expect(result[0].notice).to.equal('Moves tokens and calls the receiver.')
      expect(result[0].inputs[0].notice).to.equal('The address which you want to transfer to.')
      expect(result[0].inputs[1].notice).to.equal('The locally documented amount.')
    })

    it('should inherit a notice for a public getter documented only with @dev', () => {
      const source = `
        interface IOAppCore {
          /// @notice Retrieves the LayerZero endpoint associated with the OApp.
          function endpoint() external view returns (address);
        }
        abstract contract OAppCore is IOAppCore {
          /// @dev UPGRADES immutable in the non-upgradeable contract
          address public endpoint;
        }
        contract Relay is OAppCore {}
      `
      const result = run(source, 'Relay', [
        { type: 'function', name: 'endpoint', inputs: [], outputs: [{ type: 'address' }] },
      ])
      expect(result[0].notice).to.equal('Retrieves the LayerZero endpoint associated with the OApp.')
    })

    it('should inherit positionally when an override renames its parameters', () => {
      // The signature matches exactly and exactly one documented base exists, so position is
      // unambiguous — a renamed parameter must not cost the function its documentation.
      const source = `
        contract Base {
          /// @notice Base notice.
          /// @param x The x.
          function test(uint256 x) public virtual {}
        }
        contract Derived is Base {
          function test(uint256 y) public override {}
        }
      `
      const abi = [{ type: 'function', name: 'test', inputs: [{ name: 'y', type: 'uint256' }], outputs: [] }]
      const result = run(source, 'Derived', abi)
      expect(result[0].notice).to.equal('Base notice.')
      expect(result[0].inputs[0].notice).to.equal('The x.')
    })

    it('should take the nearest base when several independent bases document the signature', () => {
      // `contract C is A, B` linearizes as [C, B, A], so B is nearest and wins deterministically.
      const source = `
        contract A {
          /// @notice From A.
          function f(uint256 x) public virtual {}
        }
        contract B {
          /// @notice From B.
          function f(uint256 x) public virtual {}
        }
        contract C is A, B {
          function f(uint256 x) public override(A, B) {}
        }
      `
      const abi = [{ type: 'function', name: 'f', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] }]
      const result = run(source, 'C', abi)
      expect(result[0].notice).to.equal('From B.')
    })

    it('should inherit through a diamond when only the root is documented', () => {
      const source = `
        contract A {
          /// @notice From the root.
          function f(uint256 x) public virtual {}
        }
        contract B is A {
          function f(uint256 x) public virtual override {}
        }
        contract C is A {
          function f(uint256 x) public virtual override {}
        }
        contract D is B, C {
          function f(uint256 x) public override(B, C) {}
        }
      `
      const result = run(source, 'D', [
        { type: 'function', name: 'f', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('From the root.')
    })

    it('should merge partial local tags over an explicit @inheritdoc parent', () => {
      const source = `
        contract Base {
          /// @notice Base notice.
          /// @param v The base param.
          function act(uint256 v) public virtual {}
        }
        contract Child is Base {
          /// @notice Child notice.
          /// @inheritdoc Base
          function act(uint256 v) public override {}
        }
      `
      const result = run(source, 'Child', [
        { type: 'function', name: 'act', inputs: [{ name: 'v', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Child notice.')
      expect(result[0].inputs[0].notice).to.equal('The base param.')
    })

    it('should map inherited parameter docs by position when child names differ', () => {
      const source = `
        contract Base {
          /// @notice Base notice.
          /// @param original The documented param.
          function act(uint256 original) public virtual {}
        }
        contract Child is Base {
          /// @inheritdoc Base
          function act(uint256 renamed) public override {}
        }
      `
      const result = run(source, 'Child', [
        { type: 'function', name: 'act', inputs: [{ name: 'renamed', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Base notice.')
      expect(result[0].inputs[0].notice).to.equal('The documented param.')
    })

    it('should follow multi-level @inheritdoc chains', () => {
      const source = `
        contract A {
          /// @notice Root docs.
          /// @param v The v.
          function act(uint256 v) public virtual {}
        }
        contract B is A {
          /// @inheritdoc A
          function act(uint256 v) public virtual override {}
        }
        contract C is B {
          /// @inheritdoc B
          function act(uint256 v) public override {}
        }
      `
      const result = run(source, 'C', [
        { type: 'function', name: 'act', inputs: [{ name: 'v', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Root docs.')
      expect(result[0].inputs[0].notice).to.equal('The v.')
    })

    it('should keep local documentation when the @inheritdoc parent is missing', () => {
      const source = `
        contract Child {
          /// @notice Local notice.
          /// @inheritdoc Unknown
          function act(uint256 v) public {}
        }
      `
      const result = run(source, 'Child', [
        { type: 'function', name: 'act', inputs: [{ name: 'v', type: 'uint256' }], outputs: [] },
      ])
      expect(result[0].notice).to.equal('Local notice.')
    })

    it('should not inherit across arities through @inheritdoc', () => {
      const source = `
        contract Base {
          /// @notice One arg.
          /// @param a The a.
          function foo(uint256 a) public virtual {}
        }
        contract Child is Base {
          /// @notice Local two-arg.
          /// @inheritdoc Base
          function foo(uint256 a, uint256 b) public {}
        }
      `
      const result = run(source, 'Child', [
        {
          type: 'function',
          name: 'foo',
          inputs: [
            { name: 'a', type: 'uint256' },
            { name: 'b', type: 'uint256' },
          ],
          outputs: [],
        },
      ])
      expect(result[0].notice).to.equal('Local two-arg.')
      expect(result[0].inputs[0].notice).to.be.undefined
    })

    it('should terminate on cyclic @inheritdoc references', () => {
      const source = `
        contract A is B {
          /// @inheritdoc B
          function f() public {}
        }
        contract B is A {
          /// @inheritdoc A
          function f() public {}
        }
      `
      const abi = [{ type: 'function', name: 'f', inputs: [], outputs: [] }]
      const result = run(source, 'A', abi)
      expect(result).to.have.length(1)
    })

    it('should resolve getters against the inheritance chain too', () => {
      const source = `
        contract Base {
          /// @notice The stored value.
          uint256 public value;
        }
        contract Child is Base {}
      `
      const result = run(source, 'Child', [
        { type: 'function', name: 'value', inputs: [], outputs: [{ type: 'uint256' }] },
      ])
      expect(result[0].notice).to.equal('The stored value.')
    })
  })

  describe('resolveAbiFunctionDoc', () => {
    it('should expose positional param notices through the resolution context', () => {
      const parsed = parseSol({
        'a.sol': `contract T {
          /// @notice Adds.
          /// @param a The a.
          /// @param b The b.
          function add(uint256 a, uint256 b) public {}
        }`,
      })
      const target = parsed.contracts[0]
      const ctx = resolver.createResolutionContext(parsed, target)
      const doc = resolver.resolveAbiFunctionDoc(ctx, {
        type: 'function',
        name: 'add',
        inputs: [
          { name: '', type: 'uint256' },
          { name: '', type: 'uint256' },
        ],
      })
      expect(doc?.notice).to.equal('Adds.')
      expect(doc?.paramNotices).to.deep.equal(['The a.', 'The b.'])
    })

    it('should return undefined when nothing resolves', () => {
      const parsed = parseSol({ 'a.sol': 'contract T { function f() public {} }' })
      const ctx = resolver.createResolutionContext(parsed, parsed.contracts[0])
      expect(resolver.resolveAbiFunctionDoc(ctx, { type: 'function', name: 'f', inputs: [] })).to.be.undefined
      expect(resolver.resolveAbiFunctionDoc(ctx, { type: 'function', name: 'missing', inputs: [] })).to.be.undefined
    })
  })

  describe('Vyper module exports', () => {
    const OWNABLE = `owner: public(address)

@external
def update_owner(new_owner: address):
    """
    @notice Updates the contract owner.
    @param new_owner The address of the incoming owner.
    """
    self.owner = new_owner

@external
def renounce():
    """
    @notice Gives up ownership entirely.
    """
    self.owner = empty(address)

@internal
def _check():
    """
    @notice Internal helper that must never reach the ABI.
    """
    pass`

    const vyperBundle = (main: string, extra: Record<string, string> = {}) =>
      JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': { content: main },
          'ownable.vy': { content: OWNABLE },
          ...Object.fromEntries(Object.entries(extra).map(([path, content]) => [path, { content }])),
        },
      })

    const updateOwnerAbi = [
      {
        type: 'function',
        name: 'update_owner',
        inputs: [{ name: 'new_owner', type: 'address' }],
        outputs: [],
      },
    ]

    it('should document a function re-exported from an imported module', () => {
      const source = vyperBundle(`import ownable

initializes: ownable

exports: ownable.update_owner

@external
def local():
    pass`)
      const result = ContractNetspecHelper.parseNetspec(source, 'main', updateOwnerAbi, 'vyper')
      expect(result[0].notice).to.equal('Updates the contract owner.')
      expect(result[0].inputs[0].notice).to.equal('The address of the incoming owner.')
    })

    it('should support parenthesised multi-line export lists', () => {
      const source = vyperBundle(`import ownable

exports: (
    ownable.owner,
    ownable.update_owner,
)`)
      const abi = [...updateOwnerAbi, { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }] }]
      const result = ContractNetspecHelper.parseNetspec(source, 'main', abi, 'vyper')
      expect(result[0].notice).to.equal('Updates the contract owner.')
      expect(result.length).to.equal(2)
    })

    it('should export every external member for module.__interface__', () => {
      const source = vyperBundle(`import ownable

exports: ownable.__interface__`)
      const abi = [...updateOwnerAbi, { type: 'function', name: 'renounce', inputs: [], outputs: [] }]
      const result = ContractNetspecHelper.parseNetspec(source, 'main', abi, 'vyper')
      expect(result[0].notice).to.equal('Updates the contract owner.')
      expect(result[1].notice).to.equal('Gives up ownership entirely.')
    })

    it('should resolve exports through an import alias and a dotted path', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': { content: 'import lib.ownable as own\n\nexports: own.update_owner' },
          'lib/ownable.vy': { content: OWNABLE },
        },
      })
      const result = ContractNetspecHelper.parseNetspec(source, 'main', updateOwnerAbi, 'vyper')
      expect(result[0].notice).to.equal('Updates the contract owner.')
    })

    it('should resolve exports referenced by an unaliased full module path', () => {
      const source = JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': { content: 'import lib.ownable\n\nexports: lib.ownable.update_owner' },
          'lib/ownable.vy': { content: OWNABLE },
        },
      })
      const result = ContractNetspecHelper.parseNetspec(source, 'main', updateOwnerAbi, 'vyper')
      expect(result[0].notice).to.equal('Updates the contract owner.')

      const viaInterface = JSON.stringify({
        language: 'Vyper',
        sources: {
          'main.vy': { content: 'import lib.ownable\n\nexports: lib.ownable.__interface__' },
          'lib/ownable.vy': { content: OWNABLE },
        },
      })
      const all = ContractNetspecHelper.parseNetspec(viaInterface, 'main', updateOwnerAbi, 'vyper')
      expect(all[0].notice).to.equal('Updates the contract owner.')
    })

    it('must not document an imported function that is never exported', () => {
      // Importing a module does not put its functions in the ABI — only `exports:` does.
      const source = vyperBundle(`import ownable

initializes: ownable

@external
def local():
    pass`)
      const result = ContractNetspecHelper.parseNetspec(source, 'main', updateOwnerAbi, 'vyper')
      expect(result[0]).to.equal(updateOwnerAbi[0])
    })

    it('must not export an internal module function even when named', () => {
      const source = vyperBundle(`import ownable

exports: ownable._check`)
      const abi = [{ type: 'function', name: '_check', inputs: [], outputs: [] }]
      const result = ContractNetspecHelper.parseNetspec(source, 'main', abi, 'vyper')
      expect(result[0]).to.equal(abi[0])
    })

    it("should prefer the target module's own declaration over a re-exported one", () => {
      const source = vyperBundle(`import ownable

exports: ownable.update_owner

@external
def update_owner(new_owner: address):
    """
    @notice Local override of the owner update.
    """
    pass`)
      const result = ContractNetspecHelper.parseNetspec(source, 'main', updateOwnerAbi, 'vyper')
      expect(result[0].notice).to.equal('Local override of the owner update.')
    })
  })
})
