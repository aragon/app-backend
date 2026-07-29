/**
 * Resolution half of the NatSpec pipeline: picks the target contract, linearizes inheritance
 * (Solidity-compatible C3), matches ABI functions against source declarations, and resolves
 * documentation through explicit `@inheritdoc` and automatic inheritance rules.
 */

import type { AbiInputLike, AbiItemLike, ResolutionContext, ResolvedFunctionDocumentation, TypeScope } from '@types'
import {
  type ContractDocumentation,
  type DeclarationDocumentation,
  hasDocumentation,
  type ParsedBundle,
  type SourceBundle,
  scopedTypeKey,
} from './parser'

export type { AbiInputLike, AbiItemLike, ResolutionContext, ResolvedFunctionDocumentation, TypeScope } from '@types'

interface PositionalDoc {
  notice?: string
  paramNotices: (string | undefined)[]
}

interface Candidate {
  decl: DeclarationDocumentation
  owner: ContractDocumentation
  ci: number
}

const KEY_SEPARATOR = String.fromCharCode(0)

const unitNameKey = (unit: string, name: string): string => `${unit}${KEY_SEPARATOR}${name}`

const declScope = (decl: DeclarationDocumentation): TypeScope => ({
  unit: decl.sourceUnit,
  container: decl.container,
})

// ===================== Contract lookup =====================

interface BundleLookups {
  byName: Map<string, ContractDocumentation[]>
  byUnitAndName: Map<string, ContractDocumentation>
  linearizations: Map<string, ContractDocumentation[]>
}

const lookupCache = new WeakMap<ParsedBundle, BundleLookups>()

function lookups(parsed: ParsedBundle): BundleLookups {
  let cached = lookupCache.get(parsed)
  if (cached) return cached
  const byName = new Map<string, ContractDocumentation[]>()
  const byUnitAndName = new Map<string, ContractDocumentation>()
  for (const contract of parsed.contracts) {
    const list = byName.get(contract.name) ?? []
    list.push(contract)
    byName.set(contract.name, list)
    const unitKey = unitNameKey(contract.sourceUnit, contract.name)
    if (!byUnitAndName.has(unitKey)) byUnitAndName.set(unitKey, contract)
  }
  cached = { byName, byUnitAndName, linearizations: new Map() }
  lookupCache.set(parsed, cached)
  return cached
}

