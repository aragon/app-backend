export interface NatspecTags {
  notice?: string
  param?: Record<string, string>
  return?: string
  inheritdoc?: string
  [key: string]: string | Record<string, string> | undefined
}

export interface NatspecDetails {
  keyword: string
  name: string
  tags: NatspecTags
}

export interface NatspecContract {
  name: string
  superClasses: string[]
  tags: Record<string, string>
  details: Record<string, NatspecDetails>
  overloads?: Record<string, NatspecDetails[]>
}

export enum CompilerType {
  SOLIDITY = 'solidity',
  VYPER = 'vyper',
}

function concatNatspecDetails(det0: NatspecDetails, det1: NatspecDetails) {
  return {
    keyword: det0.keyword || det1.keyword,
    name: det0.name || det1.name,
    tags: Object.assign({}, det0.tags, det1.tags),
  }
}

const KNOWN_NATSPEC_TAGS = new Set(['title', 'author', 'notice', 'dev', 'param', 'return', 'inheritdoc', 'custom'])

function scanWord(source: string, pos: number): [number, string] {
  const delimiters = [' ', '(', ':', '\n', '\t', '\r']
  let endIdx = source.length

  for (const delimiter of delimiters) {
    const delimiterIdx = source.indexOf(delimiter, pos)
    if (delimiterIdx !== -1 && delimiterIdx < endIdx) {
      endIdx = delimiterIdx
    }
  }

  return [endIdx, source.substring(pos, endIdx)]
}

export function scanNatspecBlock(source: string, pos: number, terminator: string): [number, NatspecDetails] {
  let match = ''
  const scanMatches = ['\n']
  let nextPos = -1
  let ended = false
  if (terminator) scanMatches.push(terminator)
  const details: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {} as NatspecTags,
  }

  let prevPos = pos
  ;[match, pos] = scanFirst(source, pos, ['@', ...scanMatches])

  let tag = ''
  let param = ''

  const appendContinuation = (raw: string) => {
    if (!tag) return
    let line = raw.trim()
    if (line.startsWith('* ')) {
      line = line.substring(2)
    } else if (line === '*') {
      line = ''
    }
    if (!line) return
    const currentTag = details.tags[tag]
    if (typeof currentTag === 'object') {
      currentTag[param] += ' ' + line
    } else {
      details.tags[tag] += ' ' + line
    }
  }

  while (pos >= 0 && !ended) {
    if (match === '@') {
      const atPos = pos - 1
      let candidate: string
      ;[pos, candidate] = scanWord(source, pos)

      if (!KNOWN_NATSPEC_TAGS.has(candidate)) {
        ;[match, pos] = scanFirst(source, pos, scanMatches)
        let sliceEnd = pos < 0 ? source.length : pos
        if (match === terminator && terminator) sliceEnd -= terminator.length

        const before = source.substring(prevPos, atPos).replace(/[/*\s]/g, '')
        if (before === '') {
          tag = candidate
          param = ''
          details.tags[tag] = source
            .substring(atPos, sliceEnd)
            .replace(/^@\S+\s*/, '')
            .trim()
        } else {
          appendContinuation(source.substring(prevPos, sliceEnd))
        }
        if (match === terminator || pos < 0) {
          ended = true
        }
      } else {
        tag = candidate
        if (tag === 'param') {
          pos = skipInlineWhitespace(source, pos)
          ;[pos, param] = scanWord(source, pos)
        }
        pos = skipInlineWhitespace(source, pos)

        let posEnd: number
        ;[match, posEnd] = scanFirst(source, pos, scanMatches)
        if (match === terminator || pos < 0) {
          ended = true
        }

        const comment = source.substring(pos, posEnd).trim()

        if (tag === 'param') {
          if (details.tags[tag]) {
            const params = details.tags[tag] as Record<string, string>
            params[param] = comment
          } else {
            details.tags[tag] = { [param]: comment }
          }
        } else {
          details.tags[tag] = comment
        }

        pos = posEnd
      }
    } else if (match === terminator) {
      ended = true
    } else if (match === '\n') {
      appendContinuation(source.substring(prevPos, pos))
    }

    if (terminator === '') {
      ;[match, nextPos] = scanFirst(source, pos, ['///', '\n'])
      if (match === '\n' || nextPos < 0) {
        ended = true
      } else {
        pos = nextPos
      }
    }

    if (ended) break

    prevPos = pos
    ;[match, pos] = scanFirst(source, pos, ['@', ...scanMatches])
  }

  return [pos, details]
}

