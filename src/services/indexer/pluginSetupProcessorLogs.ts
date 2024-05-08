import logger from '@logger'
import { PluginLogsInstallationPrepared } from '@services/indexer/pluginSetupProcessorLogs/installationPrepared'
import { PluginLogsInstallationApplied } from '@services/indexer/pluginSetupProcessorLogs/installationApplied'
import { PluginLogsUninstallationPrepared } from '@services/indexer/pluginSetupProcessorLogs/uninstallationPrepared'
import { PluginLogsUninstallationApplied } from '@services/indexer/pluginSetupProcessorLogs/uninstallationApplied'
import { PluginLogsUpdatePrepared } from '@services/indexer/pluginSetupProcessorLogs/updatePrepared'
import { PluginLogsUpdateApplied } from '@services/indexer/pluginSetupProcessorLogs/updateApplied'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginLogs' })

// AddresslistVotingRepoProxy - 0xC207767d8A7a28019AFFAEAe6698F84B5526EbD7 - address-list-voting-repo
// TokenVotingRepoProxy - 0xb7401cD221ceAFC54093168B814Cc3d42579287f - token-voting-repo
// AdminRepoProxy - 0xA4371a239D08bfBA6E8894eccf8466C6323A52C3 - admin-repo
// MultisigRepoProxy - 0x8c278e37D0817210E18A7958524b7D0a1fAA6F7b - multisig-repo

export const PluginSetupProcessorLogs = {
  start: async () => {
    logger.verbose('Start PluginSetupProcessorLogs', llo())

    await Promise.all([
      PluginLogsInstallationPrepared.start(),
      PluginLogsInstallationApplied.start(),
      PluginLogsUninstallationPrepared.start(),
      PluginLogsUninstallationApplied.start(),
      PluginLogsUpdatePrepared.start(),
      PluginLogsUpdateApplied.start(),
    ])

    logger.verbose('Finish PluginSetupProcessorLogs', llo())
  },
}