/** Join a `./` or `../` import path against the directory of the importing unit. */
function joinRelative(fromUnit: string, importPath: string): string | undefined {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) return undefined
  const parts = fromUnit.split('/').slice(0, -1)
  for (const segment of importPath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (!parts.length) return undefined
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

function resolveImportPath(parsed: ParsedBundle, fromUnit: string, importPath: string): string | undefined {
  const relative = joinRelative(fromUnit, importPath)
  if (relative !== undefined && parsed.units.includes(relative)) return relative
  if (parsed.units.includes(importPath)) return importPath
  const cleaned = importPath.replace(/^(\.\.?\/)+/, '')
  const bySuffix = parsed.units.filter(unit => unit === cleaned || unit.endsWith(`/${cleaned}`))
  if (bySuffix.length === 1) return bySuffix[0]
  const base = importPath.split('/').pop()
  if (!base) return undefined
  const byBase = parsed.units.filter(unit => unit.split('/').pop() === base)
  return byBase.length === 1 ? byBase[0] : undefined
}

/**
 * Resolve a contract reference in order: same source unit, explicit symbol alias, unit alias,
 * explicit imported symbol, unique global simple-name match; unresolved when still ambiguous.
 */
export function resolveContractReference(
  parsed: ParsedBundle,
  fromUnit: string,
  name: string,
): ContractDocumentation | undefined {
  if (!name) return undefined
  const { byName, byUnitAndName } = lookups(parsed)

  const direct = byUnitAndName.get(unitNameKey(fromUnit, name))
  if (direct) return direct

  const unitImports = parsed.imports.get(fromUnit) ?? []
  const dotted = name.split('.')
  if (dotted.length === 2) {
    for (const imp of unitImports) {
      if (imp.unitAlias !== dotted[0]) continue
      const unitPath = resolveImportPath(parsed, fromUnit, imp.path)
      if (unitPath === undefined) continue
      const hit = byUnitAndName.get(unitNameKey(unitPath, dotted[1]))
      if (hit) return hit
    }
  }
  for (const imp of unitImports) {
    for (const symbol of imp.symbols) {
      if ((symbol.alias ?? symbol.name) !== name) continue
      const unitPath = resolveImportPath(parsed, fromUnit, imp.path)
      if (unitPath !== undefined) {
        const hit = byUnitAndName.get(unitNameKey(unitPath, symbol.name))
        if (hit) return hit
      }
      const global = byName.get(symbol.name)
      if (global?.length === 1) return global[0]
    }
  }

  // A qualified reference (`Alias.Base`) that its qualifier could not resolve stays unresolved:
  // stripping the qualifier would bind it to an unrelated same-named contract elsewhere in the
  // bundle, which is exactly the kind of silent misattribution this pipeline must not make.
  if (dotted.length > 1) return undefined
  const bySimple = byName.get(name)
  return bySimple?.length === 1 ? bySimple[0] : undefined
}

// ===================== Inheritance linearization =====================

function c3Merge(sequences: ContractDocumentation[][]): ContractDocumentation[] | undefined {
  const seqs = sequences.map(seq => [...seq]).filter(seq => seq.length)
  const tailCount = new Map<string, number>()
  let remaining = 0
  for (const seq of seqs) {
    remaining += seq.length
    for (let i = 1; i < seq.length; i++) tailCount.set(seq[i].id, (tailCount.get(seq[i].id) ?? 0) + 1)
  }

  const result: ContractDocumentation[] = []
  while (remaining > 0) {
    let head: ContractDocumentation | undefined
    for (const seq of seqs) {
      if (!seq.length) continue
      if ((tailCount.get(seq[0].id) ?? 0) === 0) {
        head = seq[0]
        break
      }
    }
    if (!head) return undefined
    result.push(head)
    for (const seq of seqs) {
      if (seq[0]?.id !== head.id) continue
      seq.shift()
      remaining--
      // Whatever moved into head position is no longer part of a tail.
      if (seq.length) tailCount.set(seq[0].id, (tailCount.get(seq[0].id) ?? 1) - 1)
    }
  }
  return result
}

export function linearizeContract(
  parsed: ParsedBundle,
  contract: ContractDocumentation,
  visiting: Set<string> = new Set(),
  stats: { cuts: number } = { cuts: 0 },
): ContractDocumentation[] {
  const { linearizations } = lookups(parsed)
  const cached = linearizations.get(contract.id)
  if (cached) return cached
  if (visiting.has(contract.id)) {
    stats.cuts++ // cycle: cut here, never recurse indefinitely
    return [contract]
  }

  visiting.add(contract.id)
  const cutsBefore = stats.cuts
  const parents = contract.parents
    .map(parent => resolveContractReference(parsed, contract.sourceUnit, parent.name))
    .filter((parent): parent is ContractDocumentation => !!parent && parent.id !== contract.id)
  const parentLinearizations = parents.map(parent => linearizeContract(parsed, parent, visiting, stats))
  visiting.delete(contract.id)

  // Solidity reverses the base list before merging (most-derived wins ties).
  const merged = c3Merge([...parentLinearizations].reverse().concat([[...parents].reverse()]))
  const out: ContractDocumentation[] = [contract]
  const seen = new Set([contract.id])
  for (const entry of merged ?? parentLinearizations.flat()) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id)
      out.push(entry)
    }
  }
  // Safe to memoize whenever no cycle was cut inside this subtree — a cut result is only valid for
  // the path that produced it. Caching mid-descent is what keeps repeated bases (diamonds) linear.
  if (stats.cuts === cutsBefore) linearizations.set(contract.id, out)
  return out
}

