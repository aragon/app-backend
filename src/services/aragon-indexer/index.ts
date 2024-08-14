import logger from '@logger'
import { EnumConnection, IEnumIndexerService, type IService } from '@types'
import { NetworkHelper } from '@helpers/network'
import ConfigIndexer from '@indexer/configIndexer'
import EventListener from '@modules/eventListener'

const llo = logger.logMeta.bind(null, { service: 'service:Indexer2Service' })

const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('Indexer2Service service sync start', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    const orderedServices = [
      [IEnumIndexerService.logPluginRepoRegistry],
      [IEnumIndexerService.logDaoRegistry],
      [IEnumIndexerService.logPluginSetupProcessor, IEnumIndexerService.logMetadata],
      [
        IEnumIndexerService.logPluginSettingMultisig,
        IEnumIndexerService.logPluginSettingTokenVoting,
        IEnumIndexerService.logProposal,
        IEnumIndexerService.logProposalMultisig,
      ],
      [IEnumIndexerService.logMember, IEnumIndexerService.logMemberGovernance],
    ]

    for (const group of orderedServices) {
      // For each group, process all services in parallel
      const logServices = networks.flatMap(({ networkName }) =>
        ConfigIndexer.filter(config => config.enabled && group.includes(config.name)).flatMap(config =>
          config.listen
            .filter(eventConfig => eventConfig.enabled)
            .map(eventConfig => {
              const { name, abi } = config
              const { event, handler } = eventConfig

              return new EventListener({
                name,
                networkName,
                abi,
                listen: [{ event, handler, enabled: true }],
              })
            }),
        ),
      )

      await Promise.all(logServices.map(service => service.start()))
    }

    logger.info('Indexer2Service service sync end', llo({}))
  },
  async stop() {
    logger.info('Indexer2Service service stopped', llo({}))
  },
}

export default IndexerService