function isVyperOrSolidityContract(source: string): CompilerType | null {
  if (!source || source.trim().length === 0) {
    return null
  }

  const lines = source.split('\n').slice(0, 200)

  const solidityPatterns = {
    pragma: /^pragma\s+(solidity|abicoder)/,
    import: /^import\s+["']|^import\s+\{.*\}\s+from/,
    contract: /^(contract|library|interface|abstract\s+contract)\s+\w+/,
    modifier: /^\s*modifier\s+\w+/,
    function: /^\s*function\s+\w+/,
    visibility: /\s+(public|private|internal|external)\s*[\{;(]/,
    mapping: /mapping\s*\(/,
    struct: /^\s*struct\s+\w+/,
    enum: /^\s*enum\s+\w+/,
    event: /^\s*event\s+\w+/,
    semicolon: /;\s*$/,
    solidityTypes: /\b(uint256|uint8|uint|int256|int|bytes32|bytes|address\s+payable)\b/,
    memoryStorage: /\b(memory|storage|calldata)\b/,
    require: /\brequire\s*\(/,
    assembly: /^\s*assembly\s*\{/,
  }

  const vyperPatterns = {
    version: /^#\s*@version\s*[\^~]?[\d.]+/,
    pragmaVersion: /^#\s*pragma\s+version\s*[\^~]?[\d.]+/,
    decorator: /^@(external|internal|view|pure|payable|nonpayable|nonreentrant)$/,
    implements: /^implements:\s*\w+/,
    interface: /^interface\s+\w+:/,
    vyperImport: /^from\s+(vyper\.interfaces|ethereum\.events)\s+import/,
    vyperImportAs: /^import\s+\w+\s+as\s+\w+$/,
    def: /^def\s+\w+\s*\([^)]*\)\s*(->\s*\w+)?:/,
    selfUsage: /\bself\.\w+/,
    vyperTypes: /\b(uint256|int128|decimal|bool|address|bytes32|Bytes\[\d+\]|String\[\d+\]|DynArray\[|HashMap\[)\b/,
    vyperConstants: /^[A-Z_]+:\s*(constant|immutable)\(/,
    vyperEvent: /^event\s+\w+:\s*$/,
    vyperStruct: /^struct\s+\w+:\s*$/,
    vyperStorage: /^\w+:\s+(public\()?(\w+|\w+\[[\w\[\]]+\])/,
    pythonComment: /^#(?!\s*@version|\s*pragma)/,
    tripleQuote: /^"""/,
  }

  let solidityScore = 0
  let vyperScore = 0
  let inMultilineComment = false
  let inTripleQuote = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue

    if (trimmed.startsWith('/*')) {
      inMultilineComment = true
      continue
    }
    if (inMultilineComment) {
      if (trimmed.includes('*/')) {
        inMultilineComment = false
      }
      continue
    }

    if (trimmed.startsWith('"""')) {
      inTripleQuote = !inTripleQuote
      vyperScore += 0.5 // Triple quotes are Vyper-specific
      continue
    }
    if (inTripleQuote) continue

    if (trimmed.startsWith('//')) {
      solidityScore += 0.1
      continue
    }
    if (trimmed.startsWith('#') && !trimmed.match(/^#\s*(@version|pragma)/)) {
      vyperScore += 0.1
      continue
    }

    for (const [key, pattern] of Object.entries(solidityPatterns)) {
      if (pattern.test(trimmed)) {
        switch (key) {
          case 'pragma':
          case 'contract':
          case 'import':
            solidityScore += 10
            break
          case 'function':
          case 'modifier':
          case 'mapping':
          case 'struct':
          case 'enum':
            solidityScore += 5
            break
          case 'semicolon':
            solidityScore += 0.5
            break
          default:
            solidityScore += 2
        }
      }
    }

    for (const [key, pattern] of Object.entries(vyperPatterns)) {
      if (pattern.test(trimmed)) {
        switch (key) {
          case 'version':
          case 'pragmaVersion':
            vyperScore += 20
            break
          case 'def':
          case 'implements':
          case 'vyperImport':
            vyperScore += 10
            break
          case 'decorator': {
            const nextLineIdx = i + 1
            if (nextLineIdx < lines.length && /^def\s+/.test(lines[nextLineIdx].trim())) {
              vyperScore += 8
            } else {
              vyperScore += 3
            }
            break
          }
          case 'selfUsage':
            vyperScore += 1
            break
          case 'vyperStorage':
          case 'vyperEvent':
          case 'vyperStruct':
            vyperScore += 5
            break
          default:
            vyperScore += 2
        }
      }
    }

    if (solidityScore > 30) return CompilerType.SOLIDITY
    if (vyperScore > 30) return CompilerType.VYPER
  }

  if (solidityScore === 0 && vyperScore === 0) {
    return null
  }

  return solidityScore > vyperScore ? CompilerType.SOLIDITY : CompilerType.VYPER
}

export function extractNatSpec(source: string, compilerVersion?: string) {
  // If a compiler version is provided, use it to determine the compiler type
  let compilerType: CompilerType | null
  if (compilerVersion) {
    compilerType = detectCompilerFromVersion(compilerVersion)
  } else {
    compilerType = isVyperOrSolidityContract(source)
  }

  if (compilerType === CompilerType.VYPER) {
    return extractVyperNatSpec(source)
  } else if (compilerType === CompilerType.SOLIDITY) {
    return extractSolidityNatSpec(source)
  }
  return {}
}

function detectCompilerFromVersion(compilerVersion: string): CompilerType | null {
  const version = compilerVersion.toLowerCase().trim()

  if (
    version.includes('solc') ||
    version.includes('solidity') ||
    version.includes('commit') ||
    /^(v|zkvm-)?0\.[4-9]\./.test(version)
  ) {
    return CompilerType.SOLIDITY
  }

  if (version.includes('vyper') || (/^v?[\d.]+$/.test(version) && !version.includes('solc'))) {
    return CompilerType.VYPER
  }

  return null
}

function scanVyperDocstring(source: string, pos: number): [number, NatspecDetails] {
  const details: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {} as NatspecTags,
  }

  // Find the closing """
  const endPos = source.indexOf('"""', pos)
  if (endPos === -1) return [pos, details]

  const docstring = source.substring(pos, endPos)
  const lines = docstring.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('@notice')) {
      details.tags.notice = trimmed.substring(7).trim()
    } else if (trimmed.startsWith('@param')) {
      const parts = trimmed.substring(6).trim().split(' ')
      if (parts.length >= 2) {
        const paramName = parts[0]
        const paramDesc = parts.slice(1).join(' ')
        if (!details.tags.param) details.tags.param = {}
        ;(details.tags.param as Record<string, string>)[paramName] = paramDesc
      }
    } else if (trimmed.startsWith('@return')) {
      details.tags.return = trimmed.substring(7).trim()
    }
  }

  return [endPos + 3, details]
}

function scanVyperComment(source: string, pos: number): [number, NatspecDetails] {
  const details: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {} as NatspecTags,
  }

  // Find end of line
  const endPos = source.indexOf('\n', pos)
  const commentEnd = endPos === -1 ? source.length : endPos
  const comment = source.substring(pos + 2, commentEnd).trim() // Skip "##"

  if (comment.startsWith('@notice')) {
    details.tags.notice = comment.substring(7).trim()
  } else if (comment.startsWith('@param')) {
    const parts = comment.substring(6).trim().split(' ')
    if (parts.length >= 2) {
      const paramName = parts[0]
      const paramDesc = parts.slice(1).join(' ')
      if (!details.tags.param) details.tags.param = {}
      ;(details.tags.param as Record<string, string>)[paramName] = paramDesc
    }
  }

  return [commentEnd, details]
}

function extractVyperNatSpec(source: string) {
  let pos = 0
  let match = ''
  let currentContract: NatspecContract = {
    name: '',
    superClasses: [],
    tags: {},
    details: {},
  }
  const natspec: Record<string, NatspecContract> = {}
  let natspecDetails: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {} as NatspecTags,
  }
  let newDetails: NatspecDetails

  while (pos >= 0) {
    ;[match, pos] = scanFirst(source, pos, [
      '"""', // Multi-line docstring
      '#', // Single-line comment
      'def ', // Function definition
      'event ', // Event definition
      'interface ', // Interface definition
      '@external', // External function decorator
      '@internal', // Internal function decorator
    ])

    if (pos < 0) break

    switch (match) {
      case '"""':
        ;[pos, newDetails] = scanVyperDocstring(source, pos)
        natspecDetails = concatNatspecDetails(natspecDetails, newDetails)
        break
      case '#':
        if (source[pos] === '#') {
          ;[pos, newDetails] = scanVyperComment(source, pos - 1)
          natspecDetails = concatNatspecDetails(natspecDetails, newDetails)
        } else {
          ;[match, pos] = scanFirst(source, pos, ['\n'])
        }
        break
      case 'def ': {
        pos = skipWhitespace(source, pos)
        let name: string
        ;[pos, name] = scanWord(source, pos)
        natspecDetails.name = name
        natspecDetails.keyword = 'function'
        currentContract.details[natspecDetails.name] = natspecDetails
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {} as NatspecTags,
        }
        break
      }
      case 'event ': {
        pos = skipWhitespace(source, pos)
        let name: string
        ;[pos, name] = scanWord(source, pos)
        natspecDetails.name = name
        natspecDetails.keyword = 'event'
        currentContract.details[natspecDetails.name] = natspecDetails
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {} as NatspecTags,
        }
        break
      }
      case 'interface ': {
        pos = skipWhitespace(source, pos)
        let name: string
        ;[pos, name] = scanWord(source, pos)
        currentContract = {
          name,
          superClasses: [],
          tags: natspecDetails.tags as Record<string, string>,
          details: {},
        }
        natspec[name] = currentContract
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {} as NatspecTags,
        }
        break
      }
      case '@external':
      case '@internal':
        ;[match, pos] = scanFirst(source, pos, ['\n'])
        break
    }
  }

  // If no explicit contract found, create a default one
  if (Object.keys(natspec).length === 0) {
    currentContract.name = 'VyperContract'
    natspec.VyperContract = currentContract
  }

  return natspec
}

function extractSolidityNatSpec(source: string) {
  let pos = 0
  let posEnd = 0
  let match = ''
  let currentContract: NatspecContract = {
    name: '',
    superClasses: [],
    tags: {},
    details: {},
  }
  const natspec: Record<string, NatspecContract> = {}
  let natspecDetails: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {} as NatspecTags,
  }
  let newDetails: NatspecDetails

  while (pos >= 0) {
    ;[match, pos] = scanFirst(source, pos, [
      '/*',
      '//',
      'contract ',
      'interface ',
      'function ',
      'error ',
      'event ',
      'constructor(',
      'constructor ',
    ])

    if (pos < 0) break

    switch (match) {
      case '/*':
        if (source[pos] === '*') {
          ;[pos, newDetails] = scanNatspecBlock(source, pos + 1, '*/')
          natspecDetails = concatNatspecDetails(natspecDetails, newDetails)
        } else {
          ;[match, pos] = scanFirst(source, pos, ['*/'])
        }
        break
      case '//':
        if (source[pos] === '/') {
          ;[pos, newDetails] = scanNatspecBlock(source, pos + 1, '')
          natspecDetails = concatNatspecDetails(natspecDetails, newDetails)
        } else {
          ;[match, pos] = scanFirst(source, pos, ['\n'])
        }
        break
      case 'contract ':
      case 'interface ': {
        pos = skipWhitespace(source, pos)
        let name: string
        ;[pos, name] = scanWord(source, pos)
        ;[match, pos] = scanFirst(source, pos, ['is', '{'])
        const superClasses: string[] = []
        while (match !== '{') {
          ;[match, posEnd] = scanFirst(source, pos, [',', '{'])
          // Malformed/truncated source: the declaration has no closing brace.
          // Stop here instead of looping forever on a position that never advances.
          if (posEnd < 0) {
            pos = -1
            break
          }
          superClasses.push(source.substring(pos, posEnd - 1).trim())
          pos = posEnd
        }
        currentContract = {
          name,
          superClasses,
          tags: natspecDetails.tags as Record<string, string>,
          details: {},
        }
        natspec[name] = currentContract
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {} as NatspecTags,
        }
        break
      }
      default: {
        pos = skipWhitespace(source, pos)
        if (match.slice(-1) === '(') pos--
        ;[, posEnd] = scanFirst(source, pos, [' ', '('])
        if (pos < 0) break
        natspecDetails.name = source.substring(pos, posEnd - 1)
        natspecDetails.keyword = match.slice(0, -1)
        if (natspecDetails.keyword === 'constructor') {
          natspecDetails.name = `constructor for ${currentContract.name}`
        }
        const existingDetails = currentContract.details[natspecDetails.name]
        if (existingDetails) {
          if (!currentContract.overloads) currentContract.overloads = {}
          if (!currentContract.overloads[natspecDetails.name]) {
            currentContract.overloads[natspecDetails.name] = [existingDetails]
          }
          currentContract.overloads[natspecDetails.name].push(natspecDetails)
        }
        currentContract.details[natspecDetails.name] = natspecDetails
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {} as NatspecTags,
        }
        pos = posEnd
        break
      }
    }
  }

  return natspec
}

