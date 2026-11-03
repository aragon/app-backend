import * as Errors from '@errors'
import logger from '@logger'
import type Proposal from '@models/schema/proposal'
import InFlight from '@modules/inFlight'
import ProviderModule from '@modules/provider'
import {
  ErrorKeyEnum,
  ISimulationStatus,
  type ITenderlyActionInput,
  type ITenderlyFullResult,
  type ITenderlyFullSimulationResponse,
  ITenderlyOperation,
  type ITenderlyRequest,
  type ITenderlyRequestMap,
  type ITenderlyResult,
  type ITenderlySendContext,
  type NetworksEnum,
} from '@types'
import TenderlyActions from './actions'
import TenderlyCache from './cache'
import TenderlyDispatch from './dispatch'
import TenderlyProposal from './proposal'
import TenderlyTransport from './transport'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

const TenderlyModule = {
  async run<K extends keyof ITenderlyRequestMap>(request: ITenderlyRequest<K>): Promise<ITenderlyResult<K>> {
    const params = request as ITenderlyRequest
    const deadlineAt = TenderlyModule.deadlineAt(request.sentAt)
    if (params.operation === ITenderlyOperation.dispatch) {
      const dispatch = await TenderlyDispatch.load(params)
      const id = TenderlyCache.key(params.operation, dispatch.input)
      return TenderlyModule._runCached(params.operation, id, deadlineAt, () =>
        TenderlyDispatch.simulate(dispatch, deadlineAt),
      ) as Promise<ITenderlyResult<K>>
    }
    let proposal: Proposal | null = null
    let input: ITenderlyActionInput
    if (params.operation === ITenderlyOperation.proposal) {
      proposal = await TenderlyProposal.load(params.proposalId)
      input = TenderlyProposal.input(proposal)
    } else {
      input = await TenderlyActions.load(params)
    }
    const id = TenderlyCache.key(params.operation, input)
    if (proposal) {
      const recent = TenderlyProposal.recent(proposal, id)
      if (recent) return recent as ITenderlyResult<K>
    }
    return TenderlyModule._runCached(
      params.operation,
      id,
      deadlineAt,
      async () => ({
        ...(await TenderlyModule.simulate(TenderlyActions.build(input), input.network, {
          operation: params.operation,
          network: input.network,
          daoAddress: input.daoAddress,
          deadlineAt,
        })),
        network: input.network,
      }),
      proposal ? result => TenderlyProposal.save(proposal!.id, id, result) : undefined,
    ) as Promise<ITenderlyResult<K>>
  },

  async _runCached<K extends keyof ITenderlyRequestMap>(
    operation: K,
    id: string,
    deadlineAt: number,
    simulate: () => Promise<ITenderlyResult<K>>,
    save?: (result: ITenderlyResult<K>) => Promise<void>,
  ): Promise<ITenderlyResult<K>> {
    const cached = await TenderlyCache.read(operation, id, Date.now())
    if (cached) {
      await save?.(cached)
      return cached
    }
    return InFlight.run(id, async () => {
      const cached = await TenderlyCache.read(operation, id, Date.now())
      if (cached) {
        await save?.(cached)
        return cached
      }
      Errors.assertExposable(Date.now() < deadlineAt, ErrorKeyEnum.tooBusy)
      const result = await simulate()
      await save?.(result)
      await TenderlyCache.write(operation, id, result, 'runAt' in result ? result.runAt : Date.now())
      return result
    })
  },

  deadlineAt(sentAt: number): number {
    return TenderlyTransport.deadlineAt(sentAt)
  },

  async createShareableUrl(simulationId: string, deadlineAt: number): Promise<string> {
    return TenderlyTransport.share(simulationId, deadlineAt)
  },

  async simulate(
    simulation: { to: string; data: string; value?: string; from: string },
    network: NetworksEnum,
    context: ITenderlySendContext,
  ): Promise<{ url?: string; runAt: number; status: ISimulationStatus }> {
    const simulationData = {
      network_id: ProviderModule.getChainId(network).toString(),
      from: simulation.from,
      input: simulation.data,
      to: simulation.to,
      gas: 8000000,
      gas_price: '0',
      value: '0',
      save: true,
      save_if_fails: true,
    }

    const response = await TenderlyTransport.simulate(simulationData, context)

    const runAt = Date.now()

    const shareableUrl = await TenderlyTransport.share(response.simulation!.id, context.deadlineAt)
    const status =
      response?.transaction?.status === false || response?.transaction?.error_info?.error_message
        ? ISimulationStatus.FAILED
        : ISimulationStatus.SUCCESS
    return { url: shareableUrl, runAt, status }
  },

  /**
   * Run a single simulation addressed by raw chain id and return the untouched Tenderly response.
   *
   * Unlike `simulate`/`simulateFull` this takes a chain id rather than a `NetworksEnum`, because
   * the cross-chain gas estimator simulates on the *destination* chain, and returns the whole
   * response so the caller can read both the call trace and the emitted logs from one run.
   *
   * `estimate_gas` is pinned to `false` on purpose. Setting it makes Tenderly binary-search for
   * the smallest gas that does not revert, which is meaningless for a receiver that catches an
   * out-of-gas payload and returns normally.
   */
  async simulateRaw(
    simulation: {
      chainId: number
      from: string
      to: string
      input: string
      gas: number
      value?: string
    },
    context: ITenderlySendContext,
  ): Promise<ITenderlyFullSimulationResponse> {
    const simulationData = {
      network_id: simulation.chainId.toString(),
      block_number: null,
      from: simulation.from,
      to: simulation.to,
      input: simulation.input,
      gas: simulation.gas,
      gas_price: '0',
      value: simulation.value ?? '0',
      save: true,
      save_if_fails: true,
      estimate_gas: false,
      simulation_type: 'full',
    }

    return TenderlyTransport.simulate(simulationData, context)
  },

  /**
   * Run full simulation with asset_changes, contracts, and call_trace
   * Used for dispatch simulation summary
   */
  async simulateFull(
    simulation: { to: string; data: string; value?: string; from: string },
    network: NetworksEnum,
    context: ITenderlySendContext,
  ): Promise<ITenderlyFullResult> {
    const simulationData = {
      network_id: ProviderModule.getChainId(network).toString(),
      from: simulation.from,
      input: simulation.data,
      to: simulation.to,
      gas: 8000000,
      gas_price: '0',
      value: simulation.value || '0',
      save: true,
      save_if_fails: true,
      simulation_type: 'full',
    }

    logger.info('Running full Tenderly simulation', llo({ network, to: simulation.to, from: simulation.from }))

    const response = await TenderlyTransport.simulate(simulationData, context)
    const shareableUrl = await TenderlyTransport.share(response.simulation!.id, context.deadlineAt)
    const errorMessage = response.transaction?.error_info?.error_message
    const status =
      response.transaction?.status === false || errorMessage ? ISimulationStatus.FAILED : ISimulationStatus.SUCCESS

    const transactionInfo = response.transaction?.transaction_info

    logger.info(
      'Tenderly full simulation completed',
      llo({
        network,
        simulationId: response.simulation!.id,
        status,
        assetChangesCount: transactionInfo?.asset_changes?.length ?? 0,
        contractsCount: response.contracts?.length ?? 0,
      }),
    )

    return {
      status,
      shareUrl: shareableUrl,
      assetChanges: transactionInfo?.asset_changes ?? [],
      balanceChanges: transactionInfo?.balance_changes ?? [],
      callTrace: transactionInfo?.call_trace,
      contracts: response.contracts ?? [],
      error: errorMessage,
    }
  },
}

export default TenderlyModule
