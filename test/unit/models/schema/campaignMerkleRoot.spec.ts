import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { HexAddress, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import CampaignMerkleRoot from '@models/schema/campaignMerkleRoot'

describe('Model: CampaignMerkleRoot', () => {
  let sandbox: SinonSandbox
  let rawCampaignMerkleRoot: Partial<CampaignMerkleRoot>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawCampaignMerkleRoot = {
      pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
      network: NetworksEnum.ethereumMainnet,
      campaignId: 'campaign-001',
      merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      totalMembers: 100,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create CampaignMerkleRoot', async () => {
    const entityId = Models.CampaignMerkleRoot.getEntityId({
      pluginAddress: rawCampaignMerkleRoot.pluginAddress!,
      network: rawCampaignMerkleRoot.network!,
      campaignId: rawCampaignMerkleRoot.campaignId!,
    })
    const created = await Models.CampaignMerkleRoot.create(rawCampaignMerkleRoot)

    expect(created.id).to.eq(entityId)
    expect(created.pluginAddress).to.eq(rawCampaignMerkleRoot.pluginAddress)
    expect(created.network).to.eq(rawCampaignMerkleRoot.network)
    expect(created.campaignId).to.eq(rawCampaignMerkleRoot.campaignId)
    expect(created.merkleRoot).to.eq(rawCampaignMerkleRoot.merkleRoot)
    expect(created.totalMembers).to.eq(rawCampaignMerkleRoot.totalMembers)
  })

  it('Should getEntityId', async () => {
    const pluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
    const network = NetworksEnum.ethereumMainnet
    const campaignId = 'campaign-001'
    const entityId = Models.CampaignMerkleRoot.getEntityId({ pluginAddress, network, campaignId })
    expect(entityId).to.eq(`${pluginAddress}-${network}-${campaignId}`)
  })

  it('Should findByParams', async () => {
    const created = await Models.CampaignMerkleRoot.create(rawCampaignMerkleRoot)
    const found = await Models.CampaignMerkleRoot.findByParams(
      rawCampaignMerkleRoot.pluginAddress as HexAddress,
      rawCampaignMerkleRoot.network as NetworksEnum,
      rawCampaignMerkleRoot.campaignId!,
    )
    expect(found?.id).to.eq(created.id)
  })

  it('Should update CampaignMerkleRoot', async () => {
    const created = await Models.CampaignMerkleRoot.create(rawCampaignMerkleRoot)
    expect(created.totalMembers).to.eq(rawCampaignMerkleRoot.totalMembers)

    await created.update({
      totalMembers: 200,
    })

    await created.reload()
    expect(created.totalMembers).to.eq(200)
  })

  it('Should create with auto-generated id when id is not provided', async () => {
    const created = await Models.CampaignMerkleRoot.create(rawCampaignMerkleRoot)
    const expectedId = Models.CampaignMerkleRoot.getEntityId({
      pluginAddress: rawCampaignMerkleRoot.pluginAddress!,
      network: rawCampaignMerkleRoot.network!,
      campaignId: rawCampaignMerkleRoot.campaignId!,
    })
    expect(created.id).to.eq(expectedId)
  })

  it('Should use provided id when creating', async () => {
    const customId = 'custom-id-123'
    const created = await Models.CampaignMerkleRoot.create({
      ...rawCampaignMerkleRoot,
      id: customId,
    })
    expect(created.id).to.eq(customId)
  })

  it('Should default totalMembers to 0', async () => {
    const dataWithoutTotalMembers = {
      ...rawCampaignMerkleRoot,
    }
    delete dataWithoutTotalMembers.totalMembers

    const created = await Models.CampaignMerkleRoot.create(dataWithoutTotalMembers)
    expect(created.totalMembers).to.eq(0)
  })
})
