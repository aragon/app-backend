import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginSettingHandler' })

export const PluginSettingHandler = {
  votingSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const pluginAddress = info.address
      const existingLog = await Models.LogPluginSetting.findExistingLog({
        transactionHash: info.transactionHash,
        pluginAddress,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const settingLog = {
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            pluginAddress,
            network: info.network,
            votingMode: Number(parsedEvent.args.votingMode),
            supportThreshold: Number(parsedEvent.args.supportThreshold),
            minParticipation: Number(parsedEvent.args.minParticipation),
            minDuration: Number(parsedEvent.args.minDuration),
            minProposerVotingPower: Number(parsedEvent.args.minProposerVotingPower),
          }
          const logDb = await Models.LogPluginSetting.create(settingLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New LogPluginSetting - multisigSettingsUpdated', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error votingSettingsUpdated', llo({ ...info, error }))
    }
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const pluginAddress = info.address
      const existingLog = await Models.LogPluginSetting.findExistingLog({
        transactionHash: info.transactionHash,
        pluginAddress,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const settingLog = {
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            pluginAddress,
            network: info.network,
            onlyListed: parsedEvent.args.onlyListed,
            minApprovals: Number(parsedEvent.args.minApprovals),
          }
          const logDb = await Models.LogPluginSetting.create(settingLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New LogPluginSetting - multisigSettingsUpdated', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error multisigSettingsUpdated', llo({ ...info, error }))
    }
  },
}
