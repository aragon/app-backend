import config from '@config'
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
  ITenderlyOperation,
  type ITenderlyRequest,
  type ITenderlyRequestMap,
  type ITenderlyResult,
  type ITenderlySendContext,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'
import TenderlyActions from './actions'
import TenderlyCache from './cache'
import CrossChainGasService from './crossChainGas/crossChainGasService'
import TenderlyDispatch from './dispatch/dispatchSimulationService'
import TenderlyMetrics from './metrics'
import TenderlyProposal from './proposal'
import TenderlyTransport from './transport'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

const TenderlyModule = {
  isConfigured(): boolean {
    return !!(config.TENDERLY.API_URL && config.TENDERLY.USER && config.TENDERLY.PROJECT && config.TENDERLY.ACCESS_KEY)
  },

  async run<K extends keyof ITenderlyRequestMap>(request: ITenderlyRequest<K>): Promise<ITenderlyResult<K>> {
    const params = request as ITenderlyRequest
    try {
      const deadlineAt = TenderlyTransport.deadlineAt(request.sentAt)
      if (params.operation === ITenderlyOperation.crossChainGas) {
        const controllerAddress = getAddress(params.controllerAddress)
        const id = TenderlyCache.crossChainGasKey(
          params.network,
          controllerAddress,
          params.destinationChainId,
          params.actions,
        )
        return TenderlyModule._runCached(params.operation, id, deadlineAt, () =>
          CrossChainGasService.simulate({ ...params, controllerAddress }, deadlineAt),
        ) as Promise<ITenderlyResult<K>>
      }
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
    } catch (error) {
      TenderlyMetrics.refused.inc({ operation: params.operation, reason: TenderlyMetrics.reason(error) })
      throw error
    }
  },

  async _runCached<K extends keyof ITenderlyRequestMap>(
    operation: K,
    id: string,
    deadlineAt: number,
    simulate: () => Promise<ITenderlyResult<K>>,
    save?: (result: ITenderlyResult<K>) => Promise<void>,
  ): Promise<ITenderlyResult<K>> {
    try {
      const cached = await TenderlyCache.read(operation, id, Date.now())
      if (cached) {
        await save?.(cached)
        return cached
      }
    } catch (error) {
      TenderlyMetrics.refused.inc({ operation, reason: TenderlyMetrics.reason(error) })
      throw error
    }
    return InFlight.run(id, () =>
      TenderlyMetrics.track(operation, async () => {
        const cached = await TenderlyCache.read(operation, id, Date.now())
        if (cached) {
          await save?.(cached)
          return cached
        }
        Errors.assertExposable(Date.now() < deadlineAt, ErrorKeyEnum.tooBusy)
        let result: ITenderlyResult<K>
        try {
          result = await simulate()
        } catch (error) {
          if (
            operation === ITenderlyOperation.crossChainGas &&
            Errors.isExposableError(error) &&
            error.message === ErrorKeyEnum.crossChainGasBudgetExhausted
          ) {
            const now = Date.now()
            const retained = await TenderlyCache.readRetained(ITenderlyOperation.crossChainGas, id, now)
            if (retained) {
              TenderlyMetrics.refused.inc({ operation, reason: 'limit' })
              return (
                retained.fresh ? retained.result : { ...retained.result, staleSince: retained.result.runAt, runAt: now }
              ) as ITenderlyResult<K>
            }
          }
          throw error
        }
        await save?.(result)
        await TenderlyCache.write(operation, id, result, 'runAt' in result ? result.runAt : Date.now())
        return result
      }),
    )
  },

  async simulate(
    simulation: { to: string; data: string; value?: string; from: string; blockNumber?: number | null },
    network: NetworksEnum,
    context: ITenderlySendContext,
  ): Promise<{ url: string; runAt: number; status: ISimulationStatus }> {
    const { shareUrl, runAt, status } = await TenderlyModule._payload(simulation, network, context, false)
    return { url: shareUrl, runAt, status }
  },

  /**
   * Run full simulation with asset_changes, contracts, and call_trace
   * Used for dispatch simulation summary
   */
  async simulateFull(
    simulation: { to: string; data: string; value?: string; from: string; blockNumber?: number | null },
    network: NetworksEnum,
    context: ITenderlySendContext,
  ): Promise<ITenderlyFullResult> {
    logger.info('Running full Tenderly simulation', llo({ network, to: simulation.to, from: simulation.from }))

    const { response, shareUrl, status } = await TenderlyModule._payload(simulation, network, context, true)
    const errorMessage = response.transaction?.error_info?.error_message
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
      shareUrl,
      assetChanges: transactionInfo?.asset_changes ?? [],
      balanceChanges: transactionInfo?.balance_changes ?? [],
      callTrace: transactionInfo?.call_trace,
      contracts: response.contracts ?? [],
      error: errorMessage,
    }
  },

  async _payload(
    simulation: { to: string; data: string; value?: string; from: string; blockNumber?: number | null },
    network: NetworksEnum,
    context: ITenderlySendContext,
    full: boolean,
  ) {
    const simulationData = {
      network_id: ProviderModule.getChainId(network).toString(),
      block_number: simulation.blockNumber ?? null,
      from: simulation.from,
      input: simulation.data,
      to: simulation.to,
      gas: 8000000,
      gas_price: '0',
      value: full ? simulation.value || '0' : '0',
      save: true,
      save_if_fails: true,
      ...(full ? { simulation_type: 'full' } : {}),
    }
    const response = await TenderlyTransport.simulate(simulationData, context)
    const runAt = Date.now()
    const shareUrl = await TenderlyTransport.share(response.simulation!.id, context.deadlineAt)
    const status =
      response.transaction?.status === false || response.transaction?.error_info?.error_message
        ? ISimulationStatus.FAILED
        : ISimulationStatus.SUCCESS
    return { response, runAt, shareUrl, status }
  },
}

export default TenderlyModule