/** Resolve a dotted Vyper module path (`lib.ownable`) to a source unit in the bundle. */
function resolveVyperModuleUnit(parsed: ParsedBundle, fromUnit: string, dottedPath: string): string | undefined {
  const relative = dottedPath.replace(/^\.+/, '').replace(/\./g, '/')
  const leadingDots = /^\.+/.exec(dottedPath)?.[0].length ?? 0
  const candidates: string[] = []
  if (leadingDots > 0) {
    const base = fromUnit.split('/').slice(0, Math.max(0, fromUnit.split('/').length - leadingDots))
    candidates.push([...base, relative].filter(Boolean).join('/'))
  }
  const fromDir = fromUnit.split('/').slice(0, -1)
  candidates.push([...fromDir, relative].filter(Boolean).join('/'), relative)

  for (const candidate of candidates) {
    for (const suffix of ['.vy', '.vyi', '']) {
      const hit = parsed.units.find(unit => unit === `${candidate}${suffix}`)
      if (hit !== undefined) return hit
    }
  }
  const base = relative.split('/').pop()
  if (!base) return undefined
  const byBase = parsed.units.filter(unit => (unit.split('/').pop() ?? '').replace(/\.vyi?$/, '') === base)
  return byBase.length === 1 ? byBase[0] : undefined
}

/**
 * Collect the declarations a Vyper module re-exports. Only external functions and public getters of
 * the imported module qualify — internal helpers never enter the ABI, exported or not.
 */
function collectVyperExports(
  parsed: ParsedBundle,
  target: ContractDocumentation,
): { decl: DeclarationDocumentation; owner: ContractDocumentation }[] {
  const refs = parsed.exports.get(target.sourceUnit)
  if (!refs?.length) return []
  const imports = parsed.imports.get(target.sourceUnit) ?? []
  const collected: { decl: DeclarationDocumentation; owner: ContractDocumentation }[] = []

  for (const ref of refs) {
    const imported = imports.find(entry => entry.unitAlias === ref.alias)
    // An `exports:` entry may also name a module imported under its own name.
    const path = imported?.path ?? ref.alias
    const unit = resolveVyperModuleUnit(parsed, target.sourceUnit, path)
    if (unit === undefined) continue
    const module = parsed.contracts.find(contract => contract.sourceUnit === unit)
    if (!module || module.id === target.id) continue
    for (const decl of module.declarations) {
      if (decl.kind !== 'function' && decl.kind !== 'getter') continue
      if (decl.visibility !== 'external') continue
      // `module.__interface__` re-exports every external member of the module.
      if (ref.member !== '__interface__' && decl.name !== ref.member) continue
      collected.push({ decl, owner: module })
    }
  }
  return collected
}

export function createResolutionContext(parsed: ParsedBundle, target: ContractDocumentation): ResolutionContext {
  const linearization = linearizeContract(parsed, target)
  return {
    parsed,
    target,
    linearization,
    linearizationIndex: new Map(linearization.map((contract, index) => [contract.id, index])),
    exported: parsed.language === 'vyper' ? collectVyperExports(parsed, target) : [],
  }
}

// ===================== Type canonicalization =====================

const ELEMENTARY = /^(address|bool|string|function|bytes([0-9]+)?|u?int([0-9]+)?|u?fixed([0-9]+x[0-9]+)?)$/

function normalizeElementaryName(base: string): string {
  if (base === 'uint') return 'uint256'
  if (base === 'int') return 'int256'
  if (base === 'byte') return 'bytes1'
  if (base === 'fixed') return 'fixed128x18'
  if (base === 'ufixed') return 'ufixed128x18'
  return base
}

export function normalizeTypeText(sourceType: string): string {
  let text = String(sourceType)
    .replace(/\baddress\s+payable\b/g, 'address')
    .replace(/\b(memory|calldata|storage|indexed)\b/g, ' ')
  const trimmed = text.trim()
  if (/^function\b/.test(trimmed)) {
    let end = trimmed.length
    let dims = ''
    while (end > 0) {
      let close = end
      while (close > 0 && /\s/.test(trimmed[close - 1])) close--
      if (close === 0 || trimmed[close - 1] !== ']') break
      const openSearchFrom = close - 1
      let open = openSearchFrom - 1
      while (open >= 0 && trimmed[open] !== '[' && /[\s0-9]/.test(trimmed[open])) open--
      if (open < 0 || trimmed[open] !== '[') break
      dims = `[${trimmed.slice(open + 1, openSearchFrom).trim()}]${dims}`
      end = open
    }
    return `function${dims.replace(/\s+/g, '')}`
  }
  text = text.replace(/\bpayable\b/g, ' ').replace(/\s+/g, '')
  return text
}

