import SppBodyConditionHelper from '@helpers/sppBodyCondition'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type { ExternalProposer } from '@models/schema/setting'
import { type NetworksEnum, VotingBodyBrandIdentity } from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyConditions' })

/** Proposal conditions for Safe bodies and external Safe proposers of an SPP. */
const SafeBodyConditionsModule = {
  /**
   * Puts conditions on Safe stage bodies and returns external Safe proposers.
   * Only Safe conditions are discoverable; internal bodies use their own Plugin document.
   * Returns undefined on failure, [] when resolved with no external proposers.
   */
  async attach(sppPlugin: Plugin, stages: any[], network: NetworksEnum): Promise<ExternalProposer[] | undefined> {
    try {
      const conditions = await SppBodyConditionHelper.resolveSppProposerConditions(
        sppPlugin.proposalCreationConditionAddress,
        network,
      )

      const bodyAddresses = new Set<string>()

      for (const stage of stages) {
        for (const stagePlugin of stage.plugins || []) {
          bodyAddresses.add(stagePlugin.address.toLowerCase())

          if (stagePlugin.brandId === VotingBodyBrandIdentity.SAFE) {
            stagePlugin.proposalCreationConditionAddress =
              conditions.get(stagePlugin.address.toLowerCase())?.conditionAddress ?? null
          }
        }
      }

      const externalProposers: ExternalProposer[] = []
      for (const [safeLowercase, { safeAddress, conditionAddress }] of conditions) {
        if (!bodyAddresses.has(safeLowercase)) {
          externalProposers.push({ address: safeAddress, proposalCreationConditionAddress: conditionAddress })
        }
      }

      return externalProposers
    } catch (error) {
      logger.warn(
        'Failed to attach external body conditions',
        llo({ pluginAddress: sppPlugin.address, network, error }),
      )
      return undefined
    }
  },
}

export default SafeBodyConditionsModule
