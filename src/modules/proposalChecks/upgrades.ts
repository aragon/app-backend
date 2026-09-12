import ContractHelper from '@helpers/contractHelper'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import AbiResolver from '@modules/proposalChecks/abiResolver'
import RecipientResolver from '@modules/proposalChecks/recipients'
import {
  type HexAddress,
  type IAssessmentContext,
  type IAssessmentFlatAction,
  type IUpgradeFacts,
  type NetworksEnum,
} from '@types'
import { keccak256 } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:upgrades' })

export interface IUpgradeCall {
  proxy: string
  implementation: string
  /** Calldata the proxy runs right after the upgrade, or null for a plain upgrade. */
  data: string | null
}

/**
 * Reads what an upgrade would replace. A UUPS proxy upgrades itself (`upgradeTo`,
 * `upgradeToAndCall`); a transparent proxy is upgraded through its admin (`upgrade`,
 * `upgradeAndCall`). For each the current implementation is read from the proxy's slot at the
 * evidence block and both implementations are hashed by their code at that block, so the
 * finding can say whether the code changes and whether the new code is verified.
 */
const UpgradeFacts = {
  /** The proxy and the code an action would put behind it, or null when the action is not an upgrade. */
  callOf(action: IAssessmentFlatAction): IUpgradeCall | null {
    const d = action.decoded
    if (!d || action.operation === 'delegatecall' || !KnownAbi.isBuiltin(action)) return null
    switch (d.name) {
      case 'upgradeTo':
        return { proxy: action.target, implementation: d.args.newImplementation, data: null }
      case 'upgradeToAndCall':
        return { proxy: action.target, implementation: d.args.newImplementation, data: UpgradeFacts._data(d.args.data) }
      case 'upgrade':
        return { proxy: d.args.proxy, implementation: d.args.implementation, data: null }
      case 'upgradeAndCall':
        return { proxy: d.args.proxy, implementation: d.args.implementation, data: UpgradeFacts._data(d.args.data) }
      default:
        return null
    }
  },

  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: number,
  ): Promise<Record<string, IUpgradeFacts>> {
    const facts: Record<string, IUpgradeFacts> = {}
    for (const action of actions) {
      const call = UpgradeFacts.callOf(action)
      if (!call) continue
      try {
        facts[action.path] = await UpgradeFacts._read(call, network, block)
      } catch (error) {
        logger.warn(
          'proposal checks: upgrade facts could not be read',
          llo({ path: action.path, call, network, error }),
        )
      }
    }
    return facts
  },

  async _read(call: IUpgradeCall, network: NetworksEnum, block: number): Promise<IUpgradeFacts> {
    const current = await AbiResolver._implementationAt(call.proxy as HexAddress, network, block)
    const currentCodeHash = current.implementation
      ? await UpgradeFacts._codeHash(current.implementation, network, block)
      : null
    const proposedCodeHash = await UpgradeFacts._codeHash(call.implementation, network, block)
    const source = proposedCodeHash
      ? await ContractHelper.getSourceCode(call.implementation as HexAddress, network)
      : null
    return {
      proxy: call.proxy,
      currentImplementation: current.implementation,
      currentCodeHash,
      proposedImplementation: call.implementation,
      proposedCodeHash,
      proposedVerified: proposedCodeHash ? !!source?.[0]?.ABI : null,
      proposedContractName: source?.[0]?.ContractName || null,
      blockPinned: current.blockPinned,
    }
  },

  async _codeHash(address: string, network: NetworksEnum, block: number): Promise<string | null> {
    const code = await RecipientResolver._codeAt(address, network, block)
    return code === '0x' ? null : keccak256(code)
  },

  /** What a contract address is to this DAO, for a finding title. */
  subject(address: string, ctx: Readonly<IAssessmentContext>): string {
    const key = address.toLowerCase()
    if (key === ctx.request.daoAddress.toLowerCase()) return 'the DAO'
    const plugin = ctx.plugins.find(p => p.address.toLowerCase() === key)
    if (plugin) return `the ${plugin.interfaceType} plugin ${address}`
    return `contract ${address}`
  },

  _data(data: string | undefined): string | null {
    return data && data !== '0x' ? data : null
  },
}

export default UpgradeFacts
