import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import Utils from '@helpers/utils'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { EnumConnection, type NetworksEnum } from '@types'
import { ethers } from 'ethers'
import * as fs from 'fs'
import GraphUtil from './graphUtil'

const llo = logger.logMeta.bind(null, { service: 'tool:IntegrityToolMemberCheck' })

export const IntegrityToolMemberCheck: any = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  BAD_PLUGINS: [],
  GOOD_PLUGINS: [],

  checkForTokenHolders: async (tokenAddresses: string[], network: NetworksEnum) => {
    try {
      const responses = await Promise.all(
        tokenAddresses.map(async tokenAddress => GraphUtil.getMembersFromGraphOfToken(network, tokenAddress)),
      )

      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i]
        const response = responses[i]

        if (!response?.data?.data?.holders) {
          logger.warn(`No data received from Graph API for token: ${tokenAddress}`)
          continue
        }

        const graphHolders = response.data.data.holders.holders.map((holder: any) => ethers.getAddress(holder.address))

        const daoMemberMappings = await Models.DaoMemberMapping.find({ tokenAddress, network })
        const dbHolders = daoMemberMappings.map((entry: any) => ethers.getAddress(entry.memberAddress))

        await IntegrityToolMemberCheck.saveProgress(dbHolders, graphHolders, 'token', tokenAddress, network)
      }
    } catch (error) {
      logger.error('Error during member integrity check:', error)
    }
  },

  checkForMultisigMembers: async (pluginAddresses: string[], network: NetworksEnum) => {
    try {
      const responses = await Promise.all(
        pluginAddresses.map(async pluginAddress => GraphUtil.getMultisigBasedMembersFromGraph(network, pluginAddress)),
      )

      for (let i = 0; i < pluginAddresses.length; i++) {
        const pluginAddress = pluginAddresses[i]
        const response = responses[i]

        if (!response?.data?.data?.multisigApprovers!) {
          logger.warn(`No data received from Graph API for plugin: ${pluginAddress}`)
          continue
        }

        const graphHolders = response.data.data.multisigApprovers
          .filter((holder: any) => holder.isActive)
          .map((holder: any) => ethers.getAddress(holder.address))

        const daoMemberMappings = await Models.DaoMemberMapping.find({ pluginAddress, network })

        const dbHolders = daoMemberMappings.map((entry: any) => ethers.getAddress(entry.memberAddress))

        await IntegrityToolMemberCheck.saveProgress(dbHolders, graphHolders, 'multisig', pluginAddress, network)
      }
    } catch (e) {
      logger.error('Error during multisig integrity check:', e)
    }
  },

  savePassedStuffs: (address: any, type: any, network: any) => {
    IntegrityToolMemberCheck.GOOD_PLUGINS.push({ address, type, network })
  },

  saveProgress: async (dbHolders: any, graphHolders: any, type: any, address: any, network: NetworksEnum) => {
    const isMemberCountMatching = graphHolders.length === dbHolders.length
    const isDataMatching = graphHolders.every((address: any) => dbHolders.includes(address))

    if (dbHolders.length > graphHolders.length) {
      IntegrityToolMemberCheck.savePassedStuffs(address, type, network)
      return true
    }

    if (!isMemberCountMatching || !isDataMatching) {
      IntegrityToolMemberCheck.BAD_PLUGINS.push({ address, type, network })

      logger.error(
        `❌ Members mismatch for ${type}: ${address}`,
        llo({
          dbHolders: dbHolders.length,
          graphHolders: dbHolders.length,
        }),
      )
    } else {
      logger.info(
        `✅ All members match for ${type}: ${address}`,
        llo({ dbHolders: dbHolders.length, graphHolders: graphHolders.length }),
      )
      IntegrityToolMemberCheck.savePassedStuffs(address, type, network)

      return true
    }
  },

  start: async () => {
    const networks = NetworkHelper.supportedNetworks()

    if (!fs.existsSync('tools/integrityCheck/progress.json')) {
      fs.writeFileSync('tools/integrityCheck/progress.json', '[]')
    }

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const dbCrawler = new DBCrawler({
          model: Models.DaoMemberMapping,
          useAggregate: true,
          aggregate: (_skip: number | undefined, _limit: number | undefined) => {
            return [
              {
                $match: {
                  network: networkName,
                },
              },
              { $group: { _id: '$pluginAddress', info: { $last: '$$ROOT' } } },
              {
                $skip: _skip ?? 0,
              },
              {
                $limit: _limit ?? 500,
              },
              {
                $addFields: {
                  daoAddress: '$info.daoAddress',
                  pluginAddress: '$info.pluginAddress',
                  tokenAddress: '$info.tokenAddress',
                  network: '$info.network',
                },
              },
              { $project: { daoAddress: 1, pluginAddress: 1, tokenAddress: 1, network: 1, _id: 0 } },
            ]
          },
          onDocument: async (document: any) => {
            if (document.tokenAddress) {
              await IntegrityToolMemberCheck.checkForTokenHolders([document.tokenAddress], document.network)
            } else {
              await IntegrityToolMemberCheck.checkForMultisigMembers([document.pluginAddress], document.network)
            }
            await Utils.wait(100)
          },
          onError: (error: any, document: any) => {
            logger.error('Error Token hasDelegate', { document, error })
          },
          batchSize: 50,
          concurrency: 5,
        })

        await dbCrawler.crawl()
      }),
    )

    logger.info(
      'Integrity check completed',
      llo({
        goodPluginsCount: IntegrityToolMemberCheck.GOOD_PLUGINS.length,
      }),
    )

    if (IntegrityToolMemberCheck.BAD_PLUGINS.length > 0) {
      logger.error(
        'Integrity check failed',
        llo({
          badPluginsCount: IntegrityToolMemberCheck.BAD_PLUGINS.length,
          badPlugins: IntegrityToolMemberCheck.BAD_PLUGINS,
        }),
      )
    }
  },
  stop: async () => {},
}

export default IntegrityToolMemberCheck
