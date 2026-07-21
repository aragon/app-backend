/**
 * Domain model for NatSpec parsing (`src/helpers/contractNetspec`).
 *
 * The parser turns explorer source payloads into these structures and the resolver consumes them;
 * neither shape depends on Mongo, the explorer clients, or any transport.
 */

export type TypeReference = string

export interface SourceUnit {
  path: string
  content: string
  order: number
}

export interface SourceBundle {
  language: 'solidity' | 'vyper' | 'unknown'
  units: SourceUnit[]
  compilationTarget?: { path: string; contractName: string }
}

export interface ParsedDocumentation {
  notice?: string
  dev?: string
  params: Map<string, string>
  returns: string[]
  inheritdoc?: string
  custom: Map<string, string[]>
  unknown: Map<string, string[]>
}

export interface SourceParameter {
  name?: string
  sourceType: TypeReference
  hasDefault?: boolean
}

export type DeclarationKind = 'function' | 'getter' | 'constructor' | 'fallback' | 'receive' | 'event' | 'error'

export interface DeclarationDocumentation {
  kind: DeclarationKind
  name?: string
  parameters: SourceParameter[]
  visibility?: string
  documentation?: ParsedDocumentation
  sourceOrder: number
  sourceUnit: string
  /** Name of the declaring contract; scopes type references against same-unit name collisions. */
  container?: string
}

export interface ParentReference {
  name: string
}

export type ContractKind = 'contract' | 'abstract-contract' | 'interface' | 'library' | 'vyper-module'

export interface ContractDocumentation {
  id: string
  name: string
  qualifiedName: string
  sourceUnit: string
  kind: ContractKind
  parents: ParentReference[]
  declarations: DeclarationDocumentation[]
  documentation?: ParsedDocumentation
  sourceOrder: number
}

export interface TypeDefinitions {
  structs: Map<string, string[]>
  enums: Set<string>
  valueTypes: Map<string, string>
  contractLike: Set<string>
  /** Simple type names defined differently in more than one place; unscoped lookups must miss. */
  ambiguous: Set<string>
  /** Internal registry of plain-name definitions used to detect collisions. */
  registry: Map<string, string>
}

export interface UnitImport {
  path: string
  unitAlias?: string
  symbols: { name: string; alias?: string }[]
}

/**
 * A Vyper `exports:` entry. An imported module's external functions only reach the target ABI when
 * explicitly exported, so this relationship — not inheritance — is what makes them callable.
 * `member` is `__interface__` when the whole module interface is exported.
 */
export interface ModuleExport {
  /** Import alias, or the full dotted module path when the export bypasses an alias. */
  alias: string
  member: string
}

export interface ParsedBundle {
  language: 'solidity' | 'vyper'
  contracts: ContractDocumentation[]
  types: TypeDefinitions
  imports: Map<string, UnitImport[]>
  /** Vyper only: source unit -> the modules/members it re-exports into its own ABI. */
  exports: Map<string, ModuleExport[]>
  units: string[]
}

// ===================== Resolution =====================

export interface AbiInputLike {
  name?: string
  type?: string
  internalType?: string
  components?: AbiInputLike[]
  [key: string]: unknown
}

export interface AbiItemLike {
  type?: string
  name?: string
  inputs?: AbiInputLike[]
  [key: string]: unknown
}

export interface ResolvedFunctionDocumentation {
  notice?: string
  paramNotices: (string | undefined)[]
}

/** Where a source type reference appears: its source unit and, when known, its contract. */
export interface TypeScope {
  unit?: string
  container?: string
}

export interface ResolutionContext {
  parsed: ParsedBundle
  target: ContractDocumentation
  linearization: ContractDocumentation[]
  linearizationIndex: Map<string, number>
  /**
   * Vyper only: declarations another module owns that this module re-exports. They are callable on
   * the target ABI without being inherited, so they are candidates but always rank after anything
   * the target declares itself.
   */
  exported: { decl: DeclarationDocumentation; owner: ContractDocumentation }[]
}
