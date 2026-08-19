import { Models } from '@dbModels'
import ContractHelper from '@helpers/contractHelper'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type NetworksEnum } from '@types'
import { IWorkspaceAccountType } from '@workspace/types/workspace'
import { Interface } from 'ethers'

/**
 * A Safe answers both of these; `getOwners` alone is too common to be conclusive.
 */
const safeInterface = new Interface([
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
])

const erc165Interface = new Interface(['function supportsInterface(bytes4 interfaceId) view returns (bool)'])

/**
 * EIP-4824 `daoURI()`. OSx answers true for this; the Aragon DAO_INTERFACE_ID is
 * an XOR of selectors that changes between OSx versions, so it is not usable here.
 */
const EIP4824_DAO_INTERFACE_ID = '0x7034731b'

const KnownAccounts = {
  /**
   * Resolves each address to what it is. The Dao and Plugin collections are
   * checked first because only they carry a name; anything they miss falls
   * through to on-chain detection.
   */
  classify: async (
    addresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Map<HexAddress, { type: IWorkspaceAccountType; ref: string | null }>> => {
    const result = new Map<HexAddress, { type: IWorkspaceAccountType; ref: string | null }>()
    const unique = [...new Set(addresses)]
    if (!unique.length) return result

    const [daos, plugins] = await Promise.all([
      Models.Dao.find({ address: { $in: unique }, network })
        .select('address metadata.name')
        .lean(),
      Models.Plugin.find({ address: { $in: unique }, network })
        .select('address interfaceType')
        .lean(),
    ])

    for (const dao of daos) {
      result.set(dao.address, { type: IWorkspaceAccountType.dao, ref: dao.metadata?.name ?? null })
    }
    for (const plugin of plugins) {
      if (result.has(plugin.address)) continue
      result.set(plugin.address, { type: IWorkspaceAccountType.plugin, ref: plugin.interfaceType ?? null })
    }

    for (const address of unique) {
      if (result.has(address)) continue
      result.set(address, await KnownAccounts._onChain(address, network))
    }

    return result
  },

  _onChain: async (address: HexAddress, network: NetworksEnum) => {
    try {
      const bytecode = await ContractHelper.getBytecode(address, network)
      if (!bytecode) return { type: IWorkspaceAccountType.eoa, ref: null }

      if (await KnownAccounts._isDao(address, network)) {
        return { type: IWorkspaceAccountType.dao, ref: null }
      }
      if (await KnownAccounts._isSafe(address, network)) {
        return { type: IWorkspaceAccountType.safe, ref: null }
      }

      return { type: IWorkspaceAccountType.contract, ref: null }
    } catch {
      return { type: IWorkspaceAccountType.contract, ref: null }
    }
  },

  /** ERC-165 check for EIP-4824. A contract that does not implement it reverts. */
  _isDao: async (address: HexAddress, network: NetworksEnum): Promise<boolean> => {
    try {
      const result = await KnownAccounts._call(
        address,
        erc165Interface.encodeFunctionData('supportsInterface', [EIP4824_DAO_INTERFACE_ID]),
        network,
      )
      const [supported] = erc165Interface.decodeFunctionResult('supportsInterface', result)

      return supported === true
    } catch {
      return false
    }
  },

  /**
   * Retried, so a flaky node cannot turn a DAO into a plain contract. Every caller
   * here reads a reverted call as "not this kind of account", which makes a
   * transient failure indistinguishable from a real answer without the retry.
   */
  _call: async (address: HexAddress, data: string, network: NetworksEnum): Promise<string> =>
    retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () =>
        ProviderModule.getAnyRpcProvider(network).call({ to: address, data }),
      ),
    ),

  _isSafe: async (address: HexAddress, network: NetworksEnum): Promise<boolean> => {
    try {
      const call = async (fn: 'getOwners' | 'getThreshold') =>
        KnownAccounts._call(address, safeInterface.encodeFunctionData(fn, []), network)

      const [ownersResult, thresholdResult] = await Promise.all([call('getOwners'), call('getThreshold')])
      const [owners] = safeInterface.decodeFunctionResult('getOwners', ownersResult)
      const [threshold] = safeInterface.decodeFunctionResult('getThreshold', thresholdResult)

      return owners.length > 0 && Number(threshold) > 0
    } catch {
      return false
    }
  },
}

export default KnownAccounts
