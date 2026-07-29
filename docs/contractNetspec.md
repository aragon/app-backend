# Contract NatSpec parsing (`src/helpers/contractNetspec/`)

## What this module is for

When we decode a transaction action against a contract, we want to show the user a human-readable
description of the function and its arguments. Solidity/Vyper source carries that description as
**NatSpec** doc-comments (`@notice`, `@param`, `@dev`, `@inheritdoc`, …).

This module takes the **verified source code** of a contract (as returned by a block explorer),
parses its NatSpec, and produces, for every callable function in the contract's **ABI**, a
`notice` string plus a per-input `notice`. `decodeAction.ts`, `decoderLight.ts`, and the gateway's
`contractInfo.ts` call `parseNetspec` and copy those strings onto their responses.

Input is messy: source is hand-written, multi-file, sometimes truncated or mangled by the
explorer, and functions can be **overloaded** (same name, different arguments) or **inherited**
(documented in a parent, possibly via `@inheritdoc`). Most of the design below exists to handle
those realities without ever throwing.

> **Migration status:** `@helpers/contractNetspec` resolves to this pipeline
> (`src/helpers/contractNetspec/index.ts`), so `decodeAction`, `decoderLight`, and the gateway's
> `contractInfo` all use it. The previous implementation is retained unchanged as
> `src/helpers/contractNetspecLegacy.ts` (covered by `contractNetspecLegacy.spec.ts`) for
> comparison and rollback; nothing in production imports it. To roll back, rename it over
> `contractNetspec.ts` — a file wins over a directory index in Node resolution — or point the
> three consumers at `@helpers/contractNetspecLegacy`.

## Public API

```ts
parseNetspec(sourceCode, contractName, abi, compilerVersion?) => enriched ABI
```

Defined (not re-exported) in `index.ts` — under CommonJS a re-export compiles to a getter-only
property that Sinon cannot stub, and the consumer test suites stub `parseNetspec` on this module's
namespace object.

Guarantees:

- Synchronous, dependency-free, and throw-free: any parsing failure returns the ABI without new
  documentation. A non-array ABI returns `[]`.
- Never mutates the input ABI or its input objects.
- Enriches only callable functions (including generated public-variable getters) — never
  constructors, events, errors, fallback, or receive entries.
- Preserves an existing `notice` unless a non-empty resolved value replaces it.
- Attaches parameter notices **by position**, so unnamed ABI inputs and renamed override
  parameters still get documentation.

## Pipeline

```
normalizeSource → detectLanguage → parseBundle → resolveTargetContract → resolveAbiFunctionDoc → enrich
      (parser.ts)                      (parser.ts)              (resolver.ts)                    (index.ts)
```

### 1. Source normalization (`parser.normalizeSource`)

Explorer payloads arrive as raw source, standard compiler JSON (`{ language, sources, settings }`),
Etherscan's double-brace `{{ … }}` wrapper, a bare `{ "File.sol": { content } }` map, or an
already-parsed object. All forms normalize into a `SourceBundle`:

```ts
SourceBundle { language, units: SourceUnit[], compilationTarget? }
SourceUnit   { path, content, order }
```

Source units are **never concatenated**; paths and insertion order are preserved, BOM/CRLF are
cleaned, Yul units and entries without string content are skipped, and invalid JSON falls back to
raw-source treatment.

### 2. Language selection (`parser.detectLanguage`)

Precedence: standard-JSON `language` → explicitly labelled compiler strings (`vyper`, `solc`,
`solidity`, a commit marker) → file extensions → syntax scoring → the bare release-range heuristic
(`0.4–0.9` → Solidity, other bare semver → Vyper) **last**, because Solidity and Vyper version
ranges overlap. Still undecidable → `index.ts` parses with both parsers and keeps the result that
contains the target contract or covers the ABI best; a tie returns the ABI unchanged.

### 3. Parsing (`parser.parseBundle`)

A character-level lexer tokenizes each Solidity unit (strings, comments, and NatSpec blocks are
first-class, so `contract` inside a string or `@notice` inside a regular comment never confuses
parsing; an unterminated quote degrades to punctuation instead of swallowing the line). On top of
the token stream a declaration parser extracts the internal model:

```ts
ContractDocumentation   { id, name, qualifiedName, sourceUnit, kind, parents, declarations, documentation?, sourceOrder }
DeclarationDocumentation{ kind, name?, parameters, visibility?, documentation?, sourceOrder, sourceUnit, container? }
SourceParameter         { name?, sourceType, hasDefault? }
ParsedDocumentation     { notice?, dev?, params: Map, returns: [], inheritdoc?, custom: Map, unknown: Map }
```

