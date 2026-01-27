import { Models } from '@dbModels'
import logger from '@logger'
import { EnumConnection, EnumQueueName, type HexAddress, type IService, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'tool:resyncDaoVeGovernance' })

const DAO_ADDRESS: HexAddress = '0x76De198A3175d046E10f872927C333D29Ff9B914'
const NETWORK = NetworksEnum.katanaMainnet

export const ResyncDaoVeGovernance: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],

  start: async () => {
    logger.info(
      'Starting resyncDaoVeGovernance tool',
      llo({ daoAddress: DAO_ADDRESS, network: NETWORK }),
    )

    const plugins = await Models.Plugin.find({ daoAddress: DAO_ADDRESS, network: NETWORK })
    if (plugins.length === 0) {
      logger.error('No plugins found for DAO', llo({ daoAddress: DAO_ADDRESS }))
      return
    }

    logger.info(
      'Found plugins',
      llo({ count: plugins.length, plugins: plugins.map(p => ({ address: p.address, type: p.interfaceType })) }),
    )

    const gaugePlugin = plugins.find(p => p.interfaceType === 'gauge')
    if (!gaugePlugin || !gaugePlugin.votingEscrow) {
      logger.error('No gauge plugin found for DAO', llo({ daoAddress: DAO_ADDRESS }))
      return
    }

    const { escrowAddress, exitQueueAddress, nftLockAddress } = gaugePlugin.votingEscrow
    const gaugePluginAddress = gaugePlugin.address
    const tokenAddress = gaugePlugin.tokenAddress

    logger.info(
      'VE Governance addresses',
      llo({ escrowAddress, exitQueueAddress, nftLockAddress, gaugePluginAddress, tokenAddress }),
    )

    const counts = await getRecordCounts(escrowAddress, exitQueueAddress, gaugePluginAddress)
    logger.info('Records to be deleted', llo(counts))

    await deleteRecords(escrowAddress, exitQueueAddress)

    await resetConfigIndexerSync(escrowAddress, exitQueueAddress, gaugePluginAddress)

    const countsAfter = await getRecordCounts(escrowAddress, exitQueueAddress, gaugePluginAddress)
    logger.info('Records after deletion', llo(countsAfter))

    logger.info('Finished resyncDaoVeGovernance tool. Restart indexer to resync from beginning.', llo())

    await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
      id: gaugePlugin.address,
      params: { address: gaugePlugin.address, network: gaugePlugin.network },
    })
  },

  stop: async () => {},
}

async function getRecordCounts(
  escrowAddress: HexAddress,
  exitQueueAddress: HexAddress,
  gaugePluginAddress: HexAddress,
) {
  const [
    lockCount,
    voteGaugeCount,
    gaugeCount,
    gaugeMetricsCount,
    pluginMemberCount,
    pluginMetricsCount,
    configIndexerCount,
  ] = await Promise.all([
    Models.Lock.countDocuments({ escrowAddress, network: NETWORK }),
    Models.VoteGauge.countDocuments({ pluginAddress: gaugePluginAddress, network: NETWORK }),
    Models.Gauge.countDocuments({ pluginAddress: gaugePluginAddress, network: NETWORK }),
    Models.GaugeMetrics.countDocuments({ pluginAddress: gaugePluginAddress, network: NETWORK }),
    Models.PluginMember.countDocuments({ pluginAddress: gaugePluginAddress, network: NETWORK }),
    Models.PluginMetrics.countDocuments({ pluginAddress: gaugePluginAddress, network: NETWORK }),
    Models.ConfigIndexer.countDocuments({
      network: NETWORK,
      service: {
        $regex: `${escrowAddress}|${exitQueueAddress}|${gaugePluginAddress}`,
        $options: 'i',
      },
    }),
  ])

  return {
    lockCount,
    voteGaugeCount,
    gaugeCount,
    gaugeMetricsCount,
    pluginMemberCount,
    pluginMetricsCount,
    configIndexerCount,
  }
}

async function deleteRecords(
  escrowAddress: HexAddress,
  gaugePluginAddress: HexAddress,
) {
  const lockResult = await Models.Lock.deleteMany({ escrowAddress, network: NETWORK })
  logger.info('Deleted Lock records', llo({ deletedCount: lockResult.deletedCount }))

  const voteGaugeResult = await Models.VoteGauge.deleteMany({ pluginAddress: gaugePluginAddress, network: NETWORK })
  logger.info('Deleted VoteGauge records', llo({ deletedCount: voteGaugeResult.deletedCount }))

  const gaugeResult = await Models.Gauge.deleteMany({ pluginAddress: gaugePluginAddress, network: NETWORK })
  logger.info('Deleted Gauge records', llo({ deletedCount: gaugeResult.deletedCount }))

  const gaugeMetricsResult = await Models.GaugeMetrics.deleteMany({
    pluginAddress: gaugePluginAddress,
    network: NETWORK,
  })
  logger.info('Deleted GaugeMetrics records', llo({ deletedCount: gaugeMetricsResult.deletedCount }))

  const pluginMemberResult = await Models.PluginMember.deleteMany({
    pluginAddress: gaugePluginAddress,
    network: NETWORK,
  })
  logger.info('Deleted PluginMember records', llo({ deletedCount: pluginMemberResult.deletedCount }))

  const pluginMetricsResult = await Models.PluginMetrics.deleteMany({
    pluginAddress: gaugePluginAddress,
    network: NETWORK,
  })
  logger.info('Deleted PluginMetrics records', llo({ deletedCount: pluginMetricsResult.deletedCount }))
}

async function resetConfigIndexerSync(
  escrowAddress: HexAddress,
  exitQueueAddress: HexAddress,
  gaugePluginAddress: HexAddress,
) {
  const configIndexerResult = await Models.ConfigIndexer.deleteMany({
    network: NETWORK,
    service: {
      $regex: `${escrowAddress}|${exitQueueAddress}|${gaugePluginAddress}`,
      $options: 'i',
    },
  })
  logger.info('Deleted ConfigIndexer records', llo({ deletedCount: configIndexerResult.deletedCount }))
}

export default ResyncDaoVeGovernance
