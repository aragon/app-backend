import { EnumConnection, type IService, ISettingStatus, ISPPLogs, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Tools: CleanDb' })

export const AddSafeWalletSetting: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const sppPlugin = '0x5EAd86cc058881EB1e8Ec023781AbbBB7d111bbD'

    const settingsDb = await Models.Setting.findOne({
      pluginAddress: sppPlugin,
      network: NetworksEnum.ethereumSepolia,
      status: ISettingStatus.active,
    })

    const txReceipt = await Web3Helper.getTransactionReceipt(settingsDb.transactionHash, settingsDb.network)
    if (!txReceipt) {
      logger.error('Transaction receipt not found', llo({ txHash: settingsDb.transactionHash }))
      return
    }

    const setting = Web3Utils.findLogsByName(txReceipt, ISPPLogs.StagesUpdated, StagedProposalProcessor.abi)
    if (!setting) {
      logger.error('Setting not found in transaction receipt', llo({ txHash: settingsDb.transactionHash }))
      return
    }

    const logInfo = Web3Utils.parseInfoLog(setting[0].txLog, ISPPLogs.StagesUpdated, NetworksEnum.ethereumSepolia)
    const iFace = new Interface(StagedProposalProcessor.abi)
    const event = Web3Utils.parseLog(setting[0].txLog, iFace)!

    // remove the setting from the db
    await Models.Setting.deleteOne({
      id: settingsDb.id,
    })

    logger.info('Setting removed from db', llo({ id: settingsDb.id }))

    // add the setting to the db which will be fixed in the next block
    await PluginSettingHandler.sppSettingsUpdated(event, logInfo)

    logger.info('Setting added to db', llo({ id: settingsDb.id }))

    const proposals = await Models.Proposal.find({
      pluginAddress: sppPlugin,
      network: NetworksEnum.ethereumSepolia,
    })

    const updatedSettings = await Models.Setting.findOne({
      pluginAddress: sppPlugin,
      network: NetworksEnum.ethereumSepolia,
      status: ISettingStatus.active,
    })

    for (const proposal of proposals) {
      const setting = {
        id: updatedSettings?.id,
        transactionHash: updatedSettings.transactionHash,
        blockNumber: updatedSettings.blockNumber,
        blockTimestamp: updatedSettings.blockTimestamp,
        network: updatedSettings.network,
        daoAddress: updatedSettings.daoAddress,
        pluginAddress: updatedSettings.pluginAddress,
        pluginSubdomain: updatedSettings.pluginSubdomain,
        tokenAddress: updatedSettings.tokenAddress,
        onlyListed: updatedSettings?.onlyListed,
        minApprovals: updatedSettings?.minApprovals,
        votingMode: updatedSettings?.votingMode,
        supportThreshold: updatedSettings?.supportThreshold,
        minParticipation: updatedSettings?.minParticipation,
        minDuration: updatedSettings?.minDuration,
        minProposerVotingPower: updatedSettings?.minProposerVotingPower,
        stages: updatedSettings?.stages.toObject(),
      }

      await proposal.update({
        settings: setting,
      })

      logger.info('Proposal updated with new setting', llo({ id: proposal.id }))
    }
  },

  stop: async () => {},
}
