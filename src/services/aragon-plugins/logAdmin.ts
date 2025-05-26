import logger from '@logger'
import { IAdminLogs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import { DAO } from '@artifacts/dao'
import { Interface, ethers } from 'ethers'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { PermissionHandler } from '@src/handlers/permissionHandler'
import { PluginSettingHandler } from '@src/handlers/pluginSettingHandler'
import { IPermission } from '@src/types/permission'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogAdmin' })

export const LogAdmin = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogAdmin', llo({ network: plugin.network }))

    await LogAdmin._syncAdminMember(plugin)

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IAdminLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogAdmin.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose('End LogAdmin', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogAdmin',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },

  /**
   *  When an admin plugin is installed, we need to sync the admin member
   *  We need to grab all the granted permission as they will be on the same tx hash where plugin is created
   *  This Case is only for admin plugin
   */

  async _syncAdminMember(plugin: Plugin) {
    const txReceipt = await Web3Helper.getTransactionReceipt(plugin.transactionHash, plugin.network)

    const topics = [
      new Interface(DAO.abi).getEvent('Granted')?.topicHash!,
      new Interface(DAO.abi).getEvent('Revoked')?.topicHash!,
    ]

    const events = txReceipt!.logs.filter(log => topics.includes(log.topics[0]))

    for (const log of events) {
      const iFace = new Interface(DAO.abi)
      const event = Web3Utils.parseLog(log, iFace)!
      const info = Web3Utils.parseInfoLog(log, event.name, plugin.network)

      const permissionId = event.args.permissionId
      const permissionToCheck = ethers.id(IPermission.EXECUTE_PROPOSAL_PERMISSION)

      if (permissionToCheck === permissionId) {
        await PermissionHandler.handleForAdminPlugin(info.address, event.args.where, info.network, event.args.who)
      }
    }

    await PluginSettingHandler.isSupported(plugin, {
      transactionHash: plugin.transactionHash,
    } as any)

    logger.verbose('Admin Member Synced', llo({ network: plugin.network }))
  },
}
