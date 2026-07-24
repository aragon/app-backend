/**
 * Source-side half of the NatSpec pipeline: normalizes explorer payloads into source units,
 * detects the language, and lexically extracts contracts, declarations, and their documentation
 * into the canonical internal model consumed by `resolver.ts`. No compiler, no semantic analysis.
 */

import type {
  ContractDocumentation,
  ContractKind,
  DeclarationDocumentation,
  DeclarationKind,
  ModuleExport,
  ParentReference,
  ParsedBundle,
  ParsedDocumentation,
  SourceBundle,
  SourceParameter,
  SourceUnit,
  TypeDefinitions,
  UnitImport,
} from '@types'

export type {
  ContractDocumentation,
  ContractKind,
  DeclarationDocumentation,
  DeclarationKind,
  ModuleExport,
  ParentReference,
  ParsedBundle,
  ParsedDocumentation,
  SourceBundle,
  SourceParameter,
  SourceUnit,
  TypeDefinitions,
  TypeReference,
  UnitImport,
} from '@types'

const TYPE_SCOPE_SEPARATOR = String.fromCharCode(0)

/** Key for a type definition scoped to its source unit. */
export const scopedTypeKey = (unit: string, name: string): string => `${unit}${TYPE_SCOPE_SEPARATOR}${name}`

/**
 * Register a type under a key only while every definition of that key agrees — a key with
 * colliding definitions becomes ambiguous and stops resolving, so one contract's `Point` can
 * never canonicalize as another's, whether they collide across units or within one unit.
 */
function registerTypeKey(parsed: ParsedBundle, key: string, stamp: string, apply: (key: string) => void): void {
  const existing = parsed.types.registry.get(key)
  if (existing === undefined) {
    parsed.types.registry.set(key, stamp)
    apply(key)
  } else if (existing !== stamp) {
    parsed.types.ambiguous.add(key)
  }
}

function registerTypeName(
  parsed: ParsedBundle,
  unit: string,
  name: string,
  stamp: string,
  apply: (key: string) => void,
): void {
  registerTypeKey(parsed, scopedTypeKey(unit, name), stamp, apply)
  registerTypeKey(parsed, name, stamp, apply)
}

export function hasDocumentation(doc: ParsedDocumentation | undefined): doc is ParsedDocumentation {
  return (
    !!doc &&
    (doc.notice !== undefined ||
      doc.dev !== undefined ||
      doc.inheritdoc !== undefined ||
      doc.params.size > 0 ||
      doc.returns.length > 0 ||
      doc.custom.size > 0 ||
      doc.unknown.size > 0)
  )
}

// ===================== Explorer source normalization =====================

const stripBom = (content: string): string => (content.charCodeAt(0) === 0xfeff ? content.slice(1) : content)

const cleanContent = (content: string): string => stripBom(content).replace(/\r\n?/g, '\n')

const looksLikeSourceMap = (value: Record<string, unknown>): boolean => {
  const entries = Object.values(value)
  return (
    entries.length > 0 &&
    entries.every(entry => !!entry && typeof entry === 'object' && typeof (entry as any).content === 'string')
  )
}

function bundleFromJson(json: any): SourceBundle | undefined {
  if (!json || typeof json !== 'object') return undefined
  const sourcesObj =
    json.sources && typeof json.sources === 'object' && !Array.isArray(json.sources)
      ? json.sources
      : looksLikeSourceMap(json)
        ? json
        : undefined
  if (!sourcesObj) return undefined

  const units: SourceUnit[] = []
  let order = 0
  for (const [path, entry] of Object.entries(sourcesObj)) {
    const content = entry && typeof entry === 'object' ? (entry as any).content : undefined
    if (typeof content !== 'string') continue
    if (path.toLowerCase().endsWith('.yul')) continue
    units.push({ path, content: cleanContent(content), order: order++ })
  }

  let compilationTarget: SourceBundle['compilationTarget']
  const rawTarget = json.settings?.compilationTarget
  if (rawTarget && typeof rawTarget === 'object') {
    const first = Object.entries(rawTarget).find(([, name]) => typeof name === 'string')
    if (first) compilationTarget = { path: first[0], contractName: first[1] as string }
  }

  const rawLanguage = typeof json.language === 'string' ? json.language.toLowerCase() : ''
  const language = rawLanguage === 'solidity' ? 'solidity' : rawLanguage === 'vyper' ? 'vyper' : 'unknown'
  return { language, units, compilationTarget }
}

export function normalizeSource(sourceCode: unknown): SourceBundle {
  if (typeof sourceCode !== 'string') {
    if (sourceCode && typeof sourceCode === 'object') {
      const fromObject = bundleFromJson(sourceCode)
      if (fromObject) return fromObject
    }
    return { language: 'unknown', units: [] }
  }

  const text = cleanContent(sourceCode).trim()
  if (!text) return { language: 'unknown', units: [] }

  if (text.startsWith('{')) {
    const candidates =
      text.startsWith('{{') && text.endsWith('}}') && text.length > 4 ? [text.slice(1, -1), text] : [text]
    for (const candidate of candidates) {
      try {
        const bundle = bundleFromJson(JSON.parse(candidate))
        if (bundle) return bundle
      } catch {
        // fall through to the raw-source treatment
      }
    }
  }

  return { language: 'unknown', units: [{ path: '', content: text, order: 0 }] }
}

// ===================== Language selection =====================

interface CompilerVersionEvidence {
  explicit?: 'solidity' | 'vyper'
  bareHint?: 'solidity' | 'vyper'
}