/**
 * Collapse inheritance tree of a map of NatspecContracts into a single NatspecDetails object.
 * @param natspec The map of NatspecContracts to collapse.
 * @param contract The name of the contract to collapse.
 * @returns The contract with the NatspecDetails added for all inherited functions.
 */
export function collapseNatspec(natspec: Record<string, NatspecContract>, contract: string): NatspecContract {
  const collapsed = { ...natspec[contract] }
  if (collapsed.superClasses) {
    for (const superClass of collapsed.superClasses) {
      if (!natspec[superClass]) continue
      const superNatspec = collapseNatspec(natspec, superClass)
      collapsed.details = Object.fromEntries(
        Object.entries(collapsed.details).map(([name, details]) => {
          if (details.tags?.inheritdoc !== undefined) {
            const inheritDetails = natspec[details.tags?.inheritdoc as string]?.details[name]
            if (inheritDetails !== undefined) {
              details.tags?.inheritdoc && delete details.tags.inheritdoc
              details.tags = { ...inheritDetails.tags, ...(details.tags || {}) }
            }
          }
          if (details.tags && Object.keys(details.tags).length === 0) {
            const superDetails = superNatspec.details[name]
            return [name, superDetails !== undefined ? superDetails : details]
          }
          return [name, details]
        }),
      )
      collapsed.details = { ...superNatspec.details, ...collapsed.details }

      if (superNatspec.overloads) {
        const mergedOverloads: Record<string, NatspecDetails[]> = { ...(collapsed.overloads || {}) }
        for (const [name, entries] of Object.entries(superNatspec.overloads)) {
          mergedOverloads[name] = [...(mergedOverloads[name] || []), ...entries]
        }
        collapsed.overloads = mergedOverloads
      }
    }
  }
  return collapsed
}

