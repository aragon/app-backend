import ContractHelper from '@helpers/contractHelper'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type IAssessmentFlatAction, type IOwnershipFacts, type NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:ownership' })

const getters = new Interface([
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function governor() view returns (address)',
  'function pendingGovernor() view returns (address)',
  'function guardian() view returns (address)',
])

export type IOwnershipCall =
  | { kind: 'owner'; holder: string }
  | { kind: 'acceptOwnership' }
  | { kind: 'renounceOwnership' }
  | { kind: 'pendingGovernor'; holder: string }
  | { kind: 'acceptGovernor' }
  | { kind: 'guardian'; holder: string }
  | { kind: 'role'; role: string; holder: string; granted: boolean }

/** Which getter says who holds the role a call changes; a role grant has no single holder to read. */
const GETTER_OF: Partial<Record<IOwnershipCall['kind'], string>> = {
  owner: 'owner',
  renounceOwnership: 'owner',
  acceptOwnership: 'owner',
  pendingGovernor: 'governor',
  acceptGovernor: 'governor',
  guardian: 'guardian',
}

/**
 * Reads the role changes a proposal makes on contracts outside the DAO: Ownable and its two-step
 * form, the governor pattern with a pending nominee, a guardian, and AccessControl roles. The
 * holder before the action comes from the role's getter at the evidence block, where the
 * contract has one.
 */
const OwnershipFacts = {
  callOf(action: IAssessmentFlatAction): IOwnershipCall | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    if (!parsed) return null
    const a = parsed.args
    switch (parsed.name) {
      case 'transferOwnership':
        return { kind: 'owner', holder: a.newOwner }
      case 'acceptOwnership':
        return { kind: 'acceptOwnership' }
      case 'renounceOwnership':
        return { kind: 'renounceOwnership' }
      case 'setPendingGovernor':
        return { kind: 'pendingGovernor', holder: a.pendingGovernor }
      case 'acceptGovernor':
        return { kind: 'acceptGovernor' }
      case 'setGuardian':
        return { kind: 'guardian', holder: a.guardian }
      case 'grantRole':
        return { kind: 'role', role: a.role, holder: a.account, granted: true }
      case 'revokeRole':
      case 'renounceRole':
        return { kind: 'role', role: a.role, holder: a.account, granted: false }
      default:
        return null
    }
  },

  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: number,
  ): Promise<Record<string, IOwnershipFacts>> {
    const facts: Record<string, IOwnershipFacts> = {}
    for (const action of actions) {
      const call = OwnershipFacts.callOf(action)
      if (!call) continue
      // A contract without the role's getter still has a name worth naming, so the two reads fail apart.
      const before = await OwnershipFacts._before(action.target, call, network, block).catch(error => {
        logger.warn(
          'proposal checks: role holder before the action could not be read',
          llo({ path: action.path, call, network, error }),
        )
        return null
      })
      try {
        facts[action.path] = { before, targetName: await OwnershipFacts._name(action.target, network) }
      } catch (error) {
        logger.warn(
          'proposal checks: ownership facts could not be read',
          llo({ path: action.path, call, network, error }),
        )
      }
    }
    return facts
  },

  async _before(target: string, call: IOwnershipCall, network: NetworksEnum, block: number): Promise<string | null> {
    const getter = GETTER_OF[call.kind]
    if (!getter) return null
    const contract = new Contract(target, getters, ProviderModule.getAnyRpcProvider(network))
    const value = await BottleneckModule.getNodeLimiter(network).schedule(() =>
      contract.getFunction(getter)({ blockTag: block }),
    )
    return String(value)
  },

  async _name(address: string, network: NetworksEnum): Promise<string | null> {
    const source = await ContractHelper.getSourceCode(address as HexAddress, network)
    return source?.[0]?.ContractName || null
  },
}

export default OwnershipFacts
