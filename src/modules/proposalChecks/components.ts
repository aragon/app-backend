import ContractHelper from '@helpers/contractHelper'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type IAssessmentFlatAction, type IComponentFacts, type NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:components' })

const readers = new Interface([
  'function getTrustedForwarder() view returns (address)',
  'function getTargetConfig() view returns ((address target, uint8 operation))',
  'function txCooldown() view returns (uint256)',
  'function txExpiration() view returns (uint256)',
])

export type IComponentCall =
  | { kind: 'forwarder'; forwarder: string }
  | { kind: 'callback'; interfaceId: string; callbackSelector: string; magicNumber: string }
  | { kind: 'validator'; validator: string }
  | { kind: 'targetConfig'; target: string; operation: 'call' | 'delegatecall' }
  | { kind: 'module'; module: string; enabled: boolean }
  | { kind: 'guard'; guard: string }
  | { kind: 'delayCooldown'; seconds: string }
  | { kind: 'delayExpiration'; seconds: string }
  | { kind: 'delayNonce'; nonce: string }
  | { kind: 'delaySkip' }

/**
 * Reads what a component change replaces. The forwarder, the target config and the Delay's
 * cooldown and expiration have getters, so the value before the action is read at the evidence
 * block; a callback registration, a module or guard change and the legacy signature validator
 * have none worth reading. The verified names of the action's target and of the address it
 * installs are what tells a DAO, a staged processor, a Delay or a Roles module apart.
 */
const ComponentFacts = {
  callOf(action: IAssessmentFlatAction): IComponentCall | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    if (!parsed) return null
    const a = parsed.args
    switch (parsed.name) {
      case 'setTrustedForwarder':
        return { kind: 'forwarder', forwarder: a._trustedForwarder }
      case 'registerStandardCallback':
        return {
          kind: 'callback',
          interfaceId: a._interfaceId,
          callbackSelector: a._callbackSelector,
          magicNumber: a._magicNumber,
        }
      case 'setSignatureValidator':
        return { kind: 'validator', validator: a._signatureValidator }
      case 'setTargetConfig':
        return {
          kind: 'targetConfig',
          target: a._targetConfig.target,
          operation: Number(a._targetConfig.operation) === 1 ? 'delegatecall' : 'call',
        }
      case 'enableModule':
        return { kind: 'module', module: a.module, enabled: true }
      case 'disableModule':
        return { kind: 'module', module: a.module, enabled: false }
      case 'setGuard':
        return { kind: 'guard', guard: a.guard }
      case 'setTxCooldown':
        return { kind: 'delayCooldown', seconds: a.cooldown.toString() }
      case 'setTxExpiration':
        return { kind: 'delayExpiration', seconds: a.expiration.toString() }
      case 'setTxNonce':
        return { kind: 'delayNonce', nonce: a.nonce.toString() }
      case 'skipExpired':
        return { kind: 'delaySkip' }
      default:
        return null
    }
  },

  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: number,
  ): Promise<Record<string, IComponentFacts>> {
    const facts: Record<string, IComponentFacts> = {}
    for (const action of actions) {
      const call = ComponentFacts.callOf(action)
      if (!call) continue
      try {
        facts[action.path] = await ComponentFacts._read(action.target, call, network, block)
      } catch (error) {
        logger.warn(
          'proposal checks: component facts could not be read',
          llo({ path: action.path, call, network, error }),
        )
      }
    }
    return facts
  },

  async _read(target: string, call: IComponentCall, network: NetworksEnum, block: number): Promise<IComponentFacts> {
    const installed = ComponentFacts._installed(call)
    // A contract without the getter still has a name worth naming, so a failed read is only a null before.
    const before = await ComponentFacts._before(target, call, network, block).catch(error => {
      logger.warn(
        'proposal checks: component state before the action could not be read',
        llo({ target, call, network, error }),
      )
      return null
    })
    return {
      targetName: await ComponentFacts._name(target, network),
      before,
      installedName: installed ? await ComponentFacts._name(installed, network) : null,
    }
  },

  /** The address a change puts in place, when it puts one in place at all. */
  _installed(call: IComponentCall): string | null {
    switch (call.kind) {
      case 'forwarder':
        return call.forwarder
      case 'targetConfig':
        return call.target
      case 'validator':
        return call.validator
      case 'module':
        return call.module
      case 'guard':
        return call.guard
      default:
        return null
    }
  },

  async _before(target: string, call: IComponentCall, network: NetworksEnum, block: number): Promise<string | null> {
    const getters: Record<string, string> = {
      forwarder: 'getTrustedForwarder',
      targetConfig: 'getTargetConfig',
      delayCooldown: 'txCooldown',
      delayExpiration: 'txExpiration',
    }
    const getter = getters[call.kind]
    if (!getter) return null
    const contract = new Contract(target, readers, ProviderModule.getAnyRpcProvider(network))
    const value = await BottleneckModule.getNodeLimiter(network).schedule(() =>
      contract.getFunction(getter)({ blockTag: block }),
    )
    if (call.kind === 'targetConfig')
      return `${value.target} by ${Number(value.operation) === 1 ? 'delegatecall' : 'call'}`
    return String(value)
  },

  async _name(address: string, network: NetworksEnum): Promise<string | null> {
    if (/^0x0{40}$/i.test(address)) return null
    const source = await ContractHelper.getSourceCode(address as HexAddress, network)
    return source?.[0]?.ContractName || null
  },
}

export default ComponentFacts
