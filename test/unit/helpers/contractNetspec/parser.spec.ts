import * as parser from '@helpers/contractNetspec/parser'
import { expect } from 'chai'

const bundleOf = (files: Record<string, string>): parser.SourceBundle => ({
  language: 'unknown',
  units: Object.entries(files).map(([path, content], order) => ({ path, content, order })),
})

const parseSol = (source: string, path = 'a.sol') => parser.parseBundle(bundleOf({ [path]: source }), 'solidity')
const parseVy = (source: string, path = 'a.vy') => parser.parseBundle(bundleOf({ [path]: source }), 'vyper')

const contractOf = (parsed: parser.ParsedBundle, name: string) => {
  const contract = parsed.contracts.find(entry => entry.name === name)
  expect(contract, `contract ${name} should be parsed`).to.exist
  return contract as parser.ContractDocumentation
}

const declOf = (contract: parser.ContractDocumentation, name: string) => {
  const decl = contract.declarations.find(entry => entry.name === name)
  expect(decl, `declaration ${name} should be parsed`).to.exist
  return decl as parser.DeclarationDocumentation
}

describe('Helpers:ContractNetspec:Parser', () => {
  describe('normalizeSource', () => {
    it('should wrap raw source into a single unit', () => {
      const bundle = parser.normalizeSource('contract A {}')
      expect(bundle.language).to.equal('unknown')
      expect(bundle.units).to.have.length(1)
      expect(bundle.units[0].content).to.equal('contract A {}')
    })

    it('should parse standard compiler JSON with language, sources, and compilationTarget', () => {
      const json = JSON.stringify({
        language: 'Solidity',
        sources: {
          'contracts/A.sol': { content: 'contract A {}' },
          'contracts/B.sol': { content: 'contract B {}' },
          'contracts/C.yul': { content: 'object "C" {}' },
          'contracts/broken.sol': {},
        },
        settings: { compilationTarget: { 'contracts/B.sol': 'B' } },
      })
      const bundle = parser.normalizeSource(json)
      expect(bundle.language).to.equal('solidity')
      expect(bundle.units.map(unit => unit.path)).to.deep.equal(['contracts/A.sol', 'contracts/B.sol'])
      expect(bundle.units.map(unit => unit.order)).to.deep.equal([0, 1])
      expect(bundle.compilationTarget).to.deep.equal({ path: 'contracts/B.sol', contractName: 'B' })
    })

    it("should unwrap Etherscan's double-brace payload", () => {
      const wrapped = `{{"sources": {"A.sol": {"content": "contract A {}"}}}}`
      const bundle = parser.normalizeSource(wrapped)
      expect(bundle.units).to.have.length(1)
      expect(bundle.units[0].path).to.equal('A.sol')
    })

    it('should accept a bare source map without the sources wrapper', () => {
      const bundle = parser.normalizeSource(JSON.stringify({ 'A.sol': { content: 'contract A {}' } }))
      expect(bundle.units).to.have.length(1)
      expect(bundle.units[0].path).to.equal('A.sol')
    })

    it('should treat invalid JSON as raw source', () => {
      const bundle = parser.normalizeSource('{invalid json}')
      expect(bundle.units).to.have.length(1)
      expect(bundle.units[0].content).to.equal('{invalid json}')
    })

    it('should drop source entries that are not objects with content', () => {
      const bundle = parser.normalizeSource(
        JSON.stringify({ sources: { 'A.sol': 'raw string', 'B.sol': { content: 'contract B {}' } } }),
      )
      expect(bundle.units.map(unit => unit.path)).to.deep.equal(['B.sol'])
    })

    it('should accept an already-parsed source object', () => {
      const bundle = parser.normalizeSource({ sources: { 'A.sol': { content: 'contract A {}' } } })
      expect(bundle.units).to.have.length(1)
    })

    it('should strip BOM and normalize CRLF', () => {
      const bundle = parser.normalizeSource('﻿contract A {\r\n}\r')
      expect(bundle.units[0].content).to.not.include('\r')
      expect(bundle.units[0].content.charCodeAt(0)).to.not.equal(0xfeff)
    })

    it('should return no units for empty or non-string input', () => {
      expect(parser.normalizeSource('').units).to.be.empty
      expect(parser.normalizeSource('   ').units).to.be.empty
      expect(parser.normalizeSource(null).units).to.be.empty
      expect(parser.normalizeSource(undefined).units).to.be.empty
      expect(parser.normalizeSource(42).units).to.be.empty
    })
  })

  describe('detectLanguage', () => {
    it('should trust an explicit standard JSON language', () => {
      const bundle = parser.normalizeSource(
        JSON.stringify({ language: 'Vyper', sources: { 'a.py': { content: 'x: uint256' } } }),
      )
      expect(parser.detectLanguage(bundle)).to.equal('vyper')
    })

    it('should detect from compiler version strings', () => {
      const solBundle = bundleOf({ '': 'whatever' })
      expect(parser.detectLanguage(solBundle, 'v0.8.19+commit.abcd1234')).to.equal('solidity')
      expect(parser.detectLanguage(solBundle, 'solc-0.8.19')).to.equal('solidity')
      expect(parser.detectLanguage(solBundle, 'vyper:0.3.7')).to.equal('vyper')
      // Bare semver heuristic: Solidity releases live in 0.4-0.9.
      expect(parser.detectLanguage(solBundle, '0.8.17')).to.equal('solidity')
      expect(parser.detectLanguage(solBundle, '0.3.10')).to.equal('vyper')
      expect(parser.detectLanguage(solBundle, 'zkvm-0.8.24')).to.equal('solidity')
    })

    it('should detect from file extensions', () => {
      expect(parser.detectLanguage(bundleOf({ 'a.sol': 'x' }))).to.equal('solidity')
      expect(parser.detectLanguage(bundleOf({ 'a.vy': 'x' }))).to.equal('vyper')
    })

    it('should detect from syntax when nothing else decides', () => {
      expect(parser.detectLanguage(bundleOf({ '': 'contract A { uint x; }' }))).to.equal('solidity')
      expect(parser.detectLanguage(bundleOf({ '': '# @version 0.3.10\n@external\ndef f():\n    pass' }))).to.equal(
        'vyper',
      )
    })

    it('should stay unknown for undecidable input', () => {
      expect(parser.detectLanguage(bundleOf({ '': '// Just comments\n# Some comment' }))).to.equal('unknown')
    })

    it('should let source evidence beat a bare overlapping version', () => {
      // Vyper also ships 0.4.x releases; the bare release-range heuristic must not override syntax.
      const vyperBundle = bundleOf({ '': '# pragma version 0.4.1\n@external\ndef f():\n    pass' })
      expect(parser.detectLanguage(vyperBundle, '0.4.1')).to.equal('vyper')
      const solidityBundle = bundleOf({ '': 'pragma solidity ^0.8.0;\ncontract T {}' })
      expect(parser.detectLanguage(solidityBundle, '0.3.10')).to.equal('solidity')
    })
  })

  describe('parseDocLines', () => {
    it('should treat untagged text as notice and join multiline text with one space', () => {
      const doc = parser.parseDocLines(['First line', 'second line'])
      expect(doc?.notice).to.equal('First line second line')
    })

    it('should parse params, returns, dev, and inheritdoc', () => {
      const doc = parser.parseDocLines([
        '@notice Does things.',
        '@dev Careful.',
        '@param a The first.',
        'continued.',
        '@param b The second.',
        '@return The result.',
        '@return Another result.',
        '@inheritdoc Base ignored words',
      ])
      expect(doc?.notice).to.equal('Does things.')
      expect(doc?.dev).to.equal('Careful.')
      expect(doc?.params.get('a')).to.equal('The first. continued.')
      expect(doc?.params.get('b')).to.equal('The second.')
      expect(doc?.returns).to.deep.equal(['The result.', 'Another result.'])
      expect(doc?.inheritdoc).to.equal('Base')
    })

    it('should key @custom tags by their full sub-tag name', () => {
      const doc = parser.parseDocLines([
        '@custom:security-contact security@aragon.org',
        '@custom:oz-upgrades-unsafe-allow constructor',
      ])
      expect(doc?.custom.get('security-contact')).to.deep.equal(['security@aragon.org'])
      expect(doc?.custom.get('oz-upgrades-unsafe-allow')).to.deep.equal(['constructor'])
    })

    it('should isolate unknown tags instead of bleeding them into the previous tag', () => {
      const doc = parser.parseDocLines(['@notice Creates a proposal.', '@returns The proposal id.'])
      expect(doc?.notice).to.equal('Creates a proposal.')
      expect(doc?.unknown.get('returns')).to.deep.equal(['The proposal id.'])
    })

    it('should keep inline @ (emails) as text', () => {
      const doc = parser.parseDocLines(['@notice First line', 'contact support@aragon.org for help'])
      expect(doc?.notice).to.equal('First line contact support@aragon.org for help')
      expect(doc?.unknown.size).to.equal(0)
    })

    it('should drop malformed params and keep the rest', () => {
      const doc = parser.parseDocLines(['@notice Ok.', '@param', '@param x', '@param y The y.'])
      expect(doc?.notice).to.equal('Ok.')
      expect(doc?.params.has('x')).to.be.false
      expect(doc?.params.get('y')).to.equal('The y.')
    })

    it('should keep the first non-empty value for duplicate tags', () => {
      const doc = parser.parseDocLines([
        '@notice ',
        '@notice Real one.',
        '@notice Later one.',
        '@param a First a.',
        '@param a Second a.',
      ])
      expect(doc?.notice).to.equal('Real one.')
      expect(doc?.params.get('a')).to.equal('First a.')
    })

    it('should return undefined for empty documentation', () => {
      expect(parser.parseDocLines([])).to.be.undefined
      expect(parser.parseDocLines(['', '   ', '*'])).to.be.undefined
    })

    it('should produce no documentation from tags carrying no text', () => {
      expect(parser.parseDocLines(['@notice', '@return', '@inheritdoc', '@custom:audit', '@unrecognized'])).to.be
        .undefined
    })
  })

  describe('Solidity extraction', () => {
    it('should parse contract kinds and base lists', () => {
      const parsed = parseSol(`
        contract Plain {}
        abstract contract Abs {}
        interface IThing {}
        library Lib {}
        contract Derived is Plain, IThing {}
      `)
      expect(contractOf(parsed, 'Plain').kind).to.equal('contract')
      expect(contractOf(parsed, 'Abs').kind).to.equal('abstract-contract')
      expect(contractOf(parsed, 'IThing').kind).to.equal('interface')
      expect(contractOf(parsed, 'Lib').kind).to.equal('library')
      expect(contractOf(parsed, 'Derived').parents.map(parent => parent.name)).to.deep.equal(['Plain', 'IThing'])
    })

    it('should attach single-line and block natspec with continuations', () => {
      const parsed = parseSol(`
        contract TestContract {
          /**
           * @notice This is a notice
           * @param a First parameter
           * This continues on next line
           * @param b Second parameter
           * Also continues
           */
          function test(uint a, uint b) public {}

          /// @notice First line
          /// Second line
          /// @param x Parameter description
          /// continues here
          function other(uint x) public {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      const test = declOf(contract, 'test')
      expect(test.documentation?.notice).to.equal('This is a notice')
      expect(test.documentation?.params.get('a')).to.equal('First parameter This continues on next line')
      expect(test.documentation?.params.get('b')).to.equal('Second parameter Also continues')
      const other = declOf(contract, 'other')
      expect(other.documentation?.notice).to.equal('First line Second line')
      expect(other.documentation?.params.get('x')).to.equal('Parameter description continues here')
    })

    it('should ignore ordinary comments and quad-slash comments', () => {
      const parsed = parseSol(`
        contract TestContract {
          /* This is just a regular comment
             not a natspec comment */
          function a() public {}

          // Regular line comment
          function b() public {}

          //// Quad slash is not natspec
          function c() public {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      expect(declOf(contract, 'a').documentation).to.be.undefined
      expect(declOf(contract, 'b').documentation).to.be.undefined
      expect(declOf(contract, 'c').documentation).to.be.undefined
    })

    it('should drop lone asterisk separator lines from block comments', () => {
      const parsed = parseSol(`
        contract TestContract {
          /**
           * @notice Moves tokens.
           *
           * Requirements: the caller must have a balance.
           */
          function transfer() public {}
        }
      `)
      expect(declOf(contractOf(parsed, 'TestContract'), 'transfer').documentation?.notice).to.equal(
        'Moves tokens. Requirements: the caller must have a balance.',
      )
    })

    it('should not let a no-description @param swallow the next function', () => {
      const parsed = parseSol(`
        contract TestContract {
          /// @notice Does g.
          /// @param _data
          function g(bytes _data) public {}

          /// @notice Does h.
          function h() public {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      expect(declOf(contract, 'g').documentation?.notice).to.equal('Does g.')
      expect(declOf(contract, 'h').documentation?.notice).to.equal('Does h.')
    })

    it('should not leak the block terminator when a stray @ ends on the closing line', () => {
      const parsed = parseSol(`
        contract TestContract {
          /** @notice Foo
           * contact a@b.com */
          function test() public {}
        }
      `)
      expect(declOf(contractOf(parsed, 'TestContract'), 'test').documentation?.notice).to.equal('Foo contact a@b.com')
    })

    it('should ignore comment markers, braces, and keywords inside strings', () => {
      const parsed = parseSol(`
        contract TestContract {
          function a() public {
            string memory s = "not a comment /* @notice nope */ } contract Fake {";
            string memory t = 'single } { /// @param nope';
          }

          /// @notice Real doc.
          function b() public {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      expect(parsed.contracts.map(entry => entry.name)).to.deep.equal(['TestContract'])
      expect(declOf(contract, 'b').documentation?.notice).to.equal('Real doc.')
    })

    it('should record events, errors, and constructors without treating them as functions', () => {
      const parsed = parseSol(`
        contract TestContract {
          /// @notice Emitted when something happens
          /// @param user The user address
          event SomethingHappened(address user);

          /// @notice Thrown when validation fails
          error ValidationFailed();

          /// @notice Creates a new instance
          /// @param initialValue The initial value
          constructor(uint initialValue) {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      const event = declOf(contract, 'SomethingHappened')
      expect(event.kind).to.equal('event')
      expect(event.documentation?.notice).to.equal('Emitted when something happens')
      const error = declOf(contract, 'ValidationFailed')
      expect(error.kind).to.equal('error')
      expect(error.documentation?.notice).to.equal('Thrown when validation fails')
      const ctor = contract.declarations.find(entry => entry.kind === 'constructor')
      expect(ctor?.documentation?.notice).to.equal('Creates a new instance')
      expect(ctor?.documentation?.params.get('initialValue')).to.equal('The initial value')
    })

    it('should parse parameter shapes: locations, arrays, tuples of custom types, and function types', () => {
      const parsed = parseSol(`
        contract TestContract {
          function shapes(
            address payable to,
            uint256[] memory amounts,
            bytes32[4] calldata hashes,
            My.Qualified qualified,
            function(uint256) external returns (bool) callback,
            function(uint256) external returns (bool)[] memory dynamicCallbacks,
            function(uint256) external returns (bool)[3] memory fixedCallbacks,
            uint unnamedFollows,
            bool
          ) public {}
        }
      `)
      const decl = declOf(contractOf(parsed, 'TestContract'), 'shapes')
      expect(decl.parameters).to.have.length(9)
      expect(decl.parameters[0].name).to.equal('to')
      expect(decl.parameters[1].name).to.equal('amounts')
      expect(decl.parameters[2].name).to.equal('hashes')
      expect(decl.parameters[3].name).to.equal('qualified')
      expect(decl.parameters[4].sourceType).to.equal('function')
      expect(decl.parameters[4].name).to.equal('callback')
      expect(decl.parameters[5].sourceType).to.equal('function[]')
      expect(decl.parameters[5].name).to.equal('dynamicCallbacks')
      expect(decl.parameters[6].sourceType).to.equal('function[3]')
      expect(decl.parameters[6].name).to.equal('fixedCallbacks')
      expect(decl.parameters[8].name).to.be.undefined
    })

    it('should record structs, enums, value types, and contract-like names for canonicalization', () => {
      const parsed = parseSol(`
        interface IERC20 {}
        contract TestContract {
          struct Point { uint256 x; uint256 y; }
          enum Status { Active, Inactive }
          type Price is uint128;
        }
      `)
      expect(parsed.types.structs.get('Point')).to.deep.equal(['uint256', 'uint256'])
      expect(parsed.types.structs.get('TestContract.Point')).to.deep.equal(['uint256', 'uint256'])
      expect(parsed.types.enums.has('Status')).to.be.true
      expect(parsed.types.valueTypes.get('Price')).to.equal('uint128')
      expect(parsed.types.contractLike.has('IERC20')).to.be.true
    })

    it('should derive getter arity from mappings and array dimensions', () => {
      const parsed = parseSol(`
        contract TestContract {
          /// @notice Simple value.
          uint256 public value;

          /// @notice Single mapping.
          mapping(address => uint256) public balances;

          /// @notice Nested mapping.
          mapping(address => mapping(uint256 => bool)) public flags;

          /// @notice Mapping to array.
          mapping(address => uint256[]) public history;

          /// @notice Fixed array.
          uint256[3] public slots;

          uint256 internal hidden;
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      expect(declOf(contract, 'value').parameters).to.have.length(0)
      expect(declOf(contract, 'balances').parameters.map(param => param.sourceType)).to.deep.equal(['address'])
      expect(declOf(contract, 'flags').parameters.map(param => param.sourceType)).to.deep.equal(['address', 'uint256'])
      expect(declOf(contract, 'history').parameters).to.have.length(2)
      expect(declOf(contract, 'slots').parameters).to.have.length(1)
      expect(contract.declarations.find(entry => entry.name === 'hidden')).to.be.undefined
      expect(declOf(contract, 'value').kind).to.equal('getter')
      expect(declOf(contract, 'value').documentation?.notice).to.equal('Simple value.')
    })

    it('should handle Object.prototype-like declaration names', () => {
      const parsed = parseSol(`
        contract TestContract {
          function toString() public {}
          function valueOf() public {}
          function hasOwnProperty() public {}
          function __proto__() public {}
        }
      `)
      const contract = contractOf(parsed, 'TestContract')
      for (const name of ['toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
        expect(declOf(contract, name).kind).to.equal('function')
      }
    })

    it('should recover from truncated declarations without hanging', () => {
      const truncatedContract = parseSol('pragma solidity ^0.8.0;\ncontract Foo is Bar')
      const foo = contractOf(truncatedContract, 'Foo')
      expect(foo.parents.map(parent => parent.name)).to.deep.equal(['Bar'])
      expect(foo.declarations).to.be.empty

      const truncatedFunction = parseSol('contract TestContract {\n  /// @notice Test function\n  function')
      expect(contractOf(truncatedFunction, 'TestContract').declarations).to.be.empty

      const truncatedParams = parseSol('contract T { function f(uint256 a, address')
      expect(contractOf(truncatedParams, 'T')).to.exist

      const truncatedComment = parseSol('contract T { /** @notice never closed')
      expect(contractOf(truncatedComment, 'T')).to.exist
    })

    it('should parse a large synthetic source without blowing up', () => {
      const body = Array.from(
        { length: 1500 },
        (_, i) => `  /// @notice Fn ${i}.\n  function fn${i}(uint256 a) public {}`,
      ).join('\n')
      const parsed = parseSol(`contract Big {\n${body}\n}`)
      expect(contractOf(parsed, 'Big').declarations).to.have.length(1500)
    })

    it('should parse multiple units and keep duplicate names apart', () => {
      const parsed = parser.parseBundle(
        bundleOf({
          'a/Token.sol': 'contract Token { function a() public {} }',
          'b/Token.sol': 'contract Token { function b() public {} }',
        }),
        'solidity',
      )
      expect(parsed.contracts).to.have.length(2)
      expect(parsed.contracts[0].qualifiedName).to.equal('a/Token.sol:Token')
      expect(parsed.contracts[1].qualifiedName).to.equal('b/Token.sol:Token')
    })

    it('should record imports with symbol and unit aliases', () => {
      const parsed = parseSol(
        `
        import "./Plain.sol";
        import { A, B as Bee } from "./Named.sol";
        import * as Star from "./Star.sol";
        contract T {}
      `,
        'main.sol',
      )
      const imports = parsed.imports.get('main.sol') ?? []
      expect(imports).to.have.length(3)
      expect(imports[0].path).to.equal('./Plain.sol')
      expect(imports[1].symbols).to.deep.equal([{ name: 'A' }, { name: 'B', alias: 'Bee' }])
      expect(imports[2].unitAlias).to.equal('Star')
    })
  })

  describe('Solidity recovery from malformed or exotic source', () => {
    it('should stop skipping a statement at an unbalanced closing brace', () => {
      const parsed = parseSol(`
        contract A {
          using {add} for uint256[2]
        }
      `)

      expect(contractOf(parsed, 'A').declarations).to.be.empty
    })

    it('should keep a function declared without a body or semicolon', () => {
      const parsed = parseSol(`
        contract A {
          /// @notice Declared without a terminator.
          function f() external
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Declared without a terminator.')
    })

    it('should skip a struct with no body and a struct containing a stray block', () => {
      const parsed = parseSol(`
        contract A {
          struct Missing;

          struct Stray {
            uint256 a;
            { uint256 b; }
          }

          /// @notice Still reached.
          function f() public {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Still reached.')
    })

    it('should read mapping, dotted, and array state-variable types', () => {
      const parsed = parseSol(`
        contract A {
          mapping noParenthesis;

          /// @notice Array of mappings.
          mapping(address => uint256)[2] public grid;

          /// @notice Dotted type.
          Lib.Item public item;

          /// @notice Fixed-size array.
          uint256[2] public fixedArray;
        }
      `)

      const contract = contractOf(parsed, 'A')
      expect(contract.declarations.find(entry => entry.name === 'noParenthesis')).to.be.undefined
      expect(declOf(contract, 'grid').documentation?.notice).to.equal('Array of mappings.')
      expect(declOf(contract, 'item').documentation?.notice).to.equal('Dotted type.')
      expect(declOf(contract, 'fixedArray').documentation?.notice).to.equal('Fixed-size array.')
    })

    it('should keep an overridden getter and drop a state variable with no terminator', () => {
      const parsed = parseSol(`
        contract A {
          /// @notice Overridden getter.
          uint256 public override(IFoo) count;

          uint256 public dangling
        }
      `)

      const contract = contractOf(parsed, 'A')
      expect(declOf(contract, 'count').documentation?.notice).to.equal('Overridden getter.')
      expect(contract.declarations.find(entry => entry.name === 'dangling')).to.be.undefined
    })

    it('should skip stray semicolons, stray blocks, and modifier declarations', () => {
      const parsed = parseSol(`
        contract A {
          ;

          { }

          modifier withBody() { _; }

          modifier withoutBody();

          /// @notice Declared after the noise.
          function f() public withBody {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Declared after the noise.')
    })

    it('should parse base constructor arguments and a contract without a body', () => {
      const parsed = parseSol(`
        contract Base {}

        contract Headless;

        contract Child is Base(1) {
          /// @notice Child function.
          function f() public {}
        }
      `)

      expect(contractOf(parsed, 'Headless').declarations).to.be.empty
      const child = contractOf(parsed, 'Child')
      expect(child.parents.map(parent => parent.name)).to.deep.equal(['Base'])
      expect(declOf(child, 'f').documentation?.notice).to.equal('Child function.')
    })

    it('should parse file-level enum and user-defined value type declarations', () => {
      const parsed = parseSol(`
        enum Status { Active, Closed }

        type Amount is uint256;

        contract A {
          /// @notice Uses file-level types.
          function f(Status s, Amount a) public {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Uses file-level types.')
    })

    it('should keep array dimensions on function-type parameters', () => {
      const parsed = parseSol(`
        contract A {
          /// @notice Takes callbacks.
          function f(
            function(uint256) external returns (bool) named,
            function(uint256) external,
            function() external[] dynamic,
            function() external[2] fixedSize,
            function() external[SIZE] constantSized
          ) public {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').parameters).to.deep.equal([
        { name: 'named', sourceType: 'function' },
        { name: undefined, sourceType: 'function' },
        { name: 'dynamic', sourceType: 'function[]' },
        { name: 'fixedSize', sourceType: 'function[2]' },
        // A non-literal dimension is not resolvable here, so the dimensions are dropped.
        { name: 'constantSized', sourceType: 'function' },
      ])
    })

    it('should degrade a parameter group that is only a data location', () => {
      const parsed = parseSol(`
        contract A {
          /// @notice Malformed parameter list.
          function f(uint256 a, memory) public {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').parameters).to.deep.equal([
        { name: 'a', sourceType: 'uint256' },
        { sourceType: '' },
      ])
    })

    it('should drop a getter whose mapping type is never closed', () => {
      const parsed = parseSol('contract A { mapping(address => uint256 public m; }')

      expect(contractOf(parsed, 'A').declarations).to.be.empty
    })

    it('should recover from a user-defined value type with no underlying type', () => {
      const parsed = parseSol(`
        contract A {
          type Amount is ;

          /// @notice Still reached.
          function f() public {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Still reached.')
    })

    it('should skip modifier attributes before the modifier body', () => {
      const parsed = parseSol(`
        contract A {
          modifier gated() virtual override {
            _;
          }

          /// @notice Guarded.
          function f() public gated {}
        }
      `)

      expect(declOf(contractOf(parsed, 'A'), 'f').documentation?.notice).to.equal('Guarded.')
    })

    it('should tolerate an empty trailing parameter group and nested mapping getters', () => {
      const parsed = parseSol(`
        contract A {
          /// @notice Trailing comma.
          /// @param values The values.
          function f(uint256[2] values, ) public {}

          /// @notice Nested mapping.
          mapping(address => mapping(uint256 => uint256)) public nested;
        }
      `)

      const contract = contractOf(parsed, 'A')
      expect(declOf(contract, 'f').documentation?.params.get('values')).to.equal('The values.')
      expect(declOf(contract, 'nested').parameters).to.have.length(2)
    })
  })

  describe('Vyper extraction', () => {
    it('should parse module and function docstrings', () => {
      const parsed = parseVy(`# @version 0.3.10

"""
@title Simple Storage
@notice A contract for storing a single value
"""

@external
def set_value(new_value: uint256):
    """
    @notice Update the stored value
    @param new_value The new value to store
    """
    self.value = new_value`)
      const contract = parsed.contracts[0]
      expect(contract.kind).to.equal('vyper-module')
      expect(contract.documentation?.notice).to.equal('A contract for storing a single value')
      const decl = declOf(contract, 'set_value')
      expect(decl.visibility).to.equal('external')
      expect(decl.documentation?.notice).to.equal('Update the stored value')
      expect(decl.documentation?.params.get('new_value')).to.equal('The new value to store')
    })

    it('should treat untagged docstrings as notice', () => {
      const parsed = parseVy(`@external
def act():
    """
    Just plain prose documentation.
    """
    pass`)
      expect(declOf(parsed.contracts[0], 'act').documentation?.notice).to.equal('Just plain prose documentation.')
    })

    it('should mark visibility from decorators regardless of order and support legacy @public', () => {
      const parsed = parseVy(`@view
@external
def a():
    pass

@public
def b():
    pass

@internal
def c():
    pass

def d():
    pass`)
      const contract = parsed.contracts[0]
      expect(declOf(contract, 'a').visibility).to.equal('external')
      expect(declOf(contract, 'b').visibility).to.equal('external')
      expect(declOf(contract, 'c').visibility).to.equal('internal')
      expect(declOf(contract, 'd').visibility).to.equal('internal')
    })

    it('should mark constructors for __init__ and @deploy', () => {
      const parsed = parseVy(`@external
def __init__(a: uint256):
    pass

@deploy
def constructor_like():
    pass`)
      const contract = parsed.contracts[0]
      expect(declOf(contract, '__init__').kind).to.equal('constructor')
      expect(declOf(contract, 'constructor_like').kind).to.equal('constructor')
    })

    it('should parse multiline signatures and default arguments', () => {
      const parsed = parseVy(`@external
def multi(
    a: uint256,
    b: address,
    fee: uint256 = 0
) -> bool:
    """
    @notice Multi line signature.
    """
    return True`)
      const decl = declOf(parsed.contracts[0], 'multi')
      expect(decl.documentation?.notice).to.equal('Multi line signature.')
      expect(decl.parameters.map(param => param.name)).to.deep.equal(['a', 'b', 'fee'])
      expect(decl.parameters[2].hasDefault).to.be.true
    })

    it('should not treat # or ## comments as NatSpec', () => {
      const parsed = parseVy(`# @version 0.3.10

## @notice Not natspec in Vyper
# regular comment
@external
def approve(spender: address, amount: uint256):
    pass`)
      expect(declOf(parsed.contracts[0], 'approve').documentation).to.be.undefined
    })

    it('should derive public storage getters including HashMap and arrays', () => {
      const parsed = parseVy(`value: public(uint256)
balances: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])
holders: public(DynArray[address, 100])
slots: public(uint256[3])
hidden: uint256`)
      const contract = parsed.contracts[0]
      expect(declOf(contract, 'value').parameters).to.have.length(0)
      expect(declOf(contract, 'balances').parameters.map(param => param.sourceType)).to.deep.equal(['address'])
      expect(declOf(contract, 'allowance').parameters.map(param => param.sourceType)).to.deep.equal([
        'address',
        'address',
      ])
      expect(declOf(contract, 'holders').parameters.map(param => param.sourceType)).to.deep.equal(['uint256'])
      expect(declOf(contract, 'slots').parameters).to.have.length(1)
      expect(contract.declarations.find(entry => entry.name === 'hidden')).to.be.undefined
    })

    it('should record structs and interfaces for type resolution', () => {
      const parsed = parseVy(`struct Point:
    x: uint256
    y: uint256

interface IERC20:
    def transfer(to: address, amount: uint256) -> bool: nonpayable

@external
def use(p: Point, token: IERC20):
    pass`)
      expect(parsed.types.structs.get('Point')).to.deep.equal(['uint256', 'uint256'])
      expect(parsed.types.contractLike.has('IERC20')).to.be.true
      expect(declOf(parsed.contracts[0], 'use').parameters.map(param => param.sourceType)).to.deep.equal([
        'Point',
        'IERC20',
      ])
    })

    it('should not truncate signatures at # inside default string values', () => {
      const parsed = parseVy(`@external
def pay(memo: String[32] = "tag #1", amount: uint256 = 0):
    """
    @notice Pays.
    """
    pass`)
      const decl = declOf(parsed.contracts[0], 'pay')
      expect(decl.parameters).to.have.length(2)
      expect(decl.documentation?.notice).to.equal('Pays.')
    })

    it('should degrade safely on malformed docstrings and deferred syntax', () => {
      const parsed = parseVy(`import lib

exports: (
    lib.thing,
)

@external
def ok():
    """
    @notice Still parsed.
    """
    pass

@external
def broken():
    """ never closed`)
      expect(declOf(parsed.contracts[0], 'ok').documentation?.notice).to.equal('Still parsed.')
      expect(parsed.contracts[0].declarations.find(entry => entry.name === 'broken')).to.exist
    })

    it('should produce no module for empty or undocumented-empty units', () => {
      expect(parseVy('').contracts).to.be.empty
      expect(parseVy('# only a comment').contracts).to.be.empty
    })
  })
})
