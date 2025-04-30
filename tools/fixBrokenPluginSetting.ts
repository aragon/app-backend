import { EnumConnection, type IService } from '@types'
import ProviderModule from '@modules/provider'
import logger from '@logger'
import { Models } from '@dbModels'
import type Proposal from '@models/schema/proposal'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'tools:fixSettingIssue' })

interface IServiceExtended extends IService {
  fixProposals: (proposal: Proposal, settings: any) => Promise<void>
}

export const FixSettingIssue: IServiceExtended = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const list = await Models.Setting.aggregate([
      {
        $match: {
          pluginSubdomain: 'spp',
        },
      },
      {
        $sort: {
          pluginAddress: 1, // Sort by pluginAddress
          blockNumber: -1, // Sort by blockNumber in descending order
          status: 1, // Sort by status alphabetically (e.g., "active" before "inactive")
        },
      },
      {
        $group: {
          _id: '$pluginAddress', // Group by pluginAddress
          events: {
            $push: {
              id: '$id',
              network: '$network',
              blockNumber: '$blockNumber',
              status: '$status',
              transactionHash: '$transactionHash',
              blockTimestamp: '$blockTimestamp',
              stages: '$stages',
              daoAddress: '$daoAddress',
              pluginSubdomain: '$pluginSubdomain',
              tokenAddress: '$tokenAddress',
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gt: [{ $size: '$events' }, 1],
          },
        },
      },
      {
        $project: {
          _id: 0,
          pluginAddress: '$_id',
          settings: '$events',
        },
      },
    ])

    for (const item of list) {
      const { settings } = item

      const sortedSettings = settings.sort((a: any, b: any) => b.blockNumber - a.blockNumber)

      const recentInactive = sortedSettings.find((setting: any) => setting.status === 'inactive')

      const activeSetting = sortedSettings.find((setting: any) => setting.status === 'active')

      if (recentInactive && activeSetting && recentInactive.blockNumber > activeSetting.blockNumber) {
        const fixedSettings = recentInactive.stages.map((stage: any, index: number) => ({
          ...stage,
          name: activeSetting.stages[index].name,
        }))

        const toMarkInactive = await Models.Setting.findOne({
          id: activeSetting.id,
          status: 'active',
        })

        const toMarkActive = await Models.Setting.findOne({
          id: recentInactive.id,
          status: 'inactive',
        })

        await DbOperations.updateDocument(
          toMarkActive,
          { status: 'active', stages: fixedSettings },
          { logId: toMarkActive.id },
          'Mark setting active',
          llo,
        )

        await DbOperations.updateDocument(
          toMarkInactive,
          { status: 'inactive' },
          { logId: toMarkInactive.id },
          'Mark setting inactive',
          llo,
        )

        const proposal = await Models.Proposal.find({
          'settings.transactionHash': recentInactive.transactionHash,
          blockNumber: {
            $gt: recentInactive.blockNumber,
          },
        })

        for (const prop of proposal) {
          await FixSettingIssue.fixProposals(prop, fixedSettings)
        }
      }
    }

    logger.info('Done fixing settings')
  },

  fixProposals: async (proposal: Proposal, settings: any) => {
    const toUpdate = {
      settings: {
        ...(proposal.settings as any).toObject(),
        stages: settings,
      },
    }

    await DbOperations.updateDocument(proposal, toUpdate, { logId: proposal.id }, 'Fix proposal', llo)
  },

  stop: async () => {},
}

export default FixSettingIssue
