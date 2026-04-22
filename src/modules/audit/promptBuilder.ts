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

const PromptBuilder = {
  async load(): Promise<{ template: string; version: string }> {
    const template = await fs.readFile(PROMPT_PATH, 'utf8')
    const match = template.match(VERSION_RE)
    if (!match) {
      throw new Error(`prompt.md is missing a <!-- promptVersion: X --> marker`)
    }
    return { template, version: match[1] }
  },

  wrapUntrusted(value: unknown): string {
    const json = JSON.stringify(value, null, 2) ?? 'null'
    const neutralized = json.replace(/<\/?untrusted>/gi, '[neutralized-tag]')
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

    let output = template
    for (const [placeholder, value] of Object.entries(replacements)) {
      output = output.split(placeholder).join(value)
    }
    return output
  },
}

export default PromptBuilder