function splitArraySuffix(text: string): { base: string; dims: string } | undefined {
  const match = /^([^[\]]+)((\[[0-9]*\])*)$/.exec(text)
  if (!match) return undefined
  return { base: match[1], dims: match[2] ?? '' }
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/**
 * Unit- and contract-scoped type lookup. Order: containing contract's definition, the source
 * unit's definition, explicitly imported definitions (symbol and unit aliases), the contract-
 * qualified global name, then the plain global name. Any key with colliding definitions is
 * ambiguous and contributes no evidence.
 */
function lookupType<T>(
  parsed: ParsedBundle,
  get: (key: string) => T | undefined,
  name: string,
  scope: TypeScope,
): T | undefined {
  const guarded = (key: string): T | undefined => (parsed.types.ambiguous.has(key) ? undefined : get(key))
  const { unit, container } = scope
  const dotted = name.includes('.')
  if (unit !== undefined) {
    if (container && !dotted) {
      const containerHit = guarded(scopedTypeKey(unit, `${container}.${name}`))
      if (containerHit !== undefined) return containerHit
    }
    const unitHit = guarded(scopedTypeKey(unit, name))
    if (unitHit !== undefined) return unitHit
    for (const imp of parsed.imports.get(unit) ?? []) {
      if (dotted) {
        // `Alias.Member` resolves through a unit alias (`import * as Alias`) or a symbol alias
        // (`import { Types as Alias }` → the imported unit's `Types.Member`).
        const dot = name.indexOf('.')
        const alias = name.slice(0, dot)
        const member = name.slice(dot + 1)
        const unitPath = () => resolveImportPath(parsed, unit, imp.path)
        if (imp.unitAlias === alias) {
          const path = unitPath()
          if (path !== undefined) {
            const aliased = guarded(scopedTypeKey(path, member))
            if (aliased !== undefined) return aliased
          }
        }
        for (const symbol of imp.symbols) {
          if ((symbol.alias ?? symbol.name) !== alias) continue
          const path = unitPath()
          if (path === undefined) continue
          const qualified = guarded(scopedTypeKey(path, `${symbol.name}.${member}`))
          if (qualified !== undefined) return qualified
        }
        continue
      }
      for (const symbol of imp.symbols) {
        if ((symbol.alias ?? symbol.name) !== name) continue
        const unitPath = resolveImportPath(parsed, unit, imp.path)
        if (unitPath === undefined) continue
        const imported = guarded(scopedTypeKey(unitPath, symbol.name))
        if (imported !== undefined) return imported
      }
    }
  }
  if (container && !dotted) {
    const containerGlobal = guarded(`${container}.${name}`)
    if (containerGlobal !== undefined) return containerGlobal
  }
  return guarded(name)
}

function canonicalVyperType(
  parsed: ParsedBundle,
  sourceType: string,
  scope: TypeScope,
  depth: number,
): string | undefined {
  if (depth > 24) return undefined
  const text = sourceType.replace(/\s+/g, '')
  if (!text) return undefined
  if (/^Bytes\[[0-9]+\]$/.test(text)) return 'bytes'
  if (/^String\[[0-9]+\]$/.test(text)) return 'string'
  const dynArray = /^DynArray\[(.*)\]$/.exec(text)
  if (dynArray) {
    const inner = canonicalVyperType(parsed, splitTopLevel(dynArray[1], ',')[0] ?? '', scope, depth + 1)
    return inner === undefined ? undefined : `${inner}[]`
  }
  const staticArray = /^(.*)\[([0-9]+)\]$/.exec(text)
  if (staticArray && !/^(Bytes|String|DynArray|HashMap)/.test(staticArray[1] === '' ? text : staticArray[1])) {
    const inner = canonicalVyperType(parsed, staticArray[1], scope, depth + 1)
    return inner === undefined ? undefined : `${inner}[${staticArray[2]}]`
  }
  if (text === 'decimal') return 'int168'
  const normalized = normalizeElementaryName(text)
  if (ELEMENTARY.test(normalized)) return normalized
  const fields = lookupType(parsed, key => parsed.types.structs.get(key), text, scope)
  if (fields) {
    const parts: string[] = []
    for (const field of fields) {
      const canonical = canonicalVyperType(parsed, field, scope, depth + 1)
      if (canonical === undefined) return undefined
      parts.push(canonical)
    }
    return `(${parts.join(',')})`
  }
  if (parsed.types.contractLike.has(text)) return 'address'
  return undefined
}

/**
 * Canonicalize a source-level type into its ABI representation, or `undefined` when the type is
 * unknown — unknown is evidence-neutral, never a mismatch. The scope may be a bare unit path or a
 * full `TypeScope` including the containing contract.
 */
export function canonicalSourceType(
  parsed: ParsedBundle,
  sourceType: string,
  scopeOrUnit?: string | TypeScope,
  depth = 0,
): string | undefined {
  if (depth > 24 || !sourceType) return undefined
  const scope: TypeScope = typeof scopeOrUnit === 'string' ? { unit: scopeOrUnit } : (scopeOrUnit ?? {})
  if (parsed.language === 'vyper') return canonicalVyperType(parsed, sourceType, scope, depth)
  const text = normalizeTypeText(sourceType)
  if (text === 'function') return 'function'
  const split = splitArraySuffix(text)
  if (!split) return undefined
  const base = normalizeElementaryName(split.base)
  const dims = split.dims
  if (ELEMENTARY.test(base)) return base + dims
  const fields = lookupType(parsed, mapKey => parsed.types.structs.get(mapKey), base, scope)
  if (fields) {
    const parts: string[] = []
    for (const field of fields) {
      const canonical = canonicalSourceType(parsed, field, scope, depth + 1)
      if (canonical === undefined) return undefined
      parts.push(canonical)
    }
    return `(${parts.join(',')})${dims}`
  }
  const isEnum = lookupType(parsed, setKey => (parsed.types.enums.has(setKey) ? true : undefined), base, scope)
  if (isEnum) return `uint8${dims}`
  const underlying = lookupType(parsed, mapKey => parsed.types.valueTypes.get(mapKey), base, scope)
  if (underlying !== undefined) {
    const canonical = canonicalSourceType(parsed, underlying, scope, depth + 1)
    return canonical === undefined ? undefined : canonical + dims
  }
  if (parsed.types.contractLike.has(base)) return `address${dims}`
  if (base.includes('.')) {
    // A qualified reference must never degrade to an unrelated simple-name type; only the
    // shape-invariant contract-to-address mapping may match on the member name alone.
    const member = base.split('.').pop() as string
    if (parsed.types.contractLike.has(member)) return `address${dims}`
  }
  return undefined
}

export function canonicalAbiInput(input: AbiInputLike): string {
  const type = typeof input?.type === 'string' ? input.type.replace(/\s+/g, '') : ''
  const tuple = /^tuple((\[[0-9]*\])*)$/.exec(type)
  if (tuple && Array.isArray(input.components)) {
    return `(${input.components.map(canonicalAbiInput).join(',')})${tuple[1] ?? ''}`
  }
  const split = splitArraySuffix(type)
  if (split) return normalizeElementaryName(split.base) + split.dims
  return type
}

function internalTypeAgrees(sourceType: string, input: AbiInputLike): boolean {
  const internal = typeof input?.internalType === 'string' ? input.internalType : ''
  if (!internal) return false
  const cleaned = internal.replace(/^(struct|enum|contract)\s+/, '').replace(/\s+/g, '')
  const internalSplit = splitArraySuffix(cleaned)
  const sourceSplit = splitArraySuffix(normalizeTypeText(sourceType))
  if (!internalSplit || !sourceSplit) return false
  if (internalSplit.dims !== sourceSplit.dims) return false
  const internalName = internalSplit.base.split('.').pop()
  const sourceName = sourceSplit.base.split('.').pop()
  return !!internalName && internalName === sourceName
}

// ===================== Callable candidate matching =====================

interface CandidateScore {
  mismatches: number
  exactMatches: number
  internalAgreements: number
  nameAgreements: number
}

function signatureKey(parsed: ParsedBundle, decl: DeclarationDocumentation): string {
  const scope = declScope(decl)
  return decl.parameters
    .map(param => canonicalSourceType(parsed, param.sourceType, scope) ?? `~${normalizeTypeText(param.sourceType)}`)
    .join(',')
}

function evaluateCandidate(
  parsed: ParsedBundle,
  decl: DeclarationDocumentation,
  inputs: AbiInputLike[],
): CandidateScore {
  const scope = declScope(decl)
  const score: CandidateScore = { mismatches: 0, exactMatches: 0, internalAgreements: 0, nameAgreements: 0 }
  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx] ?? {}
    const param = decl.parameters[idx]
    const abiType = String(input.type ?? '')
    const abiKnown = !(abiType.startsWith('tuple') && !Array.isArray(input.components))
    const sourceCanonical = param ? canonicalSourceType(parsed, param.sourceType, scope) : undefined
    if (sourceCanonical !== undefined && abiKnown) {
      if (sourceCanonical === canonicalAbiInput(input)) score.exactMatches++
      else score.mismatches++
    } else if (param && internalTypeAgrees(param.sourceType, input)) {
      score.internalAgreements++
    }
    const inputName = typeof input.name === 'string' && input.name ? input.name : undefined
    if (inputName && (param?.name === inputName || decl.documentation?.params.has(inputName))) score.nameAgreements++
  }
  return score
}

