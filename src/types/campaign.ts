export interface ICampaignUploadResult {
  success: boolean
  message: string
  totalInserted: number
  totalUpdated: number
  totalDeleted: number
  totalProcessed: number
  campaignId: string
}

export interface ICampaignPrepareStatus {
  campaignId: string
  pluginAddress: string
  network: string
  merkleRoot: string | null
  totalMembers: number
}