function compilerVersionEvidence(compilerVersion: string): CompilerVersionEvidence {
  const version = compilerVersion.toLowerCase().trim()
  if (!version) return {}
  if (version.includes('vyper')) return { explicit: 'vyper' }
  if (version.includes('solc') || version.includes('solidity') || version.includes('commit')) {
    return { explicit: 'solidity' }
  }
  // A bare semver is weak evidence — Solidity and Vyper version ranges overlap (both ship 0.4.x),
  // so the release-range heuristic only breaks ties after path and syntax evidence.
  if (/^(v|zkvm-)?0\.[4-9]\./.test(version)) return { bareHint: 'solidity' }
  if (/^v?[\d.]+$/.test(version)) return { bareHint: 'vyper' }
  return {}
}

function scoreSyntax(content: string): { solidity: number; vyper: number } {
  let solidity = 0
  let vyper = 0
  for (const rawLine of content.split('\n').slice(0, 300)) {
    const line = rawLine.trim()
    if (!line) continue
    if (
      /^pragma\s+(solidity|abicoder)/.test(line) ||
      /^(contract|library|interface|abstract\s+contract)\s+[\w$]/.test(line) ||
      /^import\s+["'{*]/.test(line)
    )
      solidity += 10
    if (/^(function|modifier|struct|enum|event|error)\s+[\w$]/.test(line)) solidity += 5
    if (/;\s*$/.test(line)) solidity += 1
    if (/^\/\//.test(line)) solidity += 0.5

    if (/^#\s*(@version|pragma\s+version)/.test(line)) vyper += 20
    if (/^def\s+[\w$]+\s*\(/.test(line) || /^implements\s*:/.test(line) || /^from\s+[\w.]+\s+import\b/.test(line))
      vyper += 10
    if (/^@(external|internal|view|pure|payable|deploy|nonpayable|nonreentrant)\b/.test(line)) vyper += 5
    if (/^[\w$]+\s*:\s*(public\(|constant\(|immutable\(|HashMap\[|DynArray\[|String\[|Bytes\[)/.test(line)) vyper += 5
    if (/^(event|struct|interface|flag)\s+[\w$]+\s*:\s*$/.test(line)) vyper += 5
    if (/^#(?!\s*(@version|pragma))/.test(line)) vyper += 0.5
    if (/^"""/.test(line)) vyper += 1
  }
  return { solidity, vyper }
}

export function detectLanguage(bundle: SourceBundle, compilerVersion?: string): 'solidity' | 'vyper' | 'unknown' {
  if (bundle.language !== 'unknown') return bundle.language

  const evidence = typeof compilerVersion === 'string' ? compilerVersionEvidence(compilerVersion) : {}
  if (evidence.explicit) return evidence.explicit

  const paths = [bundle.compilationTarget?.path, ...bundle.units.map(unit => unit.path)]
  for (const path of paths) {
    if (!path) continue
    if (path.endsWith('.sol')) return 'solidity'
    if (path.endsWith('.vy')) return 'vyper'
  }

  let solidity = 0
  let vyper = 0
  for (const unit of bundle.units) {
    const score = scoreSyntax(unit.content)
    solidity += score.solidity
    vyper += score.vyper
  }
  if (solidity > vyper) return 'solidity'
  if (vyper > solidity) return 'vyper'
  return evidence.bareHint ?? 'unknown'
}

// ===================== NatSpec text parsing =====================

/**
 * Parse the logical lines of one documentation block. A tag is recognized only when `@` begins the
 * logical content of a line; anything else continues the current tag (or an implicit `@notice`).
 * Multiline text joins with a single space. Malformed entries degrade without discarding the rest.
 */
export function parseDocLines(rawLines: string[]): ParsedDocumentation | undefined {
  type Sink =
    | { kind: 'notice' | 'dev' | 'inheritdoc'; parts: string[] }
    | { kind: 'param'; name: string; parts: string[] }
    | { kind: 'return'; parts: string[] }
    | { kind: 'custom' | 'unknown'; key: string; parts: string[] }

  const sinks: Sink[] = []
  let current: Sink | undefined

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\r/g, '').trim()
    if (!line || /^\*+$/.test(line)) continue
    const tag = /^@(\S+)\s*(.*)$/.exec(line)
    if (tag) {
      const token = tag[1]
      const rest = (tag[2] ?? '').trim()
      if (token === 'param') {
        const named = /^(\S+)\s*(.*)$/.exec(rest)
        current = { kind: 'param', name: named?.[1] ?? '', parts: named?.[2] ? [named[2]] : [] }
      } else if (token === 'return') {
        current = { kind: 'return', parts: rest ? [rest] : [] }
      } else if (token === 'inheritdoc') {
        current = { kind: 'inheritdoc', parts: rest ? [rest] : [] }
      } else if (token === 'notice' || token === 'dev') {
        current = { kind: token, parts: rest ? [rest] : [] }
      } else if (token.startsWith('custom:') && token.length > 'custom:'.length) {
        current = { kind: 'custom', key: token.slice('custom:'.length), parts: rest ? [rest] : [] }
      } else {
        current = { kind: 'unknown', key: token, parts: rest ? [rest] : [] }
      }
      sinks.push(current)
    } else {
      if (!current) {
        current = { kind: 'notice', parts: [] }
        sinks.push(current)
      }
      current.parts.push(line)
    }
  }

  const doc: ParsedDocumentation = { params: new Map(), returns: [], custom: new Map(), unknown: new Map() }
  for (const sink of sinks) {
    const text = sink.parts.join(' ').trim()
    if (!text) continue
    switch (sink.kind) {
      case 'notice':
        if (doc.notice === undefined) doc.notice = text
        break
      case 'dev':
        if (doc.dev === undefined) doc.dev = text
        break
      case 'inheritdoc':
        if (doc.inheritdoc === undefined) doc.inheritdoc = text.split(/\s+/)[0]
        break
      case 'param':
        if (sink.name && !doc.params.has(sink.name)) doc.params.set(sink.name, text)
        break
      case 'return':
        doc.returns.push(text)
        break
      case 'custom': {
        const list = doc.custom.get(sink.key) ?? []
        list.push(text)
        doc.custom.set(sink.key, list)
        break
      }
      case 'unknown': {
        const list = doc.unknown.get(sink.key) ?? []
        list.push(text)
        doc.unknown.set(sink.key, list)
        break
      }
    }
  }
  return hasDocumentation(doc) ? doc : undefined
}

// ===================== Solidity lexer =====================

interface Token {
  value: string
  start: number
  end: number
  kind: 'id' | 'punct' | 'string' | 'number'
}

interface RawComment {
  raw: string
  start: number
  end: number
  line: boolean
}

interface DocBlock {
  start: number
  end: number
  lines: string[]
}

const isIdStart = (ch: string) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$'
const isIdChar = (ch: string) => isIdStart(ch) || (ch >= '0' && ch <= '9')
const isDigit = (ch: string) => ch >= '0' && ch <= '9'
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f'

function lexSolidity(source: string): { tokens: Token[]; comments: RawComment[] } {
  const tokens: Token[] = []
  const comments: RawComment[] = []
  const length = source.length
  let i = 0
  while (i < length) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      const start = i
      i += 2
      while (i < length && source[i] !== '\n') i++
      comments.push({ raw: source.slice(start, i), start, end: i, line: true })
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const start = i
      const close = source.indexOf('*/', i + 2)
      const end = close === -1 ? length : close + 2
      comments.push({ raw: source.slice(start, end), start, end, line: false })
      i = end
      continue
    }
    if (ch === '"' || ch === "'") {
      // A Solidity string cannot span lines; an unterminated quote is malformed source, so fall
      // back to a punctuation token instead of swallowing the rest of the line.
      let j = i + 1
      let closed = false
      while (j < length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) {
          closed = true
          break
        }
        j++
      }
      if (closed) {
        tokens.push({ value: source.slice(i, j + 1), start: i, end: j + 1, kind: 'string' })
        i = j + 1
      } else {
        tokens.push({ value: ch, start: i, end: i + 1, kind: 'punct' })
        i++
      }
      continue
    }
    if (isSpace(ch)) {
      i++
      continue
    }
    if (isIdStart(ch)) {
      const start = i
      while (i < length && isIdChar(source[i])) i++
      tokens.push({ value: source.slice(start, i), start, end: i, kind: 'id' })
      continue
    }
    if (isDigit(ch)) {
      const start = i
      while (i < length && (isIdChar(source[i]) || source[i] === '.')) i++
      tokens.push({ value: source.slice(start, i), start, end: i, kind: 'number' })
      continue
    }
    tokens.push({ value: ch, start: i, end: i + 1, kind: 'punct' })
    i++
  }
  return { tokens, comments }
}

/** Group raw comments into NatSpec doc blocks: consecutive `///` lines merge, block docs stand alone. */
function buildDocBlocks(comments: RawComment[], source: string): DocBlock[] {
  const blocks: DocBlock[] = []
  let pending: DocBlock | undefined
  for (const comment of comments) {
    if (comment.line) {
      const natspec = comment.raw.startsWith('///') && !comment.raw.startsWith('////')
      if (!natspec) {
        pending = undefined
        continue
      }
      const text = comment.raw.slice(3)
      if (pending && /^\s*$/.test(source.slice(pending.end, comment.start))) {
        pending.lines.push(text)
        pending.end = comment.end
      } else {
        pending = { start: comment.start, end: comment.end, lines: [text] }
        blocks.push(pending)
      }
      continue
    }
    pending = undefined
    if (!comment.raw.startsWith('/**') || comment.raw[3] === '/') continue
    let body = comment.raw.slice(3)
    if (body.endsWith('*/')) body = body.slice(0, -2)
    blocks.push({
      start: comment.start,
      end: comment.end,
      lines: body.split('\n').map(line => line.replace(/^\s*\*+/, '')),
    })
  }
  return blocks
}

// ===================== Solidity declaration parsing =====================

const VISIBILITY = new Set(['public', 'private', 'internal', 'external'])
const VAR_MODIFIERS = new Set(['public', 'private', 'internal', 'constant', 'immutable', 'transient'])
const PARAM_LOCATIONS = new Set(['memory', 'calldata', 'storage', 'indexed'])
const FUNCTION_TYPE_KEYWORDS = new Set(['external', 'internal', 'view', 'pure', 'payable', 'returns'])

function tokensToParam(group: Token[]): SourceParameter {
  const filtered = group.filter(token => !PARAM_LOCATIONS.has(token.value))
  if (!filtered.length) return { sourceType: '' }
  if (filtered[0].value === 'function') {
    const last = filtered[filtered.length - 1]
    const name =
      filtered.length > 1 && last.kind === 'id' && !FUNCTION_TYPE_KEYWORDS.has(last.value) ? last.value : undefined
    // An external function type can still be an array; keep the dimensions so `function[]` does
    // not collapse into `function` and match the wrong overload.
    const tail = name ? filtered.slice(0, -1) : filtered
    let dims = ''
    let i = tail.length - 1
    while (i > 0 && tail[i].value === ']') {
      if (tail[i - 1]?.value === '[') {
        dims = `[]${dims}`
        i -= 2
      } else if (tail[i - 1]?.kind === 'number' && tail[i - 2]?.value === '[') {
        dims = `[${tail[i - 1].value}]${dims}`
        i -= 3
      } else break
    }
    return { name, sourceType: `function${dims}` }
  }
  let name: string | undefined
  let typeTokens = filtered
  const last = filtered[filtered.length - 1]
  if (
    filtered.length > 1 &&
    last.kind === 'id' &&
    filtered[filtered.length - 2].value !== '.' &&
    last.value !== 'payable'
  ) {
    name = last.value
    typeTokens = filtered.slice(0, -1)
  }
  return { name, sourceType: typeTokens.map(token => token.value).join(' ') }
}

function topLevelIndexOf(text: string, search: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && text.startsWith(search, i)) return i
  }
  return -1
}

/** Derive the getter parameter list of a public state variable from mapping keys and array dims. */
function getterParameters(typeText: string): SourceParameter[] {
  const params: SourceParameter[] = []
  let current = typeText.trim()
  for (let guard = 0; guard < 32; guard++) {
    if (/^mapping\s*\(/.test(current)) {
      const open = current.indexOf('(')
      let depth = 0
      let close = -1
      for (let i = open; i < current.length; i++) {
        if (current[i] === '(') depth++
        else if (current[i] === ')') {
          depth--
          if (depth === 0) {
            close = i
            break
          }
        }
      }
      if (close === -1) break
      const inner = current.slice(open + 1, close)
      const arrow = topLevelIndexOf(inner, '=>')
      if (arrow === -1) break
      params.push({ sourceType: inner.slice(0, arrow).trim() })
      current = inner.slice(arrow + 2).trim()
      continue
    }
    const arrays = /^(.*?)((\s*\[[^[\]]*\])+)\s*$/.exec(current)
    if (arrays) {
      const dims = arrays[2].match(/\[/g)?.length ?? 0
      for (let k = 0; k < dims; k++) params.push({ sourceType: 'uint256' })
      current = arrays[1].trim()
      continue
    }
    break
  }
  return params
}

function parseSolidityUnit(unit: SourceUnit, parsed: ParsedBundle): void {
  const source = unit.content
  const { tokens, comments } = lexSolidity(source)
  const docBlocks = buildDocBlocks(comments, source)
  const unitImports: UnitImport[] = []
  parsed.imports.set(unit.path, unitImports)

  const orderOf = (position: number) => unit.order * 1_000_000_000 + position
  let i = 0

  const value = (idx: number) => tokens[idx]?.value

  const docFor = (declIdx: number): ParsedDocumentation | undefined => {
    const from = declIdx > 0 ? tokens[declIdx - 1].end : 0
    const to = tokens[declIdx]?.start ?? source.length
    // Adjacent documentation comments all belong to the declaration that follows them — a
    // `/** @notice … */` followed by a `/// @custom:…` line is one docstring, as solc treats it.
    const lines: string[] = []
    for (const block of docBlocks) {
      if (block.start >= to) break
      if (block.start >= from && block.end <= to) lines.push(...block.lines)
    }
    return lines.length ? parseDocLines(lines) : undefined
  }

  const skipBalanced = (open: string, close: string): void => {
    let depth = 0
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === open) depth++
      else if (v === close) {
        depth--
        if (depth <= 0) {
          i++
          return
        }
      }
      i++
    }
  }

  /** Consume up to and including the next top-level `;`, stopping (not consuming) at an unbalanced `}`. */
  const skipStatement = (): void => {
    let paren = 0
    let bracket = 0
    let brace = 0
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === '(') paren++
      else if (v === ')') paren = Math.max(0, paren - 1)
      else if (v === '[') bracket++
      else if (v === ']') bracket = Math.max(0, bracket - 1)
      else if (v === '{') brace++
      else if (v === '}') {
        if (brace === 0) return
        brace--
      } else if (v === ';' && paren === 0 && bracket === 0 && brace === 0) {
        i++
        return
      }
      i++
    }
  }

  const parseParamList = (): SourceParameter[] => {
    const groups: Token[][] = []
    let current: Token[] = []
    let depth = 0
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === '(') {
        depth++
        if (depth === 1) {
          i++
          continue
        }
      } else if (v === ')') {
        depth--
        if (depth === 0) {
          i++
          break
        }
      } else if (v === ',' && depth === 1) {
        groups.push(current)
        current = []
        i++
        continue
      }
      current.push(tokens[i])
      i++
    }
    if (current.length) groups.push(current)
    return groups.filter(group => group.length).map(tokensToParam)
  }

  const parseImport = (): void => {
    i++
    const imp: UnitImport = { path: '', symbols: [] }
    if (value(i) === '{') {
      i++
      while (i < tokens.length && value(i) !== '}') {
        if (tokens[i].kind === 'id') {
          const symbol: { name: string; alias?: string } = { name: tokens[i].value }
          i++
          if (value(i) === 'as' && tokens[i + 1]?.kind === 'id') {
            symbol.alias = tokens[i + 1].value
            i += 2
          }
          imp.symbols.push(symbol)
        } else i++
      }
      if (value(i) === '}') i++
      if (value(i) === 'from') i++
    } else if (value(i) === '*') {
      i++
      if (value(i) === 'as' && tokens[i + 1]?.kind === 'id') {
        imp.unitAlias = tokens[i + 1].value
        i += 2
      }
      if (value(i) === 'from') i++
    }
    if (tokens[i]?.kind === 'string') {
      imp.path = tokens[i].value.slice(1, -1)
      i++
    }
    if (value(i) === 'as' && tokens[i + 1]?.kind === 'id') {
      imp.unitAlias = tokens[i + 1].value
      i += 2
    }
    skipStatement()
    if (imp.path) unitImports.push(imp)
  }

  const parseFunctionLike = (kind: DeclarationKind, contract: ContractDocumentation | undefined): void => {
    const declIdx = i
    i++
    let name: string | undefined
    if (kind === 'function' && tokens[i]?.kind === 'id') {
      name = tokens[i].value
      i++
    }
    if (value(i) !== '(') {
      skipStatement()
      return
    }
    const parameters = parseParamList()
    let visibility: string | undefined
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === '{') {
        skipBalanced('{', '}')
        break
      }
      if (v === ';') {
        i++
        break
      }
      if (v === '}') break
      if (v === '(') {
        skipBalanced('(', ')')
        continue
      }
      if (v === 'returns') {
        i++
        if (value(i) === '(') skipBalanced('(', ')')
        continue
      }
      if (VISIBILITY.has(v)) visibility = v
      i++
    }
    if (!contract) return
    if (kind === 'function' && !name) return
    contract.declarations.push({
      kind,
      name,
      parameters,
      visibility,
      documentation: docFor(declIdx),
      sourceOrder: orderOf(tokens[declIdx].start),
      sourceUnit: unit.path,
      container: contract.name,
    })
  }

  const parseEventOrError = (kind: 'event' | 'error', contract: ContractDocumentation | undefined): void => {
    const declIdx = i
    i++
    let name: string | undefined
    if (tokens[i]?.kind === 'id') {
      name = tokens[i].value
      i++
    }
    let parameters: SourceParameter[] = []
    if (value(i) === '(') parameters = parseParamList()
    skipStatement()
    if (!contract || !name) return
    contract.declarations.push({
      kind,
      name,
      parameters,
      documentation: docFor(declIdx),
      sourceOrder: orderOf(tokens[declIdx].start),
      sourceUnit: unit.path,
      container: contract.name,
    })
  }

  const parseStruct = (containerName: string | undefined): void => {
    i++
    if (tokens[i]?.kind !== 'id') {
      skipStatement()
      return
    }
    const name = tokens[i].value
    i++
    if (value(i) !== '{') {
      skipStatement()
      return
    }
    i++
    const fields: string[] = []
    let fieldTokens: Token[] = []
    let depth = 1
    while (i < tokens.length && depth > 0) {
      const v = tokens[i].value
      if (v === '{') depth++
      else if (v === '}') {
        depth--
        if (depth === 0) {
          i++
          break
        }
      } else if (v === ';' && depth === 1) {
        if (fieldTokens.length) fields.push(tokensToParam(fieldTokens).sourceType)
        fieldTokens = []
        i++
        continue
      } else fieldTokens.push(tokens[i])
      i++
    }
    const stamp = `struct:${JSON.stringify(fields)}`
    registerTypeName(parsed, unit.path, name, stamp, key => parsed.types.structs.set(key, fields))
    if (containerName) {
      registerTypeName(parsed, unit.path, `${containerName}.${name}`, stamp, key =>
        parsed.types.structs.set(key, fields),
      )
    }
  }

  const parseEnum = (containerName: string | undefined): void => {
    i++
    if (tokens[i]?.kind !== 'id') {
      skipStatement()
      return
    }
    const name = tokens[i].value
    i++
    if (value(i) === '{') skipBalanced('{', '}')
    registerTypeName(parsed, unit.path, name, 'enum', key => parsed.types.enums.add(key))
    if (containerName) {
      registerTypeName(parsed, unit.path, `${containerName}.${name}`, 'enum', key => parsed.types.enums.add(key))
    }
  }

  const parseValueType = (containerName: string | undefined): void => {
    // `type Name is <elementary>;`
    if (tokens[i + 1]?.kind !== 'id' || value(i + 2) !== 'is') {
      skipStatement()
      return
    }
    const name = tokens[i + 1].value
    i += 3
    const underlying: string[] = []
    while (i < tokens.length && value(i) !== ';' && value(i) !== '}') {
      underlying.push(tokens[i].value)
      i++
    }
    if (value(i) === ';') i++
    const underlyingText = underlying.join(' ')
    const stamp = `udvt:${underlyingText}`
    registerTypeName(parsed, unit.path, name, stamp, key => parsed.types.valueTypes.set(key, underlyingText))
    if (containerName) {
      registerTypeName(parsed, unit.path, `${containerName}.${name}`, stamp, key =>
        parsed.types.valueTypes.set(key, underlyingText),
      )
    }
  }

  const readTypeExpression = (): string | undefined => {
    if (value(i) === 'mapping') {
      const start = tokens[i].start
      i++
      if (value(i) !== '(') return undefined
      skipBalanced('(', ')')
      let end = tokens[i - 1]?.end ?? start
      while (value(i) === '[') {
        skipBalanced('[', ']')
        end = tokens[i - 1]?.end ?? end
      }
      return source.slice(start, end)
    }
    if (tokens[i]?.kind !== 'id') return undefined
    const start = tokens[i].start
    let end = tokens[i].end
    i++
    while (value(i) === '.' && tokens[i + 1]?.kind === 'id') {
      end = tokens[i + 1].end
      i += 2
    }
    while (value(i) === '[') {
      skipBalanced('[', ']')
      end = tokens[i - 1]?.end ?? end
    }
    return source.slice(start, end)
  }

  const parseStateVariable = (contract: ContractDocumentation): void => {
    const declIdx = i
    const typeText = readTypeExpression()
    if (!typeText) {
      skipStatement()
      return
    }
    let visibility: string | undefined
    let name: string | undefined
    let valid = true
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === ';') {
        i++
        break
      }
      if (v === '=') {
        skipStatement()
        break
      }
      if (v === '}') {
        valid = false
        break
      }
      if (v === 'override') {
        i++
        if (value(i) === '(') skipBalanced('(', ')')
        continue
      }
      if (VAR_MODIFIERS.has(v)) {
        if (v === 'public') visibility = 'public'
        i++
        continue
      }
      if (tokens[i].kind === 'id' && name === undefined) {
        name = v
        i++
        continue
      }
      valid = false
      skipStatement()
      break
    }
    if (!valid || !name || visibility !== 'public') return
    contract.declarations.push({
      kind: 'getter',
      name,
      parameters: getterParameters(typeText),
      visibility: 'public',
      documentation: docFor(declIdx),
      sourceOrder: orderOf(tokens[declIdx].start),
      sourceUnit: unit.path,
      container: contract.name,
    })
  }

  const parseContractBody = (contract: ContractDocumentation): void => {
    while (i < tokens.length) {
      const v = tokens[i].value
      if (v === '}') {
        i++
        return
      }
      if (v === ';') {
        i++
        continue
      }
      if (v === 'function') {
        parseFunctionLike('function', contract)
        continue
      }
      if (v === 'constructor') {
        parseFunctionLike('constructor', contract)
        continue
      }
      if (v === 'fallback') {
        parseFunctionLike('fallback', contract)
        continue
      }
      if (v === 'receive') {
        parseFunctionLike('receive', contract)
        continue
      }
      if (v === 'modifier') {
        i++
        if (tokens[i]?.kind === 'id') i++
        if (value(i) === '(') skipBalanced('(', ')')
        while (i < tokens.length && value(i) !== '{' && value(i) !== ';' && value(i) !== '}') i++
        if (value(i) === '{') skipBalanced('{', '}')
        else if (value(i) === ';') i++
        continue
      }
      if (v === 'event') {
        parseEventOrError('event', contract)
        continue
      }
      if (v === 'error') {
        parseEventOrError('error', contract)
        continue
      }
      if (v === 'struct') {
        parseStruct(contract.name)
        continue
      }
      if (v === 'enum') {
        parseEnum(contract.name)
        continue
      }
      if (v === 'type') {
        parseValueType(contract.name)
        continue
      }
      if (v === 'using') {
        skipStatement()
        continue
      }
      if (v === '{') {
        skipBalanced('{', '}')
        continue
      }
      if (tokens[i].kind === 'id' || v === 'mapping') {
        parseStateVariable(contract)
        continue
      }
      i++
    }
  }

  const parseContractDecl = (kind: ContractKind, keywordCount: number): void => {
    const declIdx = i
    i += keywordCount
    if (tokens[i]?.kind !== 'id') return
    const name = tokens[i].value
    i++
    const parents: ParentReference[] = []
    while (i < tokens.length && value(i) !== '{' && value(i) !== ';') {
      if (value(i) === 'is') {
        i++
        while (i < tokens.length && value(i) !== '{' && value(i) !== ';') {
          if (tokens[i].kind === 'id') {
            let parentName = tokens[i].value
            i++
            while (value(i) === '.' && tokens[i + 1]?.kind === 'id') {
              parentName += `.${tokens[i + 1].value}`
              i += 2
            }
            if (value(i) === '(') skipBalanced('(', ')')
            parents.push({ name: parentName })
          } else i++
        }
        break
      }
      i++
    }
    const contract: ContractDocumentation = {
      id: `${unit.path}:${name}:${tokens[declIdx].start}`,
      name,
      qualifiedName: `${unit.path}:${name}`,
      sourceUnit: unit.path,
      kind,
      parents,
      declarations: [],
      documentation: docFor(declIdx),
      sourceOrder: orderOf(tokens[declIdx].start),
    }
    parsed.contracts.push(contract)
    parsed.types.contractLike.add(name)
    if (value(i) === ';') {
      i++
      return
    }
    if (value(i) !== '{') return // truncated declaration: keep the contract, no body
    i++
    parseContractBody(contract)
  }

  // Pragma is single-line by grammar; malformed source may lack the `;`, so never scan past EOL,
  // and stop at structural keywords that can never appear inside a pragma directive.
  const PRAGMA_STOPPERS = new Set([
    'contract',
    'interface',
    'library',
    'abstract',
    'import',
    'pragma',
    'struct',
    'enum',
    'using',
    'function',
    'error',
    'event',
    'type',
  ])
  const skipPragma = (): void => {
    const lineEnd = source.indexOf('\n', tokens[i].start)
    i++
    while (i < tokens.length && (lineEnd === -1 || tokens[i].start < lineEnd)) {
      const v = tokens[i].value
      if (v === ';') {
        i++
        return
      }
      if (PRAGMA_STOPPERS.has(v)) return
      i++
    }
  }

  while (i < tokens.length) {
    const v = tokens[i].value
    if (v === 'import') {
      parseImport()
      continue
    }
    if (v === 'pragma') {
      skipPragma()
      continue
    }
    if (v === 'using') {
      skipStatement()
      continue
    }
    if (v === 'abstract' && value(i + 1) === 'contract') {
      parseContractDecl('abstract-contract', 2)
      continue
    }
    if (v === 'contract') {
      parseContractDecl('contract', 1)
      continue
    }
    if (v === 'interface') {
      parseContractDecl('interface', 1)
      continue
    }
    if (v === 'library') {
      parseContractDecl('library', 1)
      continue
    }
    if (v === 'struct') {
      parseStruct(undefined)
      continue
    }
    if (v === 'enum') {
      parseEnum(undefined)
      continue
    }
    if (v === 'type') {
      parseValueType(undefined)
      continue
    }
    if (v === 'function') {
      parseFunctionLike('function', undefined) // free function: consume, never a candidate
      continue
    }
    if (v === 'error' || v === 'event') {
      skipStatement()
      continue
    }
    i++
  }
}

// ===================== Vyper parsing =====================

const VYPER_KEYWORD_STATEMENTS = new Set([
  'def',
  'event',
  'struct',
  'interface',
  'enum',
  'flag',
  'implements',
  'import',
  'from',
  'exports',
  'pragma',
  'if',
  'for',
  'log',
  'assert',
  'return',
  'pass',
])

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

function vyperGetterParams(typeText: string): SourceParameter[] {
  const params: SourceParameter[] = []
  let current = typeText.trim()
  for (let guard = 0; guard < 16; guard++) {
    const hashMap = /^HashMap\[(.+)\]$/.exec(current)
    if (hashMap) {
      const parts = splitTopLevel(hashMap[1], ',')
      if (parts.length < 2) break
      params.push({ sourceType: parts[0].trim() })
      current = parts.slice(1).join(',').trim()
      continue
    }
    const dynArray = /^DynArray\[(.+)\]$/.exec(current)
    if (dynArray) {
      params.push({ sourceType: 'uint256' })
      current = splitTopLevel(dynArray[1], ',')[0].trim()
      continue
    }
    if (/^(Bytes|String)\[/.test(current)) break
    const staticArray = /^(.+)\[[0-9]+\]$/.exec(current)
    if (staticArray) {
      params.push({ sourceType: 'uint256' })
      current = staticArray[1].trim()
      continue
    }
    break
  }
  return params
}

/** Strip a `#` comment from a Vyper line, ignoring `#` inside quoted string values. */
function stripVyperComment(line: string): string {
  let quote: string | undefined
  for (let c = 0; c < line.length; c++) {
    const ch = line[c]
    if (quote) {
      if (ch === '\\') c++
      else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#') return line.slice(0, c)
  }
  return line
}

function collectVyperSignature(lines: string[], start: number): { text: string; next: number } | undefined {
  let text = ''
  let depth = 0
  for (let k = start; k < lines.length && k < start + 40; k++) {
    const line = stripVyperComment(lines[k])
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
      else if (ch === ':' && depth === 0 && (text + line.slice(0, c)).includes(')')) {
        return { text: text + line.slice(0, c), next: k + 1 }
      }
    }
    text += `${line} `
  }
  return undefined
}

function vyperParams(signature: string): SourceParameter[] {
  const open = signature.indexOf('(')
  if (open === -1) return []
  let depth = 0
  let close = -1
  for (let i = open; i < signature.length; i++) {
    const ch = signature[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') {
      depth--
      if (depth === 0 && ch === ')') {
        close = i
        break
      }
    }
  }
  if (close === -1) close = signature.length
  const inner = signature.slice(open + 1, close)
  const params: SourceParameter[] = []
  for (const segment of splitTopLevel(inner, ',')) {
    const part = segment.trim()
    if (!part) continue
    const colon = topLevelIndexOf(part, ':')
    if (colon === -1) continue
    const name = part.slice(0, colon).trim()
    let typeText = part.slice(colon + 1).trim()
    let hasDefault = false
    const eq = topLevelIndexOf(typeText, '=')
    if (eq !== -1) {
      typeText = typeText.slice(0, eq).trim()
      hasDefault = true
    }
    if (!name) continue
    params.push({ name, sourceType: typeText, hasDefault: hasDefault || undefined })
  }
  return params
}

function readVyperDocstring(
  lines: string[],
  start: number,
  requireIndent: boolean,
): { lines: string[]; next: number } | undefined {
  let k = start
  while (k < lines.length && (!lines[k].trim() || lines[k].trim().startsWith('#'))) k++
  if (k >= lines.length) return undefined
  const raw = lines[k]
  if (requireIndent && !/^[ \t]/.test(raw)) return undefined
  const trimmed = raw.trim()
  const quote = trimmed.startsWith('"""') ? '"""' : trimmed.startsWith("'''") ? "'''" : undefined
  if (!quote) return undefined
  const after = trimmed.slice(3)
  const inlineClose = after.indexOf(quote)
  if (inlineClose !== -1) return { lines: [after.slice(0, inlineClose)], next: k + 1 }
  const collected: string[] = after ? [after] : []
  for (k += 1; k < lines.length; k++) {
    const closeAt = lines[k].indexOf(quote)
    if (closeAt !== -1) {
      collected.push(lines[k].slice(0, closeAt))
      return { lines: collected, next: k + 1 }
    }
    collected.push(lines[k])
  }
  return { lines: collected, next: k } // unterminated: degrade to what we have
}

function parseVyperUnit(unit: SourceUnit, parsed: ParsedBundle): void {
  const lines = unit.content.split('\n')
  const declarations: DeclarationDocumentation[] = []
  const unitImports: UnitImport[] = []
  const unitExports: ModuleExport[] = []
  parsed.imports.set(unit.path, unitImports)
  parsed.exports.set(unit.path, unitExports)
  const orderOf = (lineIdx: number) => unit.order * 1_000_000_000 + lineIdx
  let moduleDoc: ParsedDocumentation | undefined
  let sawStatement = false
  let pendingDecorators: string[] = []
  let idx = 0

  while (idx < lines.length) {
    const raw = lines[idx]
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      idx++
      continue
    }
    const indented = /^[ \t]/.test(raw)
    if (!sawStatement && !indented && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
      const docstring = readVyperDocstring(lines, idx, false)
      if (docstring) {
        moduleDoc = parseDocLines(docstring.lines)
        idx = docstring.next
        sawStatement = true
        continue
      }
    }
    if (indented) {
      idx++
      continue
    }
    sawStatement = true

    if (trimmed.startsWith('@')) {
      pendingDecorators.push(stripVyperComment(trimmed).slice(1).replace(/\(.*$/, '').trim())
      idx++
      continue
    }

    if (/^def\s/.test(trimmed)) {
      const declLine = idx
      const signature = collectVyperSignature(lines, idx)
      const decorators = pendingDecorators
      pendingDecorators = []
      if (!signature) {
        idx++
        continue
      }
      idx = signature.next
      const named = /^def\s+([A-Za-z_$][\w$]*)\s*\(/.exec(signature.text)
      if (!named) continue
      const name = named[1]
      let documentation: ParsedDocumentation | undefined
      const docstring = readVyperDocstring(lines, idx, true)
      if (docstring) {
        documentation = parseDocLines(docstring.lines)
        idx = docstring.next
      }
      const external = decorators.some(d => d === 'external' || d === 'public' || d === 'deploy')
      const isConstructor = name === '__init__' || decorators.includes('deploy')
      declarations.push({
        kind: isConstructor ? 'constructor' : 'function',
        name,
        parameters: vyperParams(signature.text),
        visibility: external ? 'external' : 'internal',
        documentation,
        sourceOrder: orderOf(declLine),
        sourceUnit: unit.path,
      })
      continue
    }

    pendingDecorators = []

    const eventMatch = /^event\s+([A-Za-z_$][\w$]*)\s*:/.exec(trimmed)
    if (eventMatch) {
      declarations.push({
        kind: 'event',
        name: eventMatch[1],
        parameters: [],
        sourceOrder: orderOf(idx),
        sourceUnit: unit.path,
      })
      idx++
      continue
    }

    const structMatch = /^struct\s+([A-Za-z_$][\w$]*)\s*:/.exec(trimmed)
    if (structMatch) {
      idx++
      const fields: string[] = []
      while (idx < lines.length && (!lines[idx].trim() || /^[ \t]/.test(lines[idx]))) {
        const field = /^\s+([A-Za-z_$][\w$]*)\s*:\s*(.+?)\s*(#.*)?$/.exec(lines[idx])
        if (field) fields.push(field[2])
        idx++
      }
      registerTypeName(parsed, unit.path, structMatch[1], `struct:${JSON.stringify(fields)}`, key =>
        parsed.types.structs.set(key, fields),
      )
      continue
    }

    const interfaceMatch = /^interface\s+([A-Za-z_$][\w$]*)\s*:/.exec(trimmed)
    if (interfaceMatch) {
      parsed.types.contractLike.add(interfaceMatch[1])
      idx++
      while (idx < lines.length && (!lines[idx].trim() || /^[ \t]/.test(lines[idx]))) idx++
      continue
    }

    // `import <path> [as <alias>]` / `from <path> import <name> [as <alias>]`
    const importMatch = /^import\s+([\w.]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(stripVyperComment(trimmed))
    if (importMatch) {
      const path = importMatch[1]
      unitImports.push({ path, unitAlias: importMatch[2] ?? (path.split('.').pop() as string), symbols: [] })
      idx++
      continue
    }
    const fromMatch = /^from\s+([\w.]*)\s+import\s+([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(
      stripVyperComment(trimmed),
    )
    if (fromMatch) {
      const base = fromMatch[1]
      const name = fromMatch[2]
      unitImports.push({
        path: base ? `${base}.${name}` : name,
        unitAlias: fromMatch[3] ?? name,
        symbols: [{ name }],
      })
      idx++
      continue
    }
    if (/^exports\s*:/.test(trimmed)) {
      // May be a single reference or a parenthesised list spanning several lines.
      let statement = stripVyperComment(trimmed)
      let open = (statement.match(/\(/g) ?? []).length
      let close = (statement.match(/\)/g) ?? []).length
      idx++
      while (idx < lines.length && open > close) {
        const nextLine = stripVyperComment(lines[idx])
        statement += ` ${nextLine}`
        open += (nextLine.match(/\(/g) ?? []).length
        close += (nextLine.match(/\)/g) ?? []).length
        idx++
      }
      // A reference is `alias.member` or a full dotted module path (`lib.ownable.update_owner`);
      // the member is always the last segment, everything before it names the module.
      for (const ref of statement
        .slice(statement.indexOf(':') + 1)
        .matchAll(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/g)) {
        const full = ref[0]
        const lastDot = full.lastIndexOf('.')
        unitExports.push({ alias: full.slice(0, lastDot), member: full.slice(lastDot + 1) })
      }
      continue
    }
    if (/^(enum|flag)\s/.test(trimmed) || /^(implements|initializes|uses)\b/.test(trimmed)) {
      idx++
      while (idx < lines.length && /^[ \t]/.test(lines[idx]) && lines[idx].trim()) idx++
      continue
    }

    const storage = /^([A-Za-z_$][\w$]*)\s*:\s*(.+?)\s*$/.exec(stripVyperComment(trimmed).trim())
    if (storage && !VYPER_KEYWORD_STATEMENTS.has(storage[1])) {
      const publicWrap = /^public\((.*)\)$/.exec(storage[2].trim())
      if (publicWrap) {
        declarations.push({
          kind: 'getter',
          name: storage[1],
          parameters: vyperGetterParams(publicWrap[1]),
          visibility: 'external',
          sourceOrder: orderOf(idx),
          sourceUnit: unit.path,
        })
      }
      idx++
      continue
    }

    idx++
  }

  if (!declarations.length && !moduleDoc && !unitExports.length) return
  const baseName = unit.path
    .split('/')
    .pop()
    ?.replace(/\.[^.]*$/, '')
  const name = baseName || 'VyperContract'
  parsed.contracts.push({
    id: `${unit.path}:${name}:0`,
    name,
    qualifiedName: `${unit.path}:${name}`,
    sourceUnit: unit.path,
    kind: 'vyper-module',
    parents: [],
    declarations,
    documentation: moduleDoc,
    sourceOrder: unit.order * 1_000_000_000,
  })
}

// ===================== Bundle parsing =====================

export function parseBundle(bundle: SourceBundle, language: 'solidity' | 'vyper'): ParsedBundle {
  const parsed: ParsedBundle = {
    language,
    contracts: [],
    types: {
      structs: new Map(),
      enums: new Set(),
      valueTypes: new Map(),
      contractLike: new Set(),
      ambiguous: new Set(),
      registry: new Map(),
    },
    imports: new Map(),
    exports: new Map(),
    units: [],
  }
  for (const unit of bundle.units) {
    parsed.units.push(unit.path)
    try {
      if (language === 'solidity') parseSolidityUnit(unit, parsed)
      else parseVyperUnit(unit, parsed)
    } catch {
      // One broken unit must never sink the whole bundle.
    }
  }
  return parsed
}