/**
 * A Vyper declaration with trailing defaulted parameters generates one ABI entry per valid suffix;
 * trim the declaration to the requested arity so matching and docs stay positional.
 */
function arityVariant(
  parsed: ParsedBundle,
  decl: DeclarationDocumentation,
  arity: number,
): DeclarationDocumentation | undefined {
  if (decl.parameters.length === arity) return decl
  if (parsed.language !== 'vyper') return undefined
  if (arity > decl.parameters.length) return undefined
  let minimumArity = decl.parameters.length
  while (minimumArity > 0 && decl.parameters[minimumArity - 1].hasDefault) minimumArity--
  if (arity < minimumArity) return undefined
  return { ...decl, parameters: decl.parameters.slice(0, arity) }
}

function callableCandidates(ctx: ResolutionContext, abiItem: AbiItemLike): Candidate[] {
  const inputs = Array.isArray(abiItem.inputs) ? abiItem.inputs : []
  const found: Candidate[] = []
  ctx.linearization.forEach((contract, ci) => {
    for (const decl of contract.declarations) {
      if (decl.kind !== 'function' && decl.kind !== 'getter') continue
      if (decl.name !== abiItem.name) continue
      if (decl.visibility === 'internal' || decl.visibility === 'private') continue
      const variant = arityVariant(ctx.parsed, decl, inputs.length)
      if (!variant) continue
      found.push({ decl: variant, owner: contract, ci })
    }
  })
  // Re-exported module functions rank after everything the target itself declares.
  for (const entry of ctx.exported) {
    if (entry.decl.name !== abiItem.name) continue
    const variant = arityVariant(ctx.parsed, entry.decl, inputs.length)
    if (!variant) continue
    found.push({ decl: variant, owner: entry.owner, ci: ctx.linearization.length })
  }
  // Shadow overridden declarations: same signature keeps the most-derived; within one contract the
  // last declaration wins (legacy tie behavior).
  const bySignature = new Map<string, Candidate>()
  for (const candidate of found) {
    const key = signatureKey(ctx.parsed, candidate.decl)
    const previous = bySignature.get(key)
    if (
      !previous ||
      candidate.ci < previous.ci ||
      (candidate.ci === previous.ci && candidate.decl.sourceOrder > previous.decl.sourceOrder)
    ) {
      bySignature.set(key, candidate)
    }
  }
  return [...bySignature.values()]
}

