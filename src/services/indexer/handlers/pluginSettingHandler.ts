import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginSettingHandler' })

export const PluginSettingHandler = {
  votingSettingsUpdated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('votingSettingsUpdated', llo({ parsedEvent }))

    const pluginAddress = txLog.address
    const existingLog = await Models.LogPluginSetting.findTxHash(txLog.transactionHash, pluginAddress)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const settingLog = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          pluginAddress,
          network,
          votingMode: Number(parsedEvent.args.votingMode),
          supportThreshold: Number(parsedEvent.args.supportThreshold),
          minParticipation: Number(parsedEvent.args.minParticipation),
          minDuration: Number(parsedEvent.args.minDuration),
          minProposerVotingPower: Number(parsedEvent.args.minProposerVotingPower),
        }
        await Models.LogPluginSetting.create(settingLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New LogPluginSetting - votingSettingsUpdated', llo({ settingLog }))
      })
    }
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('multisigSettingsUpdated', llo({ parsedEvent }))
    const pluginAddress = txLog.address
    const existingLog = await Models.LogPluginSetting.findTxHash(txLog.transactionHash, pluginAddress)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const settingLog = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          pluginAddress,
          network,
          onlyListed: parsedEvent.args.onlyListed,
          minApprovals: Number(parsedEvent.args.minApprovals),
        }
        await Models.LogPluginSetting.create(settingLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New LogPluginSetting - multisigSettingsUpdated', llo({ settingLog }))
      })
    }
  },
}
