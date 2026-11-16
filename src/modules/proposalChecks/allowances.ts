import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type IAssessmentFlatAction, type NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:allowances' })

const erc20 = new Interface(['function allowance(address owner, address spender) view returns (uint256)'])

const ALLOWANCE_CALLS = new Set(['approve', 'increaseAllowance', 'decreaseAllowance'])

/**
 * Reads the allowance an approval replaces, at the evidence block, from the token itself. The
 * owner is the account the call runs as; when that is not known (a Delay forwards it) there is
 * nothing to read. A read that fails leaves the entry out, and the check says so.
 */
const AllowanceState = {
  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: number,
  ): Promise<Record<string, string>> {
    const before: Record<string, string> = {}
    for (const action of actions) {
      const name = action.decoded?.name
      const spender = action.decoded?.args.spender
      if (!name || !ALLOWANCE_CALLS.has(name) || !spender || !action.caller || action.operation === 'delegatecall')
        continue
      if (action.abi?.source !== 'builtin') continue
      try {
        const token = new Contract(action.target, erc20, ProviderModule.getAnyRpcProvider(network))
        const value = await BottleneckModule.getNodeLimiter(network).schedule(() =>
          token.getFunction('allowance')(action.caller, spender, { blockTag: block }),
        )
        before[action.path] = String(value)
      } catch (error) {
        logger.warn(
          'proposal checks: allowance before the action could not be read',
          llo({ path: action.path, network, error }),
        )
      }
    }
    return before
  },
}

export default AllowanceState