Declaration arrays are the single source of truth — there is no name-keyed `details`/`overloads`
dual representation; all indexes are derived in the resolver.

Captured per unit: imports (with symbol and unit aliases), contracts/interfaces/libraries and
their base lists, functions/constructors/fallback/receive/events/errors, public state variables
(as `getter` declarations whose arity derives from mapping keys and array dimensions), and the
type definitions needed for canonicalization (structs, enums, user-defined value types,
contract-like names).

Type definitions register under unit-scoped keys and plain names, but **only while every
definition of a key agrees** — colliding names (two `Point` structs in different files, or in two
contracts of one file) become *ambiguous* and stop resolving unscoped. Each declaration carries
its `container` contract so lookups prefer the declaring contract's own types.

NatSpec text rules: only `///` and `/** … */` are documentation (Vyper: triple-quoted docstrings;
`#`/`##` never are); a tag must begin the logical line, so emails and inline `@` stay prose;
untagged text becomes `@notice`; multiline text joins with one space; `@custom:<name>` keeps its
full key; unknown tags (e.g. `@returns`) are isolated and never bleed into the notice; malformed
`@param` entries are dropped without discarding the block; block terminators never leak.

The Vyper parser is line-based: module docstrings, decorated `def`s (multiline signatures,
`@external`/legacy `@public`/`@deploy`, `__init__` constructors), function docstrings, public
storage getters (`HashMap`/arrays/`DynArray`), structs, and interfaces. `#` comment stripping is
string-aware. Internal functions are recorded but never enrich the ABI.

**Module exports.** In Vyper ≥0.4 an imported module's external functions reach the target ABI only
when re-exported, so that relationship — not inheritance — is what makes them callable. The parser
records `import mod [as alias]`, `from pkg import mod [as alias]`, and `exports:` in single,
parenthesised and multi-line forms; the resolver maps each `alias.member` back to its source unit
(dotted paths, relative paths and `.vyi` included) and contributes that declaration as a candidate.
`module.__interface__` re-exports every external member. Only `external` functions and public
getters qualify, an imported-but-not-exported function contributes nothing, and the target module's
own declaration always outranks a re-exported one.

### 4. Resolution (`resolver.ts`)

**Target contract**: compilation target path+name → qualified `unit:Name` → unique simple name →
greatest ABI coverage among duplicates → stable source order. With no name match at all, only a
unique non-zero-coverage contract may stand in.

**Inheritance**: parent references resolve same-unit → symbol alias → unit alias → imported
symbol → unique global name, with `./`/`../` import paths joined against the importing file's
directory. Resolved graphs linearize with Solidity-compatible C3 (reversed base list, most-derived
first); cycles and unresolvable merges degrade to a visited-set DFS and never recurse forever.

**Candidate matching** for each ABI function, over the linearization:

1. Same name, kind `function`/`getter`, not internal/private, matching arity (a Vyper declaration
   with trailing defaults matches every valid shorter arity by trimming trailing parameters).
2. Same-signature candidates shadow: the most-derived wins; inside one contract the last
   declaration wins (legacy tie behavior).
3. Ranking: fewest type mismatches → most exact canonical-type matches → `internalType` name
   agreement → parameter-name agreement → nearest in linearization → last in source order.

Types canonicalize to their ABI form (`uint`→`uint256`, `address payable`→`address`, contract →
`address`, enum → `uint8`, UDVT → underlying, struct → recursive tuple, arrays preserved).
Lookups are scoped: declaring contract → source unit → explicit imports → contract-qualified
global → plain global, and an unknown or ambiguous type is *neutral evidence*, never a mismatch —
that keeps struct-heavy source from being unfairly penalized when the ABI has no `components`.

**Documentation inheritance.** Solidity's rules are the starting point, but this module documents
a *deployed* ABI for humans rather than compiling it, so where solc would drop text or demand an
explicit override, we resolve deterministically instead. Every rule below can only ever fill a slot
that is otherwise empty — a local tag always wins. These deviations are not cosmetic: they were
each forced by a measured regression against ~1,990 verified mainnet contracts (see *Validation*).

- A documented declaration uses its own tags.
- Explicit `@inheritdoc Base` copies missing tags from the base declaration with the same callable
  signature (never across arities); local tags win; parent params map by position, so renamed
  override parameters keep their docs; chains and cycles use a visited set; a missing or ambiguous
  parent leaves local documentation intact.
- Automatic inheritance is **tag-level, not all-or-nothing**. An implementation that carries only
  `@dev` (the ubiquitous OpenZeppelin shape, where the interface documents `@notice`/`@param` and
  the override explains mechanics) still inherits the tags it omits. Strict all-or-nothing dropped
  267 real fields.