// ===================== Documentation inheritance =====================

function positionalDoc(decl: DeclarationDocumentation): PositionalDoc | undefined {
  const doc = decl.documentation
  if (!hasDocumentation(doc)) return undefined
  return {
    notice: doc.notice,
    paramNotices: decl.parameters.map(param => (param.name ? doc.params.get(param.name) : undefined)),
  }
}

function findMatchingDeclaration(
  parsed: ParsedBundle,
  base: ContractDocumentation,
  decl: DeclarationDocumentation,
): { decl: DeclarationDocumentation; owner: ContractDocumentation } | undefined {
  const linearization = linearizeContract(parsed, base)
  const targetKey = signatureKey(parsed, decl)
  const sameName: { decl: DeclarationDocumentation; owner: ContractDocumentation }[] = []
  for (const contract of linearization) {
    for (const candidate of contract.declarations) {
      if (candidate.kind !== 'function' && candidate.kind !== 'getter') continue
      if (candidate.name !== decl.name) continue
      sameName.push({ decl: candidate, owner: contract })
    }
  }
  const exact = sameName.find(candidate => signatureKey(parsed, candidate.decl) === targetKey)
  if (exact) return exact
  const sameArity = sameName.filter(candidate => candidate.decl.parameters.length === decl.parameters.length)
  if (sameArity.length && new Set(sameArity.map(candidate => signatureKey(parsed, candidate.decl))).size === 1) {
    return sameArity[0]
  }
  return undefined
}

