import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

export const GaugeValidator = {
  gaugeCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const gaugeAddress = parsedEvent.args.gauge
    const entityId = Models.Gauge.getEntityId({
      network: info.network,
      address: gaugeAddress,
      pluginAddress: info.address,
    })
    const record = await Models.Gauge.findByEntityId(entityId)
    if (!record) {
      logNotFound('GaugeCreated', info, { entityId, gaugeAddress })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('GaugeCreated', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('GaugeCreated', info, { entityId })
  },

  gaugeActivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const gaugeAddress = parsedEvent.args.gauge
    const record = await Models.Gauge.findOne({
      address: gaugeAddress,
      pluginAddress: info.address,
      network: info.network,
    })
    if (!record) {
      logNotFound('GaugeActivated', info, { gaugeAddress })
      return
    }
    logValid('GaugeActivated', info, { gaugeAddress })
  },

  gaugeDeactivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const gaugeAddress = parsedEvent.args.gauge
    const record = await Models.Gauge.findOne({
      address: gaugeAddress,
      pluginAddress: info.address,
      network: info.network,
    })
    if (!record) {
      logNotFound('GaugeDeactivated', info, { gaugeAddress })
      return
    }
    logValid('GaugeDeactivated', info, { gaugeAddress })
  },

  gaugeUpdateMetadata: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const gaugeAddress = parsedEvent.args.gauge
    const record = await Models.Gauge.findOne({
      address: gaugeAddress,
      pluginAddress: info.address,
      network: info.network,
    })
    if (!record) {
      logNotFound('GaugeMetadataUpdated', info, { gaugeAddress })
      return
    }
    logValid('GaugeMetadataUpdated', info, { gaugeAddress })
  },

  gaugeVoted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const entityId = Models.VoteGauge.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      pluginAddress: info.address,
    })
    const record = await Models.VoteGauge.findByEntityId(entityId)
    if (!record) {
      logNotFound('Voted', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('Voted', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('Voted', info, { entityId })
  },

  gaugeReset: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const voter = parsedEvent.args.voter
    const gaugeAddress = parsedEvent.args.gauge
    const epoch = parsedEvent.args.epoch.toString()
    const record = await Models.VoteGauge.findOne({
      memberAddress: voter,
      gaugeAddress,
      pluginAddress: info.address,
      network: info.network,
      epoch,
    })
    if (!record) {
      logNotFound('Reset', info, { voter, gaugeAddress, epoch })
      return
    }
    logValid('Reset', info, { voter, gaugeAddress, epoch })
  },
}
