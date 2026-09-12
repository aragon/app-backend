import ContractHelper from '@helpers/contractHelper'
import ProxyContract, { EIP1967_IMPLEMENTATION_SLOT, FIAT_PROXY_IMPLEMENTATION_SLOT } from '@helpers/proxyContract'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import ProviderModule from '@modules/provider'
import { type HexAddress, type IAssessmentFlatAction, type NetworksEnum } from '@types'
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:abiResolver' })

interface ILoadedSource {
  iface: Interface
  contractName: string | null
  implementation: HexAddress | null
  blockPinned: boolean
}

/**
 * Decodes the calls the built-in signature list did not, using the target's verified source
 * from the contract cache (which fills from the explorer). A proxy is followed to the
 * implementation it had at the evidence block, read from its storage slot at that block; when
 * that read is not possible (no archive node, a proxy pattern without a slot) the current
 * implementation is used and the call records that its ABI was not pinned. A target with no
 * verified source stays undecoded.
 */
const AbiResolver = {
  async resolve(actions: IAssessmentFlatAction[], network: NetworksEnum, block: number): Promise<void> {
    const sources = new Map<string, ILoadedSource[]>()

    for (const action of actions) {
      if (action.decoding !== 'unknown') continue
      const key = action.target
      if (!sources.has(key)) sources.set(key, await AbiResolver._load(action.target as HexAddress, network, block))

      for (const source of sources.get(key) ?? []) {
        const decoded = AbiResolver._decode(source.iface, action.data)
        if (!decoded) continue
        action.decoded = decoded
        action.decoding = 'known'
        action.abi = {
          source: 'verified',
          contractName: source.contractName,
          implementation: source.implementation,
          blockPinned: source.blockPinned,
        }
        break
      }
    }
  },

  /**
   * The sources that may decode a call to the target, in the order they are tried: the
   * implementation behind the proxy, then the target's own. Both are needed because a strategy
   * proxy carries its own functions and forwards only the rest to the implementation the slot
   * names, so neither ABI alone covers the contract.
   */
  async _load(target: HexAddress, network: NetworksEnum, block: number): Promise<ILoadedSource[]> {
    try {
      const { implementation, blockPinned } = await AbiResolver._implementationAt(target, network, block)
      const candidates = implementation && implementation !== target ? [implementation, target] : [target]
      const sources: ILoadedSource[] = []
      for (const address of candidates) {
        const source = await ContractHelper.getSourceCode(address, network)
        const abi = source?.[0]?.ABI
        if (!abi) continue
        sources.push({
          iface: new Interface(JSON.parse(abi)),
          contractName: source?.[0]?.ContractName || null,
          implementation: address === target ? null : address,
          blockPinned,
        })
      }
      return sources
    } catch (error) {
      logger.warn('proposal checks: verified source unavailable for target', llo({ target, network, error }))
      return []
    }
  },

  /**
   * The standard proxy slots can be read at the evidence block through a provider bound to that
   * block. Anything else falls back to the shared resolver, which reads current state, and a
   * plain contract cannot be told apart from a proxy whose slot could not be read at the block.
   */
  async _implementationAt(
    target: HexAddress,
    network: NetworksEnum,
    block: number,
  ): Promise<{ implementation: HexAddress | null; blockPinned: boolean }> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const pinned = { getStorage: (address: string, slot: string) => provider.getStorage(address, slot, block) }

    for (const slot of [EIP1967_IMPLEMENTATION_SLOT, FIAT_PROXY_IMPLEMENTATION_SLOT]) {
      const implementation = await ProxyContract.getAddressFromStorage(pinned, target, slot, network)
      if (implementation) return { implementation, blockPinned: true }
    }

    const implementation = await ProxyContract.getImplementationAddress(target, network)
    return { implementation, blockPinned: false }
  },

  _decode(iface: Interface, data: string) {
    try {
      const parsed = iface.parseTransaction({ data })
      if (!parsed) return null
      return {
        signature: parsed.signature,
        name: parsed.name,
        args: KnownAbi._args(parsed.fragment.inputs, parsed.args),
      }
    } catch {
      return null
    }
  },
}

export default AbiResolver