function automaticInheritance(
  ctx: ResolutionContext,
  decl: DeclarationDocumentation,
  owner: ContractDocumentation,
  visited: Set<string>,
): PositionalDoc | undefined {
  const start = ctx.linearizationIndex.get(owner.id)
  if (start === undefined) return undefined
  const targetKey = signatureKey(ctx.parsed, decl)
  const candidates: { decl: DeclarationDocumentation; owner: ContractDocumentation }[] = []
  for (let ci = start + 1; ci < ctx.linearization.length; ci++) {
    const contract = ctx.linearization[ci]
    for (const candidate of contract.declarations) {
      if (candidate.kind !== 'function' && candidate.kind !== 'getter') continue
      if (candidate.name !== decl.name) continue
      if (candidate.parameters.length !== decl.parameters.length) continue
      if (signatureKey(ctx.parsed, candidate) !== targetKey) continue
      if (!hasDocumentation(candidate.documentation)) continue
      candidates.push({ decl: candidate, owner: contract })
    }
  }
  const unshadowed = candidates.filter(
    candidate =>
      !candidates.some(
        other =>
          other.owner.id !== candidate.owner.id &&
          (ctx.linearizationIndex.get(other.owner.id) ?? Number.MAX_SAFE_INTEGER) <
            (ctx.linearizationIndex.get(candidate.owner.id) ?? Number.MAX_SAFE_INTEGER) &&
          linearizeContract(ctx.parsed, other.owner).some(entry => entry.id === candidate.owner.id),
      ),
  )
  if (!unshadowed.length) return undefined
  const nearest = [...unshadowed].sort(
    (a, b) =>
      (ctx.linearizationIndex.get(a.owner.id) ?? Number.MAX_SAFE_INTEGER) -
        (ctx.linearizationIndex.get(b.owner.id) ?? Number.MAX_SAFE_INTEGER) || b.decl.sourceOrder - a.decl.sourceOrder,
  )[0]
  return resolveDeclarationDoc(ctx, nearest.decl, nearest.owner, visited)
}

function resolveDeclarationDoc(
  ctx: ResolutionContext,
  decl: DeclarationDocumentation,
  owner: ContractDocumentation,
  visited: Set<string> = new Set(),
): PositionalDoc | undefined {
  const key = `${owner.id}${KEY_SEPARATOR}${decl.sourceOrder}${KEY_SEPARATOR}${signatureKey(ctx.parsed, decl)}`
  if (visited.has(key)) return positionalDoc(decl)
  visited.add(key)

  const local = positionalDoc(decl)
  const inheritFrom = decl.documentation?.inheritdoc
  if (inheritFrom) {
    const base = resolveContractReference(ctx.parsed, owner.sourceUnit, inheritFrom)
    if (base && base.id !== owner.id) {
      const match = findMatchingDeclaration(ctx.parsed, base, decl)
      if (match) {
        const parent = resolveDeclarationDoc(ctx, match.decl, match.owner, visited)
        if (parent) {
          return {
            notice: local?.notice ?? parent.notice,
            paramNotices: decl.parameters.map((_, idx) => local?.paramNotices[idx] ?? parent.paramNotices[idx]),
          }
        }
      }
    }
    return local
  }

  const complete = (doc: PositionalDoc | undefined): boolean =>
    !!doc?.notice && doc.paramNotices.every(notice => notice !== undefined)
  if (complete(local)) return local

  const inherited = automaticInheritance(ctx, decl, owner, visited)
  const merged: PositionalDoc | undefined =
    local && inherited
      ? {
          notice: local.notice ?? inherited.notice,
          paramNotices: decl.parameters.map((_, idx) => local.paramNotices[idx] ?? inherited.paramNotices[idx]),
        }
      : (local ?? inherited)
  return merged
}

// ===================== Public resolution API =====================

