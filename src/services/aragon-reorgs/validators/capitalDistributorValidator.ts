import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

async function findCampaign(eventName: string, parsedEvent: LogDescription, info: ILogInfo) {
  const campaignId = parsedEvent.args.campaignId.toString()
  const entityId = Models.Campaign.getEntityId({
    pluginAddress: info.address,
    network: info.network,
    campaignId,
  })
  const record = await Models.Campaign.findByEntityId(entityId)
  if (!record) {
    logNotFound(eventName, info, { entityId, campaignId })
  }
  return { record, campaignId, entityId }
}

export const CapitalDistributorValidator = {
  campaignCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record, entityId } = await findCampaign('CampaignCreated', parsedEvent, info)
    if (!record) return
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('CampaignCreated', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('CampaignCreated', info, { entityId })
  },

  payoutClaimed: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const campaignId = parsedEvent.args.campaignId.toString()
    const recipient = parsedEvent.args.recipient
    const entityId = Models.CampaignReward.getEntityId({
      pluginAddress: info.address,
      network: info.network,
      campaignId,
      userAddress: recipient,
    })
    const record = await Models.CampaignReward.findByEntityId(entityId)
    if (!record) {
      logNotFound('PayoutClaimed', info, { entityId, campaignId, recipient })
      return
    }
    logValid('PayoutClaimed', info, { entityId })
  },

  campaignPaused: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record } = await findCampaign('CampaignPaused', parsedEvent, info)
    if (!record) return
    logValid('CampaignPaused', info, { campaignId: parsedEvent.args.campaignId.toString() })
  },

  campaignResumed: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record } = await findCampaign('CampaignResumed', parsedEvent, info)
    if (!record) return
    logValid('CampaignResumed', info, { campaignId: parsedEvent.args.campaignId.toString() })
  },

  campaignEnded: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record } = await findCampaign('CampaignEnded', parsedEvent, info)
    if (!record) return
    logValid('CampaignEnded', info, { campaignId: parsedEvent.args.campaignId.toString() })
  },

  merkleCampaignSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record } = await findCampaign('MerkleCampaignSet', parsedEvent, info)
    if (!record) return
    logValid('MerkleCampaignSet', info, { campaignId: parsedEvent.args.campaignId.toString() })
  },

  merkleCampaignUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { record } = await findCampaign('MerkleCampaignUpdated', parsedEvent, info)
    if (!record) return
    logValid('MerkleCampaignUpdated', info, { campaignId: parsedEvent.args.campaignId.toString() })
  },
}
