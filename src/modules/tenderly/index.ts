import logger from '@logger'
import ProviderModule from '@modules/provider'
import {
  ISimulationStatus,
  type ITenderlyFullResult,
  type ITenderlyFullSimulationResponse,
  type ITenderlySendContext,
  type NetworksEnum,
} from '@types'
import TenderlyTransport from './transport'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

const TenderlyModule = {
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
    }

    const response = await TenderlyTransport.simulate(simulationData, context)

    const runAt = Date.now()

    const shareableUrl = await TenderlyModule.createShareableUrl(response.simulation!.id, context.deadlineAt)
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
    const shareableUrl = await TenderlyModule.createShareableUrl(response.simulation!.id, context.deadlineAt)
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