/** Starts scanning str at start to find the first match from searches. If multiple matches complete at the
 * same position in str, it prefers the one which is listed first in searches.
 */
const scanFirst = (str: string, start: number, searches: string[]): [string, number] => {
  const matches: [number, number][] = []
  for (let idx = start; idx < str.length; idx++) {
    for (let matchIdx = 0; matchIdx < matches.length; matchIdx++) {
      const [srchIdx, pos] = matches[matchIdx]
      if (searches[srchIdx][pos + 1] === str[idx]) {
        matches[matchIdx][1]++
        if (pos + 2 === searches[srchIdx].length) {
          return [searches[srchIdx], idx + 1]
        }
      } else {
        matches.splice(matchIdx, 1)
        matchIdx--
      }
    }

    for (let srchIdx = 0; srchIdx < searches.length; srchIdx++) {
      if (searches[srchIdx][0] === str[idx]) {
        matches.push([srchIdx, 0])
        if (searches[srchIdx].length === 1) {
          return [searches[srchIdx], idx + 1]
        }
      }
    }
  }
  return ['', -1]
}

const skipWhitespace = (str: string, start: number) => {
  let pos = start
  while (' \t\n\r\v'.includes(str[pos]) && pos < str.length) pos++
  return pos
}

const skipInlineWhitespace = (str: string, start: number) => {
  let pos = start
  while ((str[pos] === ' ' || str[pos] === '\t') && pos < str.length) pos++
  return pos
}

