import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { Models } from '@dbModels'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:SyncProposalType' })

export const SyncProposalType: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const datas = await Models.Setting.find({ pluginSubdomain: { $regex: /spp/, $options: 'i' } })

    await Promise.all(
      datas.map(async (data: any) => {
        const transactionHash = data.transactionHash
        const network = data.network

        const txReceipt = await Web3Helper.getTransactionReceipt(transactionHash, network)
        if (!txReceipt) {
          return
        }

        const sppSettings = Web3Utils.findLogsByName(txReceipt, 'StagesUpdated', StagedProposalProcessor.abi)

        if (sppSettings?.length > 0) {
          for (const sppSetting of sppSettings) {
            const info = Web3Utils.parseInfoLog(sppSetting.txLog, 'StagesUpdated', network)
            const parsedEvent = sppSetting.parsed!
            const relatedPlugin = await Models.Plugin.findByAddress(info.address, network)

            if (!relatedPlugin) {
              logger.warn('Plugin not found', llo(info))
              return
            }

            const existingLog = await Models.Setting.findExistingLog({
              transactionHash,
              pluginAddress: relatedPlugin.address,
            })

            if (!existingLog) return

            const pluginSettings = await Models.Setting.find({
              network: info.network,
              pluginAddress: relatedPlugin.address,
            })

            await Promise.all(
              pluginSettings.map(async (activePluginSetting: any) => {
                activePluginSetting.stages.forEach((stage: any, index: number) => {
                  stage.plugins.forEach((plugin: any, indexPlugin: number) => {
                    const eventPlugin = parsedEvent.args.stages[index].plugins[indexPlugin]
                    const type = utils.parseNumber(eventPlugin.resultType ?? eventPlugin.proposalType)
                    plugin.proposalType = type
                  })
                })
                // activePluginSetting.markModified('stages');

                await activePluginSetting.save()

                const _updatedSettings = await Models.Setting.findActive({
                  network: info.network,
                  pluginAddress: relatedPlugin.address,
                })
              }),
            )
          }
        }
      }),
    )
  },

  stop: async () => {},
}

export default SyncProposalType
