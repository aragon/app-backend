import { Models } from '@dbModels'
import TenderlyModule from '@modules/tenderly'
import logger from '@logger'
import { type NetworksEnum, IPluginStatus, ErrorKeyEnum, SimulationStatus } from '@types'
import * as Errors from '@errors'

const llo = logger.logMeta.bind(null, { service: 'simulation-controller' })

class SimulationController {
  /**
   * Simulate a bundle of transactions
   * This validates that recipients are DAOs and senders are plugins
   */
  static async validateBundle(actions: Array<{ to: string; data?: string; value?: string; from?: string }>) {
    const toAddresses = actions.map(action => action.to).filter(Boolean)
    const fromAddresses = actions.map(action => action.from).filter(Boolean)

    const daos = await Models.Dao.find({
      address: { $in: toAddresses },
      isActive: true,
      isHidden: { $ne: true },
    }).lean()

    const daoAddresses = daos.map((dao: { address: string }) => dao.address)
    const invalidRecipients = toAddresses.filter(addr => addr && !daoAddresses.includes(addr))

    Errors.assertExposable(
      invalidRecipients.length === 0,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Invalid recipients: recipients must be valid DAOs',
      llo({
        invalidRecipients,
        actions,
      }),
    )

    if (fromAddresses.length > 0) {
      const plugins = await Models.Plugin.find({
        address: { $in: fromAddresses },
        status: IPluginStatus.installed,
        isSupported: true,
      }).lean()

      const pluginAddresses = plugins.map((plugin: { address: string }) => plugin.address.toLowerCase())
      const invalidSenders = fromAddresses.filter(addr => addr && !pluginAddresses.includes(addr.toLowerCase()))

      Errors.assertExposable(
        invalidSenders.length === 0,
        ErrorKeyEnum.badSimulationRequest,
        400,
        'Invalid senders: senders must be valid plugins',
        llo({
          invalidSenders,
          actions,
        }),
      )
    }
  }

  static async simulateBundle(
    actions: Array<{ to: string; data?: string; value?: string; from?: string }>,
    network: NetworksEnum,
  ): Promise<any> {
    await SimulationController.validateBundle(actions)

    const result = (await TenderlyModule.simulateBundle(actions, network)) as {
      url?: string
      runAt?: number
    }

    if (!result) {
      return {
        status: SimulationStatus.FAILED,
        runAt: new Date().toISOString(),
        network,
      }
    }

    return {
      status: SimulationStatus.SUCCESS,
      url: result.url,
      runAt: result.runAt,
      network,
    }
  }

  /**
   * Run a simulation for a proposal's actions
   */
  static async simulateProposal(proposalId: string): Promise<any> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(
      proposal?.rawAction.length,
      ErrorKeyEnum.notFound,
      404,
      'Proposal not found',
      llo({ proposalId }),
    )

    const actions = proposal.rawActions.map((action: any) => ({
      to: action.to,
      data: action.data,
      value: action.value || '0',
      from: action.pluginAddress,
    }))

    await SimulationController.validateBundle(actions)

    const result = (await TenderlyModule.simulateBundle(actions, proposal.network)) as {
      url?: string
      runAt?: number
    }

    if (!result) {
      return {
        status: SimulationStatus.FAILED,
        runAt: new Date().toISOString(),
        network: proposal.network,
      }
    }

    await proposal.update({
      simulation: {
        status: result.url ? SimulationStatus.SUCCESS : SimulationStatus.FAILED,
        url: result.url,
        runAt: result.runAt ? new Date(result.runAt) : new Date(),
      },
    })

    return result
  }

  async getSimulationResultOfProposal(proposalId: string) {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(proposal?.simulation?.url, ErrorKeyEnum.notFound, 404)
    return {
      url: proposal.simulation.url,
      status: SimulationStatus.SUCCESS,
    }
  }
}

export default SimulationController