- Inheritance maps parameters **by position**, not by name — an override that renames a parameter
  keeps the base's text, since the signature already matches exactly.
- When several independent bases document the same signature, the **nearest in linearization
  order** wins rather than the whole docstring being discarded.
- If nothing in the inheritance chain documents the function, a last-resort **bundle-wide
  fallback** fills empty slots from same-name, same-signature declarations elsewhere in the source
  (typically a library the contract forwards to), and only when every such declaration agrees on
  the text.
- If the stored ABI and the verified source disagree on arity — routine with partially verified
  sources — matching degrades to same-name declarations and resolves each parameter **by ABI input
  name** instead of position.

### 5. Enrichment (`index.ts`)

Each ABI `function` item gets `notice` (only when non-empty) and per-input `notice` values by
position. Untouched items are returned by reference, so a `deep.equal` against the input holds
for everything that didn't resolve.

## Tests

```
test/unit/helpers/contractNetspec/index.spec.ts     # public API + end-to-end enrichment (APP-822 regressions live here)
test/unit/helpers/contractNetspec/parser.spec.ts    # normalization, language detection, lexing, Solidity + Vyper extraction
test/unit/helpers/contractNetspec/resolver.spec.ts  # canonicalization, C3, overloads, inheritance, target resolution
```

The specs import parser/resolver internals directly; those symbols are intentionally not exported
from the public index.

## Validation against production data

The rewrite was validated differentially against every verified contract in the dev database
(1,992 contracts, 29,392 ABI functions, 65,276 notice/parameter fields), running the legacy parser
and this pipeline over identical inputs and comparing field by field.

| Result | Count |
|---|---|
| identical | 55,860 (85.6%) |
| newly documented (legacy empty) | 8,712 |
| text differs | 682 |
| documentation lost | **22** — all of them legacy artifacts, see below |
| contracts where legacy hangs forever | **1** |
| contracts where this parser hangs | **0** |

Total parse time over the corpus dropped from ~14.1s to ~2.7s.

**Attribution rule.** Documentation may only come from a declaration the target actually inherits
(or, in Vyper, explicitly re-exports) whose signature matches exactly. Legacy resolved names flatly
across the whole source, which is why it sometimes produced text for declarations that have none —
and why it could attach an unrelated library's comment to a contract function. For a
transaction-decoding UI, wrong text is worse than absent text, so no relationship means no
documentation.

**Legacy hangs on `MiniMeToken`** (`0x298B…6d41`, polygon-mainnet, solc 0.4.24): an infinite loop
that pegs a core at 100% indefinitely. The new parser completes the same contract in 12 ms. Any
decode path reaching that contract would wedge a worker.

The 22 remaining "lost" fields are all cases where legacy emitted text belonging to a *different
declaration*, which this parser deliberately does not reproduce. Each was traced back to source:

- `LockV1_2_0.supportsInterface` (×5) showed *"Whitelisted contracts that are allowed to transfer"* —
  the NatSpec of the `whitelisted` state variable. Legacy never parsed state variables, so their
  docs floated onto the next function it recognised.
- `PositionManager.tokenURI` showed *"Enforces that the PoolManager is locked."* — the NatSpec of
  the `onlyIfPoolManagerLocked` **modifier**. Legacy does not parse modifiers, so the comment
  leaked to the following function.
- `Vault.deleteAsset` / `setConverter` / `updateAsset` (8 fields) were documented on `library
  VaultLib`, which `contract Vault is IVault, ERC20PermitUpgradeable, OwnableUpgradeable` does not
  inherit — the contract merely forwards to it, and solc emits no userdoc for those entries either.
- `MYieldToOneForcedTransfer.initialize` (7 fields) has a verified source declaring **8**
  parameters against a stored ABI with **7** (partial verification), so no signature matches.

The same class of leak explains most of the 682 changed fields, e.g. every `pluginType()` in the
Aragon plugins reported *"This ensures that the initialize function cannot be called during the
upgrade process."* (the `onlyCallAtInitialization` modifier) instead of its real
`@inheritdoc IPlugin` text, *"Returns the plugin's type"*.

## Intentional differences from the legacy module

- `/** @notice Short notice */` no longer leaks the `*/` terminator.
- `notice: undefined` is never written; pre-existing notices survive when nothing resolves.
- Parameter notices attach positionally instead of by ABI input name.
- Public-variable getters are now documented (the legacy parser never captured them).
- Internal/private functions can no longer masquerade as ABI candidates.
