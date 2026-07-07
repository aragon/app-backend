# Contract NatSpec parsing (`contractNetspec.ts`)

## What this module is for

When we decode a transaction action against a contract, we want to show the user a
human-readable description of the function and its arguments. Solidity/Vyper source carries
that description as **NatSpec** doc-comments (`@notice`, `@param`, `@dev`, `@inheritdoc`, …).

This module takes the **verified source code** of a contract (as returned by a block explorer),
parses its NatSpec, and produces, for every function in the contract's **ABI**, a `notice`
string plus a per-input `notice`. `decodeAction.ts` calls `parseNetspec` and copies those
strings onto the decoded action.

Input we get is messy: source is hand-written, multi-file, sometimes truncated, and functions
can be **overloaded** (same name, different arguments) or **inherited** (documented in a parent
via `@inheritdoc`). Most of the complexity here exists to handle those three realities.

## Top-level entry point

```
parseNetspec(SourceCode, ContractName, ABI, CompilerType)
```

Pipeline:

1. **`parseSourceCode(SourceCode)`** — the explorer returns either raw source or a JSON blob of
   `{ sources: { "File.sol": { content } } }`. This normalizes both into one source string.
2. **`extractNatSpec(parsedSource, CompilerType)`** — walks the source and builds a map:
   `Record<contractName, NatspecContract>`. This is the parser proper (see below).
3. **`collapseNatspec(map, ContractName)`** — flattens the inheritance tree for the target
   contract, so functions documented only in a base contract are visible on the child.
4. **`ABI.map(...)`** — for each ABI function, pick the NatSpec entry that matches it (overload
   resolution) and copy `notice` + per-param `notice` onto the action.

## Data model

```ts
NatspecContract {
  name
  superClasses            // base contracts, for collapseNatspec
  details:   Record<functionName, NatspecDetails>   // ONE entry per name (last declared wins)
  overloads?: Record<functionName, NatspecDetails[]> // ALL entries when a name repeats
}

NatspecDetails {
  keyword    // 'function' | 'event' | 'error' | 'constructor' | ...
  name       // function name
  tags: {
    notice?: string
    param?:  Record<paramName, string>   // note: an OBJECT keyed by param name
    return?: string
    inheritdoc?: string                  // the parent contract/interface name
    [unknownTag]: string                 // e.g. a mistyped `@returns`, `@custom:x`, ...
  }
}
```

Key point: `details[name]` only ever holds **one** entry per name (the last one parsed). When a
name appears more than once (function overloads, or a `function`/`event` sharing a name), every
occurrence is *also* pushed into `overloads[name]`. Overload resolution reads from `overloads`;
everything else reads from `details`.

## The scanner: `scanNatspecBlock`

This is the low-level routine that reads a single doc-comment block and fills in one
`NatspecDetails.tags`. It scans character-by-character using two helpers:

- **`scanFirst(str, start, searches)`** — returns `[matchedString, posAfterMatch]` for whichever
  of the `searches` occurs first. Note the position is **after** the match.
- **`scanWord(str, pos)`** — reads up to the next delimiter (`space ( : \n \t \r`) and returns the
  word plus the delimiter position.

### How a block is read

The loop repeatedly scans for the next `@`, newline, or the block terminator (`*/` for `/** */`,
empty string for `///` lines):

- **`@` + a known tag** (`KNOWN_NATSPEC_TAGS`): read the tag body up to the next newline/terminator
  and store it. For `@param` the body's first word is the parameter name, and the value is stored
  as `tags.param[paramName]`. For everything else it's `tags[tag] = body`.
- **newline**: the following line is treated as a **continuation** of the current tag (multi-line
  NatSpec), appended via `appendContinuation`.
- **terminator**: end the block.

### `appendContinuation`

Continuation lines are joined with a **single space** (not a newline), and cosmetic `* ` / lone
`*` prefixes from `/** */` blocks are stripped. So:

```
/// @notice First line
/// second line
```

becomes `notice = "First line second line"`. (Older code joined with `\n`; several tests were
updated to reflect the space join.)

### The `@`-but-not-a-known-tag branch (the subtle part)

A `@` in source is not always a tag. Two very different cases share the `@` character:

1. A **mistyped or nonstandard tag at the start of a line** — `@returns` (should be `@return`),
   `@audit`, `@custom`-style annotations.
2. A **stray `@` inside prose** — an email address like `contact support@aragon.org`.

We disambiguate by looking at what precedes the `@` on its line (`before`, with whitespace and
comment markers stripped):

- **`before` is empty → it's a tag.** Store its text under its **own key** (`tags[unknownTag]`)
  so it can't pollute the previous tag, and make subsequent continuation lines attach to it.
  This is why `@returns The id.` after `@notice Creates a proposal.` does *not* end up glued onto
  the notice.
