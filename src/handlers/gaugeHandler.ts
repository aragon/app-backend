import { type LogDescription } from 'ethers'
import { type ILogInfo } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'
import Web3Helper from '@helpers/web3'
import type VoteEpoch from '@models/schema/voteEpoch'

const llo = logger.logMeta.bind(null, { service: 'handlers:GaugeHandler' })

export const GaugeHandler = {
  gaugeCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeCreated(address indexed gauge, address indexed creator, string metadataURI);

    try {
      const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
      if (gauge) {
        logger.warn('Duplicate gauge found', llo({ info, parsedEvent }))
        return
      }

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
        links: ipfsMetadata?.links!,
        avatar: ipfsMetadata?.avatar!,
        isActive: false,
      })

      logger.verbose('Gauge created', llo({ address: parsedEvent.args.gauge }))
    } catch (error) {
      logger.error('Error creating gauge', llo({ error, info, parsedEvent }))
    }
  },

  gaugeActivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeActivated(address indexed gauge);

    try {
      const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
      if (!gauge) {
        logger.warn('No gauge found activated', llo({ info, parsedEvent }))
        return
      }

      await gauge.update({ isActive: true })
      logger.verbose('Gauge activated', llo({ address: parsedEvent.args.gauge }))
    } catch (error) {
      logger.error('Error gaugeActivated', llo({ error, info, parsedEvent }))
    }
  },

  gaugeDeactivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // event GaugeDeactivated(address indexed gauge);

    try {
      const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
      if (!gauge) {
        logger.warn('No gauge found deactivated', llo({ info, parsedEvent }))
        return
      }

      await gauge.update({ isActive: false })
      logger.verbose('Gauge deactivated', llo({ address: parsedEvent.args.gauge }))
    } catch (error) {
      logger.error('Error gaugeDeactivated', llo({ error, info, parsedEvent }))
    }
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
        links: ipfsMetadata?.links!,
        avatar: ipfsMetadata?.avatar!,
      })
      logger.verbose('Gauge update updated', llo({ address: parsedEvent.args.gauge }))
    } catch (error) {
      logger.error('Error update gauge metadata', llo({ error, info, parsedEvent }))
    }
  },

  gaugeVoted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    /// @param votingPowerCastForGauge votes cast by this address for this gauge in this vote
    /// @param totalVotingPowerInGauge total voting power in the gauge at the time of the vote, after applying the vote
    /// @param totalVotingPowerInContract total voting power in the contract at the time of the vote, after applying the vote
    // event Voted(
    //   address indexed voter,
    //   address indexed gauge,
    //   uint256 indexed epoch,
    //   uint256 votingPowerCastForGauge,
    //   uint256 totalVotingPowerInGauge,
    //   uint256 totalVotingPowerInContract,
    //   uint256 timestamp
    // );

    const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
    if (!gauge) {
      logger.warn('No gauge found gaugeVoted', llo({ info, parsedEvent }))
      return
    }

    try {
      const plugin = await gauge.getPlugin()

      const existingLog = await Models.VoteEpoch.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      })
      if (existingLog) return

      const document: Partial<VoteEpoch> = {
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        blockNumber: info.blockNumber,
        blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
        daoAddress: plugin.daoAddress,
        gaugeAddress: gauge.address,
        memberAddress: parsedEvent.args.voter,
        epochId: parsedEvent.args.epoch.toString(),
        votingPower: parsedEvent.args.votingPowerCastForGauge.toString(),
      }

      await Models.VoteEpoch.create(document)

      logger.verbose('Gauge voted', llo({ address: gauge.address, epochId: document.epochId }))
    } catch (error) {
      logger.error('Error gaugeVoted', llo({ error, info, parsedEvent }))
    }
  },

  gaugeReset: async (parsedEvent: LogDescription, info: ILogInfo) => {
    /// @param votingPowerRemovedFromGauge votes removed by this address for this gauge, at the time of this rest
    /// @param totalVotingPowerInGauge total voting power in the gauge at the time of the reset, after applying the reset
    /// @param totalVotingPowerInContract total voting power in the contract at the time of the reset, after applying the reset
    // emit Reset({
    //     voter: _account,
    //     gauge: gauge,
    //     epoch: epochId(),
    //     votingPowerRemovedFromGauge: _votes,
    //     totalVotingPowerInGauge: epochGaugeVotes[epoch][gauge],
    //     totalVotingPowerInContract: epochTotalVotingPowerCast[epoch],
    //     timestamp: block.timestamp
    //   });

    const gauge = await Models.Gauge.findOne({ address: parsedEvent.args.gauge, network: info.network })
    if (!gauge) {
      logger.warn('No gauge found gaugeReset', llo({ info, parsedEvent }))
      return
    }

    try {
      // Find the VoteEpoch by voter, gauge, epoch, and network (not by the Reset transaction)
      const existingVote = await Models.VoteEpoch.findOne({
        network: info.network,
        gaugeAddress: parsedEvent.args.gauge,
        memberAddress: parsedEvent.args.voter,
        epochId: parsedEvent.args.epoch.toString(),
      })

      if (!existingVote) {
        logger.warn('No voteEpoch found gaugeReset', llo({ info, parsedEvent }))
        return
      }

      await existingVote.update({
        resetVoteTransactionHash: info.transactionHash,
      })

      logger.verbose('Gauge reset vote', llo({ address: gauge.address, epochId: parsedEvent.args.epoch }))
    } catch (error) {
      logger.error('Error gaugeReset', llo({ error, info, parsedEvent }))
    }
  },
}
