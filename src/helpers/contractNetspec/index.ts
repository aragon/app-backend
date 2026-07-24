/**
 * Public NatSpec API. Takes verified explorer source, a contract name, and an ABI; returns the ABI
 * with `notice` strings attached to callable functions and their inputs. Synchronous, dependency
 * free, and throw-free: on any parsing failure the ABI comes back without new documentation.
 *
 * `parseNetspec` is intentionally *defined* in this file (not re-exported from parser/resolver):
 * under CommonJS a re-export compiles to a getter-only property that Sinon cannot stub, and the
 * consumer test suites stub `parseNetspec` on this module's namespace object.
 */

import * as parser from './parser'
import * as resolver from './resolver'

interface Selection {
  parsed: parser.ParsedBundle
  target: parser.ContractDocumentation
}

export function parseNetspec(sourceCode: unknown, contractName: string, abi: unknown, compilerVersion?: string): any[] {
  if (!Array.isArray(abi)) return []
  try {
    return enrichAbi(sourceCode, typeof contractName === 'string' ? contractName : '', abi, compilerVersion)
  } catch {
    return abi.slice()
  }
}

function enrichAbi(sourceCode: unknown, contractName: string, abi: any[], compilerVersion?: string): any[] {
  const bundle = parser.normalizeSource(sourceCode)
  if (!bundle.units.length) return abi.slice()
  const language = parser.detectLanguage(bundle, compilerVersion)
  const selection =
    language === 'unknown' ? selectAmbiguous(bundle, contractName, abi) : trySelect(bundle, language, contractName, abi)
  if (!selection) return abi.slice()
  const ctx = resolver.createResolutionContext(selection.parsed, selection.target)
  return abi.map(item => enrichItem(ctx, item))
}

function trySelect(
  bundle: parser.SourceBundle,
  language: 'solidity' | 'vyper',
  contractName: string,
  abi: any[],
): Selection | undefined {
  const parsed = parser.parseBundle(bundle, language)
  if (!parsed.contracts.length) return undefined
  const target = resolver.resolveTargetContract(parsed, bundle, contractName, abi)
  return target ? { parsed, target } : undefined
}

/** Ambiguous language: parse with both parsers, prefer the one containing the target, then coverage. */
function selectAmbiguous(bundle: parser.SourceBundle, contractName: string, abi: any[]): Selection | undefined {
  const solidity = trySelect(bundle, 'solidity', contractName, abi)
  const vyper = trySelect(bundle, 'vyper', contractName, abi)
  if (solidity && !vyper) return solidity
  if (vyper && !solidity) return vyper
  if (!solidity || !vyper) return undefined
  const solidityNamed = solidity.target.name === contractName
  const vyperNamed = vyper.target.name === contractName
  if (solidityNamed !== vyperNamed) return solidityNamed ? solidity : vyper
  const solidityScore = resolver.coverageScore(solidity.parsed, solidity.target, abi)
  const vyperScore = resolver.coverageScore(vyper.parsed, vyper.target, abi)
  if (solidityScore === vyperScore) return undefined
  return solidityScore > vyperScore ? solidity : vyper
}

function enrichItem(ctx: resolver.ResolutionContext, item: any): any {
  if (!item || typeof item !== 'object' || item.type !== 'function' || typeof item.name !== 'string') return item
  const doc = resolver.resolveAbiFunctionDoc(ctx, item)
  if (!doc) return item
  const enriched: any = { ...item }
  if (doc.notice) enriched.notice = doc.notice
  if (doc.paramNotices.some(Boolean)) {
    // Defensive only: `paramNotices` is built from the same `item.inputs`, so a non-empty entry
    // here already implies the array form (see `resolveAbiFunctionDoc`).
    /* istanbul ignore next */
    const inputs = Array.isArray(item.inputs) ? item.inputs : []
    enriched.inputs = inputs.map((input: any, idx: number) =>
      doc.paramNotices[idx] && input && typeof input === 'object' ? { ...input, notice: doc.paramNotices[idx] } : input,
    )
  }
  return enriched
}
