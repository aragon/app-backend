export interface NatspecDetails {
  keyword: string
  name: string
  tags: Record<string, string | Record<string, string>>
}

export interface NatspecContract {
  name: string
  superClasses: string[]
  tags: Record<string, string>
  details: Record<string, NatspecDetails>
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

function scanWord(source: string, pos: number): [number, string] {
  const nextSpaceIdx = source.indexOf(' ', pos)
  if (nextSpaceIdx === -1) {
    const delimiters = ['(', ':', '\n', '\t', '\r']
    let endIdx = source.length

    for (const delimiter of delimiters) {
      const delimiterIdx = source.indexOf(delimiter, pos)
      if (delimiterIdx !== -1 && delimiterIdx < endIdx) {
        endIdx = delimiterIdx
      }
    }

    return [endIdx, source.substring(pos, endIdx)]
  }
  return [nextSpaceIdx, source.substring(pos, nextSpaceIdx)]
}

export function scanNatspecBlock(source: string, pos: number, terminator: string): [number, NatspecDetails] {
  let match = ''
  const scanMatches = ['\n']
  let nextPos = -1
  let ended = false
  if (terminator) scanMatches.push(terminator)
  const details = {
    keyword: '',
    name: '',
    tags: {},
  } satisfies NatspecDetails

  let prevPos = pos
  ;[match, pos] = scanFirst(source, pos, ['@', ...scanMatches])

  let tag = ''
  let param = ''

  while (pos >= 0 && !ended) {
    if (match === '@') {
      ;[pos, tag] = scanWord(source, pos)
      if (tag === 'param') {
        pos = skipWhitespace(source, pos)
        ;[pos, param] = scanWord(source, pos)
      }
      pos = skipWhitespace(source, pos)

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
    } else if (match === terminator) {
      ended = true
    } else if (match === '\n') {
      if (tag) {
        let line = source.substring(prevPos, pos).trim()
        // Remove leading '* ' from multiline comments
        if (line.startsWith('* ')) {
          line = line.substring(2)
        }
        const currentTag = details.tags[tag]
        if (typeof currentTag === 'object') {
          currentTag[param] += '\n' + line
        } else {
          details.tags[tag] += '\n' + line
        }
      }
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
  const details = {
    keyword: '',
    name: '',
    tags: {},
  } satisfies NatspecDetails

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
  const details = {
    keyword: '',
    name: '',
    tags: {},
  } satisfies NatspecDetails

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
  const natspec = {} satisfies Record<string, NatspecContract>
  let natspecDetails: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {},
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
          tags: {},
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
          tags: {},
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
          tags: {},
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
  const natspec = {} satisfies Record<string, NatspecContract>
  let natspecDetails: NatspecDetails = {
    keyword: '',
    name: '',
    tags: {},
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
          tags: {},
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
        currentContract.details[natspecDetails.name] = natspecDetails
        natspecDetails = {
          keyword: '',
          name: '',
          tags: {},
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

export function parseNetspec(SourceCode: any, ContractName: string, ABI: any, CompilerType?: any): any {
  const parsedSourceCode = parseSourceCode(SourceCode)
  const noticeText = extractNatSpec(parsedSourceCode, CompilerType)
  const collapsedNatspec = collapseNatspec(noticeText, ContractName)
  const notices = collapsedNatspec.details

  return ABI.map((action: any) => {
    if (action.type === 'function' && notices?.[action.name]) {
      action.notice = notices[action.name].tags.notice as string
      action.inputs.forEach(
        (input: { notice: string; name: string | number }) =>
          (input.notice = (notices[action.name].tags.param as Record<string, string>)?.[input.name]),
      )
    }

    return action
  })
}
