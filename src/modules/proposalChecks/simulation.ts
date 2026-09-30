import { DAO } from '@artifacts/dao'
import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import {
  type ISimulatedApproval,
  type ISimulatedExecution,
  type ISimulatedMovement,
  type ISimulationFacts,
  type ITokenStandard,
  type IExecutionValidation,
  IPluginInterfaceType,
  type ITenderlyAssetChange,
  type ITenderlyFullSimulationResponse,
  type ITenderlyLog,
  NetworksEnum,
} from '@types'
import { getAddress, Interface, MaxUint256, id as keccakId } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:simulation' })

const daoInterface = new Interface(DAO.abi)
const pluginExecute = new Interface(['function execute(uint256 _proposalId)'])
/** Every supported plugin reverts with this when the proposal cannot be executed yet. */
const NOT_YET_ERROR = 'ProposalExecutionForbidden'
/** Matched by selector, since a public simulation rarely decodes a custom error by name. */
const NOT_YET_SELECTOR = new Interface([`error ${NOT_YET_ERROR}(uint256)`])
  .getError(NOT_YET_ERROR)!
  .selector.toLowerCase()

/** An account with no permissions anywhere: if it can execute, anyone can. */
const ORDINARY_CALLER = '0x000000000000000000000000000000000000dEaD'

/**
 * Plugins whose execute(proposalId) is the real entry point, and which all refuse with
 * NOT_YET_ERROR while the proposal has not passed. One that refuses differently cannot be
 * validated by this list alone.
 */
const VALIDATABLE: readonly IPluginInterfaceType[] = [
  IPluginInterfaceType.tokenVoting,
  IPluginInterfaceType.multisig,
  IPluginInterfaceType.lockToVote,
]
const APPROVAL_TOPIC = keccakId('Approval(address,address,uint256)').toLowerCase()
const EXECUTED_TOPIC = daoInterface.getEvent('Executed')!.topicHash.toLowerCase()

/** Networks where a Tenderly simulation at a historical block is known to work. Others are reported, not guessed. */
export const SIMULATION_NETWORKS: readonly NetworksEnum[] = [
  NetworksEnum.ethereumMainnet,
  NetworksEnum.polygonMainnet,
  NetworksEnum.baseMainnet,
  NetworksEnum.arbitrumMainnet,
  NetworksEnum.optimismMainnet,
  NetworksEnum.ethereumSepolia,
]

/**
 * Whether the simulation says anything about what the actions do. A run that reverted still does:
 * it is the network that is not simulated, or the call that never ran, which tells the checks
 * nothing.
 */
export const simulationRan = (simulation: ISimulationFacts): boolean =>
  simulation.status !== 'unsupported' && simulation.status !== 'failed'

/**
 * Runs the proposal's captured actions as the plugin calling the DAO's execute, at the
 * evidence block, and reports what the simulation predicts. The proposal's own failure map is
 * used, so an action it allows to fail does not take the whole run down. An unavailable or
 * unsupported simulation is reported as such; it is never read as "nothing happens".
 */
