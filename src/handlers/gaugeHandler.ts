import { type LogDescription } from 'ethers'
import { type ILogInfo } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'handlers:ExecuteHandler' })

export const ExecuteHandler = {
  gaugeCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeCreated(address indexed gauge, address indexed creator, string metadataURI);

    try {
      const metadataUri = Web3Utils.extractMetadataUri(parsedEvent.args.metadataURI)
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 4 })

      await Models.Gauge.create({
        blockNumber: info.blockNumber,
        transactionHash: info.transactionHash,
        network: info.network,
        pluginAddress: info.address,
        address: parsedEvent.args.gauge,
        creatorAddress: parsedEvent.args.creator,
        name: ipfsMetadata?.name!,
        description: ipfsMetadata?.description!,
        isActive: false,
      })
    } catch (error) {
      logger.error('Error creating gauge', llo({ error, info, parsedEvent }))
    }
  },

  gaugeActivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeActivated(address indexed gauge);
    const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
    if (!gauge) {
      logger.warn('No gauge found activated', llo({ info, parsedEvent }))
      return
    }

    await gauge.update({ isActive: true })
    logger.verbose('Gauge activated', llo({ address: parsedEvent.args.gauge }))
  },

  gaugeDeactivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeDeactivated(address indexed gauge);
    const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
    if (!gauge) {
      logger.warn('No gauge found deactivated', llo({ info, parsedEvent }))
      return
    }

    await gauge.update({ isActive: false })
    logger.verbose('Gauge deactivated', llo({ address: parsedEvent.args.gauge }))
  },

  gaugeUpdateMetadata: async (parsedEvent: LogDescription, info: ILogInfo) => {
    //  event GaugeMetadataUpdated(address indexed gauge, string metadataURI);

    const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
    if (!gauge) {
      logger.warn('No gauge found update metadata', llo({ info, parsedEvent }))
      return
    }

    try {
      const metadataUri = Web3Utils.extractMetadataUri(parsedEvent.args.metadataURI)
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 4 })

      await gauge.update({
        name: ipfsMetadata?.name!,
        description: ipfsMetadata?.description!,
      })
      logger.verbose('Gauge update updated', llo({ address: parsedEvent.args.gauge }))
    } catch (error) {
      logger.error('Error update gauge metadata', llo({ error, info, parsedEvent }))
    }
  },

  gaugeVoted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event Voted(
    //   address indexed voter,
    //   address indexed gauge,
    //   uint256 indexed epoch,
    //   uint256 votingPowerCastForGauge,
    //   uint256 totalVotingPowerInGauge,
    //   uint256 totalVotingPowerInContract,
    //   uint256 timestamp
    // );
  },

  gaugeReset: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // emit Reset({
    //     voter: _account,
    //     gauge: gauge,
    //     epoch: epochId(),
    //     votingPowerRemovedFromGauge: _votes,
    //     totalVotingPowerInGauge: epochGaugeVotes[epoch][gauge],
    //     totalVotingPowerInContract: epochTotalVotingPowerCast[epoch],
    //     timestamp: block.timestamp
    //   });
  },
}