function parseSourceCode(input: string) {
  input = input.trim()

  if (input.startsWith('{')) {
    try {
      const sourcesObj = JSON.parse(input.slice(1, input.length - 1)).sources
      let sources = ''

      for (const methodName in sourcesObj) {
        // eslint-disable-next-line no-prototype-builtins
        if (sourcesObj.hasOwnProperty(methodName)) {
          sources = sources + sourcesObj[methodName].content
        }
      }

      return sources
    } catch {
      return input
    }
  } else {
    return input
  }
}

/**
 * Score how well a natspec entry matches a set of ABI inputs: +1 for every input name documented
 * by a `@param`, plus a 0.5 tie-breaker when the entry documents exactly as many params as the ABI
 * function has. Used to disambiguate function overloads that share a name.
 */
function scoreParamMatch(details: NatspecDetails, inputs: any[]): number {
  const params = details.tags.param as Record<string, string> | undefined
  let score = 0
  for (const input of inputs) {
    if (input.name && params?.[input.name] !== undefined) score++
  }
  const documentedCount = params ? Object.keys(params).length : 0
  if (documentedCount === inputs.length) score += 0.5
  return score
}

/**
 * From a list of same-name natspec entries (overloads), resolve each against `@inheritdoc` and
 * return the one whose `@param` names best match the given ABI inputs.
 */