const ProposalSimulator = {
  async simulate(request: ProposalAssessment): Promise<ISimulationFacts> {
    const block = request.captured.evidenceBlock.number
    const empty = (status: ISimulationFacts['status'], reason: string): ISimulationFacts => ({
      status,
      reason,
      simulationId: null,
      block,
      movements: [],
      approvals: [],
      executions: [],
    })

    if (!SIMULATION_NETWORKS.includes(request.network))
      return empty('unsupported', `no simulation support for ${request.network}`)
    if (!TenderlyModule.isConfigured()) return empty('unsupported', 'simulation provider not configured')

    const response = (await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulate`, {
      network_id: ProviderModule.getChainId(request.network).toString(),
      block_number: block,
      from: request.pluginAddress,
      to: request.daoAddress,
      input: ProposalSimulator._executeCalldata(request),
      gas: 8_000_000,
      gas_price: '0',
      value: '0',
      save: true,
      save_if_fails: true,
      simulation_type: 'full',
    })) as ITenderlyFullSimulationResponse | undefined

    if (!response?.simulation?.id) return empty('failed', 'simulation request failed')
    const txStatus = response.transaction?.status
    if (typeof txStatus !== 'boolean') return empty('failed', 'simulation response carried no transaction outcome')

    const info = response.transaction?.transaction_info
    const revert = response.transaction?.error_info?.error_message ?? (txStatus === false ? 'reverted' : null)
    const facts: ISimulationFacts = {
      status: revert ? 'reverted' : 'ok',
      reason: revert,
      simulationId: response.simulation.id,
      block,
      movements: revert ? [] : ProposalSimulator._movements(info?.asset_changes ?? []),
      approvals: revert ? [] : ProposalSimulator._approvals(info?.logs ?? []),
      executions: revert ? [] : ProposalSimulator._executions(info?.logs ?? []),
    }
    logger.verbose(
      'proposal checks: simulated',
      llo({ id: request.id, status: facts.status, movements: facts.movements.length }),
    )
    return facts
  },

  /**
   * The other simulation mode: not "what would the actions do" but "would the plugin let them
   * run right now". The plugin's own execute is called by an account with no permissions, at
   * the evidence block, so nothing about the caller or the votes is assumed.
   */
  async validate(
    request: ProposalAssessment,
    plugin: { interfaceType: IPluginInterfaceType | null; proposalIndex: string },
  ): Promise<IExecutionValidation> {
    const block = request.captured.evidenceBlock.number
    const done = (
      status: IExecutionValidation['status'],
      reason: string | null,
      simulationId: string | null = null,
    ) => ({
      status,
      reason,
      simulationId,
      block,
    })

    if (!plugin.interfaceType || !VALIDATABLE.includes(plugin.interfaceType))
      return done('unsupported', `no execution entry point known for ${plugin.interfaceType ?? 'an unindexed plugin'}`)
    if (!SIMULATION_NETWORKS.includes(request.network))
      return done('unsupported', `no simulation support for ${request.network}`)
    if (!TenderlyModule.isConfigured()) return done('unsupported', 'simulation provider not configured')

    const response = (await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulate`, {
      network_id: ProviderModule.getChainId(request.network).toString(),
      block_number: block,
      from: ORDINARY_CALLER,
      to: request.pluginAddress,
      input: pluginExecute.encodeFunctionData('execute', [BigInt(plugin.proposalIndex)]),
      gas: 8_000_000,
      gas_price: '0',
      value: '0',
      save: true,
      save_if_fails: true,
      // The full trace carries the revert data; the quick form only says that it reverted.
      simulation_type: 'full',
    })) as ITenderlyFullSimulationResponse | undefined

    if (!response?.simulation?.id) return done('failed', 'simulation request failed')
    const txStatus = response.transaction?.status
    if (typeof txStatus !== 'boolean') {
      return done('failed', 'simulation response carried no transaction outcome', response.simulation.id)
    }

    if (txStatus) return done('executable', null, response.simulation.id)
    const trace = response.transaction?.transaction_info?.call_trace
    const message =
      trace?.error_reason ?? response.transaction?.error_info?.error_message ?? trace?.error ?? 'execution reverted'
    const output = (trace?.output ?? '').toLowerCase()
    if (output.startsWith(NOT_YET_SELECTOR) || message.includes(NOT_YET_ERROR)) {
      return done('notYet', `${NOT_YET_ERROR}: the plugin does not allow execution yet`, response.simulation.id)
    }
    return done('reverted', message, response.simulation.id)
  },

  _executeCalldata(request: ProposalAssessment): string {
    const actions = request.captured.rawActions.map(a => [a.to, a.value || '0', a.data || '0x'])
    return daoInterface.encodeFunctionData('execute', [
      keccakId(request.id),
      actions,
      BigInt(request.captured.allowFailureMap || '0'),
    ])
  },

  _movements(changes: ITenderlyAssetChange[]): ISimulatedMovement[] {
    return changes.map(change => ({
      type: change.type,
      asset: change.token_info?.contract_address ? getAddress(change.token_info.contract_address) : 'native',
      standard: ProposalSimulator._standard(change.token_info?.standard),
      from: change.from ? getAddress(change.from) : '',
      to: change.to ? getAddress(change.to) : '',
      amount: change.raw_amount ?? change.amount ?? '0',
    }))
  },

  _standard(value: string | undefined): ITokenStandard | null {
    const upper = (value ?? '').toUpperCase()
    return upper === 'ERC20' || upper === 'ERC721' || upper === 'ERC1155' ? upper : null
  },

  /** Every DAO execute that completed, from its Executed event; the failure map says which actions inside it failed. */
  _executions(logs: ITenderlyLog[]): ISimulatedExecution[] {
    const executions: ISimulatedExecution[] = []
    for (const log of logs) {
      const topics = log.raw?.topics ?? []
      if (topics[0]?.toLowerCase() !== EXECUTED_TOPIC) continue
      try {
        const parsed = daoInterface.parseLog({ topics, data: log.raw?.data ?? '0x' })
        if (!parsed) continue
        executions.push({
          dao: getAddress(log.raw?.address ?? log.address ?? ''),
          actions: parsed.args.actions.length,
          allowFailureMap: parsed.args.allowFailureMap.toString(),
          failureMap: parsed.args.failureMap.toString(),
        })
      } catch {
        // A log with the right topic but a different layout is not one of ours.
      }
    }
    return executions
  },

  /** Matches the raw Approval topic; the decoded name only exists for contracts Tenderly knows. */
  _approvals(logs: ITenderlyLog[]): ISimulatedApproval[] {
    const approvals: ISimulatedApproval[] = []
    for (const log of logs) {
      const topics = log.raw?.topics ?? []
      if (topics[0]?.toLowerCase() !== APPROVAL_TOPIC || topics.length < 3) continue
      const raw = log.raw?.data ?? '0x'
      let amount = '0'
      try {
        amount = BigInt(raw === '0x' ? '0x0' : raw).toString()
      } catch {
        amount = '0'
      }
      approvals.push({
        token: getAddress(log.raw?.address ?? log.address ?? ''),
        owner: getAddress(`0x${topics[1].slice(-40)}`),
        spender: getAddress(`0x${topics[2].slice(-40)}`),
        amount,
        unlimited: amount === MaxUint256.toString(),
      })
    }
    return approvals
  },
}

export default ProposalSimulator
