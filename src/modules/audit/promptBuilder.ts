import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface IAuditPromptContext {
  network: string
  daoAddress: string
  plugin: unknown
  settings: unknown
  proposal: unknown
  rawActions: unknown
  decodedActions: unknown
  tenderly: unknown
}

const PROMPT_PATH = path.join(__dirname, 'prompt.md')
const VERSION_RE = /<!--\s*promptVersion:\s*(\S+)\s*-->/
const SYSTEM_END = '## Proposal context'

const PromptBuilder = {
  async load(): Promise<{ system: string; template: string; version: string }> {
    const raw = await fs.readFile(PROMPT_PATH, 'utf8')
    const match = raw.match(VERSION_RE)
    if (!match) {
      throw new Error('prompt.md is missing a <!-- promptVersion: X --> marker')
    }
    const splitIdx = raw.indexOf(SYSTEM_END)
    if (splitIdx === -1) {
      throw new Error(`prompt.md is missing the "${SYSTEM_END}" section header`)
    }
    return {
      system: raw.slice(0, splitIdx).trimEnd(),
      template: raw.slice(splitIdx),
      version: match[1],
    }
  },

  wrapUntrusted(value: unknown): string {
    const json = JSON.stringify(value, null, 2) ?? 'null'
    // Match any <untrusted ...> or </untrusted ...> shape, with optional
    // whitespace, attributes, or self-closing — an attacker who only escapes
    // exact `<untrusted>` would otherwise close the wrapper with `</untrusted >`.
    const neutralized = json.replace(/<\s*\/?\s*untrusted\b[^>]*>/gi, '[neutralized-tag]')
    return `<untrusted>\n${neutralized}\n</untrusted>`
  },

  build(ctx: IAuditPromptContext, template: string): string {
    const replacements: Record<string, string> = {
      '{{NETWORK}}': ctx.network,
      '{{DAO_ADDRESS}}': ctx.daoAddress,
      '{{PLUGIN}}': PromptBuilder.wrapUntrusted(ctx.plugin),
      '{{SETTINGS}}': PromptBuilder.wrapUntrusted(ctx.settings),
      '{{PROPOSAL}}': PromptBuilder.wrapUntrusted(ctx.proposal),
      '{{RAW_ACTIONS}}': PromptBuilder.wrapUntrusted(ctx.rawActions),
      '{{DECODED_ACTIONS}}': PromptBuilder.wrapUntrusted(ctx.decodedActions),
      '{{TENDERLY}}': PromptBuilder.wrapUntrusted(ctx.tenderly),
    }

    // Single-pass regex replace so placeholder strings injected by an attacker
    // through an `<untrusted>` block are never re-scanned and re-substituted.
    const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(Object.keys(replacements).map(escapeRegex).join('|'), 'g')
    return template.replace(pattern, match => replacements[match])
  },
}

export default PromptBuilder