function pickBestOverload(
  entries: NatspecDetails[],
  natspec: Record<string, NatspecContract>,
  name: string,
  inputs: any[],
  seen: Set<string>,
): NatspecDetails {
  let best = entries[0]
  let bestScore = -1
  for (const entry of entries) {
    const resolved = resolveInheritdoc(natspec, name, entry, inputs, new Set(seen))
    const score = scoreParamMatch(resolved, inputs)
    if (score > bestScore) {
      best = resolved
      bestScore = score
    }
  }
  return best
}

/**
 * Resolve an `@inheritdoc` tag on a natspec entry against the parsed contract map. When the parent
 * is itself overloaded, the parent overload whose params best match `inputs` is chosen (not just the
 * last-declared one), and inheritance chains are followed with a cycle guard.
 */
function resolveInheritdoc(
  natspec: Record<string, NatspecContract>,
  name: string,
  details: NatspecDetails,
  inputs?: any[],
  seen: Set<string> = new Set(),
): NatspecDetails {
  const parent = details.tags?.inheritdoc as string | undefined
  if (parent === undefined) return details
  if (seen.has(parent)) return details
  seen.add(parent)

  const parentContract = natspec[parent]
  if (!parentContract) return details

  const parentOverloads = parentContract.overloads?.[name]?.filter(entry => entry.keyword === 'function')
  let inheritDetails: NatspecDetails | undefined
  if (parentOverloads && parentOverloads.length > 1 && inputs) {
    inheritDetails = pickBestOverload(parentOverloads, natspec, name, inputs, seen)
  } else {
    inheritDetails = parentContract.details[name]
    if (inheritDetails !== undefined) {
      inheritDetails = resolveInheritdoc(natspec, name, inheritDetails, inputs, seen)
    }
  }
  if (inheritDetails === undefined) return details

  const tags = { ...inheritDetails.tags, ...details.tags }
  delete tags.inheritdoc
  return { ...details, tags }
}

/**
 * Pick the natspec entry of an (possibly overloaded) function that best matches an ABI item,
 * scored by how many of the ABI input names appear in the entry's `@param` tags.
 */
function pickOverloadDetails(
  natspec: Record<string, NatspecContract>,
  collapsed: NatspecContract,
  action: any,
): NatspecDetails {
  const detail = collapsed.details[action.name]
  const overloads = collapsed.overloads?.[action.name]?.filter(entry => entry.keyword === 'function') ?? []

  const candidates: NatspecDetails[] = []
  if (detail?.keyword === 'function') candidates.push(detail)
  for (const entry of overloads) {
    if (!candidates.includes(entry)) candidates.push(entry)
  }

  if (candidates.length === 0) return detail
  if (candidates.length === 1) return candidates[0]

  return pickBestOverload(candidates, natspec, action.name, action.inputs || [], new Set())
}

export function parseNetspec(SourceCode: any, ContractName: string, ABI: any, CompilerType?: any): any {
  const parsedSourceCode = parseSourceCode(SourceCode)
  const noticeText = extractNatSpec(parsedSourceCode, CompilerType)
  const collapsedNatspec = collapseNatspec(noticeText, ContractName)
  const notices = collapsedNatspec.details

  return ABI.map((action: any) => {
    if (action.type === 'function' && notices?.[action.name]) {
      const details = pickOverloadDetails(noticeText, collapsedNatspec, action)
      const params = details.tags.param as Record<string, string> | undefined
      return {
        ...action,
        notice: details.tags.notice as string,
        inputs: (action.inputs || []).map((input: any) => ({
          ...input,
          notice: params?.[input.name],
        })),
      }
    }

    return action
  })
}