- **`before` has prose → it's inline text.** Append the whole line to the current tag as a
  continuation (the email case).

Also in this branch: `scanFirst` returns the position **after** the terminator, so when a stray
`@` sits on the same line as the closing `*/`, we subtract `terminator.length` before slicing —
otherwise a literal `*/` leaks into the captured text.

> Whitespace note: `@param name` uses `skipInlineWhitespace` (spaces/tabs only, not newlines) to
> find the description, so a `@param` with no inline description cannot swallow the next line /
> next function's doc.

## Inheritance: `collapseNatspec`

A child contract's ABI includes functions it inherits from base contracts, but the docs for those
functions live in the base's `NatspecContract`. `collapseNatspec` walks `superClasses` (depth-first,
recursively) and merges base `details` and `overloads` down into the target contract, so every
inherited function is documented on the child.

It also resolves inline `@inheritdoc` for the simple (non-overloaded) case: an entry whose only
documentation is `@inheritdoc Parent` inherits `Parent`'s tags for that function name.

## Overload resolution (the ABI-matching step)

A single function *name* in the ABI can correspond to several source entries (overloads). We must
pick the source entry that documents the **specific signature** of the ABI item. This is what the
last group of helpers does.

### `scoreParamMatch(details, inputs)`

Scores how well a NatSpec entry fits a set of ABI inputs:

- **+1** for each ABI input name that appears in the entry's `@param` tags.
- **+0.5** tie-breaker when the entry documents **exactly as many** params as the ABI item has
  inputs — *including the zero/zero case* (a `@param`-less entry documents 0 params, which is the
  right match for a no-argument overload).

### `pickBestOverload(entries, …, inputs)`

Resolves each candidate against `@inheritdoc`, scores it with `scoreParamMatch`, and returns the
highest scorer. Ties are broken by declaration order via a strict `>` (first candidate wins), so
callers order the candidate list deliberately (see below).

### `resolveInheritdoc(natspec, name, details, inputs)`

Follows an entry's `@inheritdoc Parent` to the parent's documentation, with:

- a **cycle guard** (`seen` set) so `A → B → A` can't loop forever,
- **multi-level chains** (parent's own `@inheritdoc` is followed recursively),
- **overload awareness**: if the parent is *itself* overloaded, it picks the parent overload whose
  params best match `inputs` (not just the last-declared one).

Resolved tags are `{ ...parentTags, ...ownTags }` (own tags win), with `inheritdoc` removed.

### `pickOverloadDetails(natspec, collapsed, action)` — the entry point per ABI item

Builds the candidate pool and delegates to `pickBestOverload`. The pool construction matters:

```
candidates = [collapsed.details[name]  (if it is a function)] ++ overloads[name] (functions only)
```

- `collapsed.details[name]` is placed **first** so that when a child re-declares just one overload
  with a fresh doc — which lives only in `details`, never in the parent-sourced `overloads` map —
  it **wins the tie** against the stale parent entry for the same signature.
- It is skipped when it is **not a function** (e.g. an `event Deposit` shadowing `function Deposit`
  in `details`; the event must never be attached to the function).
- With 0 candidates we fall back to `details[name]`; with exactly 1 we return it directly (this is
  what makes the single-function/same-name-event case return the function).

## Edge cases locked down by tests (`test/unit/helpers/contractNetspec.spec.ts`)

| Test tag | Guards against |
|----------|----------------|
| APP-822        | Attaching the wrong overload's doc to an ABI function |
| APP-822 #1     | `@inheritdoc` resolving to the wrong parent overload |
| APP-822 #2     | Overloads inherited from a base (not redeclared) mis-disambiguated |
| #3             | A no-inline-description `@param` swallowing the next function |
| #4             | A stray `@` in prose (email) being treated as a tag |
| #5             | Lone `*` separator lines leaking into a notice |
| #6             | A zero-arg overload getting a same-name overload's notice |
| #7             | A child override losing to the inherited parent doc |
| #8             | An `event` doc being attached to a same-name `function` |
| #9             | An unknown/mistyped tag (`@returns`) bleeding into the previous tag |
| #10            | The block-comment terminator (`*/`) leaking into a notice |

## `decodeAction.ts` interaction

`parseContractNetspec` matches a contract function **by its 4-byte selector**, so the caller must
pass the **full canonical signature** (`setMetadata(bytes)`), never the bare name (`setMetadata`) —
a bare name never hashes to the right selector and enrichment silently returns `null`. That is why
`_parseUpdateDaoMetadata` forwards `decodedData.textSignature ?? decodedData.function`.