export function resolveAbiFunctionDoc(
  ctx: ResolutionContext,
  abiItem: AbiItemLike,
): ResolvedFunctionDocumentation | undefined {
  const candidates = callableCandidates(ctx, abiItem)
  if (!candidates.length) return undefined
  const inputs = Array.isArray(abiItem.inputs) ? abiItem.inputs : []
  const scored = candidates.map(candidate => ({
    candidate,
    score: evaluateCandidate(ctx.parsed, candidate.decl, inputs),
  }))
  scored.sort(
    (a, b) =>
      a.score.mismatches - b.score.mismatches ||
      b.score.exactMatches - a.score.exactMatches ||
      b.score.internalAgreements - a.score.internalAgreements ||
      b.score.nameAgreements - a.score.nameAgreements ||
      a.candidate.ci - b.candidate.ci ||
      b.candidate.decl.sourceOrder - a.candidate.decl.sourceOrder,
  )
  const chosen = scored[0].candidate
  const doc = resolveDeclarationDoc(ctx, chosen.decl, chosen.owner)
  if (!doc) return undefined
  const notice = doc.notice?.trim() || undefined
  const paramNotices = inputs.map((_, idx) => doc.paramNotices[idx]?.trim() || undefined)
  if (!notice && !paramNotices.some(Boolean)) return undefined
  return { notice, paramNotices }
}

export function coverageScore(parsed: ParsedBundle, contract: ContractDocumentation, abi: AbiItemLike[]): number {
  const ctx = createResolutionContext(parsed, contract)
  let exact = 0
  let soft = 0
  for (const item of abi) {
    if (item?.type !== 'function' || typeof item.name !== 'string') continue
    const inputs = Array.isArray(item.inputs) ? item.inputs : []
    const candidates = callableCandidates(ctx, item)
    if (!candidates.length) continue
    const scores = candidates.map(candidate => evaluateCandidate(parsed, candidate.decl, inputs))
    if (scores.some(score => score.mismatches === 0 && score.exactMatches === inputs.length)) exact++
    else if (scores.some(score => score.mismatches === 0)) soft++
  }
  return exact * 2 + soft
}

/**
 * Resolve the target contract: compilation target, qualified name, unique simple name, greatest
 * ABI coverage among duplicates, stable source order last.
 */
export function resolveTargetContract(
  parsed: ParsedBundle,
  bundle: SourceBundle,
  contractName: string,
  abi: AbiItemLike[],
): ContractDocumentation | undefined {
  const contracts = parsed.contracts
  if (!contracts.length) return undefined

  if (parsed.language === 'vyper') {
    const targetPath = bundle.compilationTarget?.path
    if (targetPath !== undefined) {
      const byPath = contracts.find(contract => contract.sourceUnit === targetPath)
      if (byPath) return byPath
    }
    const byName = contracts.filter(contract => contract.name === contractName)
    if (byName.length === 1) return byName[0]
    if (contracts.length === 1) return contracts[0]
    return bestByCoverage(parsed, contracts, abi, 0) ?? contracts[0]
  }

  const target = bundle.compilationTarget
  if (target) {
    const exact = contracts.find(
      contract => contract.sourceUnit === target.path && contract.name === target.contractName,
    )
    if (exact) return exact
  }
  if (contractName.includes(':')) {
    const qualified = contracts.find(contract => contract.qualifiedName === contractName)
    if (qualified) return qualified
  }
  const named = contracts.filter(contract => contract.name === contractName)
  if (named.length === 1) return named[0]
  if (named.length > 1) return bestByCoverage(parsed, named, abi, 0) ?? named[0]
  return bestByCoverage(parsed, contracts, abi, 1)
}

function bestByCoverage(
  parsed: ParsedBundle,
  contracts: ContractDocumentation[],
  abi: AbiItemLike[],
  minimumScore: number,
): ContractDocumentation | undefined {
  let best: ContractDocumentation | undefined
  let bestScore = -1
  let tied = false
  for (const contract of contracts) {
    const score = coverageScore(parsed, contract, abi)
    if (score > bestScore) {
      best = contract
      bestScore = score
      tied = false
    } else if (score === bestScore) {
      tied = true
    }
  }
  if (bestScore < minimumScore) return undefined
  if (minimumScore > 0 && tied) return undefined
  return best
}
