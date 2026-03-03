import { Models } from '@dbModels'
import { CapitalDistributorAdminController } from '@services/aragon-admin-api/controllers/capitalDistributor'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ConfigIndexerHelper from '@helpers/configIndexer'
import CapitalDistributorController from '@src/services/aragon-api/controllers/capitalDistributor'

describe('Integration: Admin Campaign Lifecycle (real on-chain sync)', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x6f38f0F26dECa2527a7F6669Fcb7e13F66840901' as HexAddress
  const pluginAddress = '0x8CfE7A05Fc1b4e39f913B2a0CA6B4B22e4E89a53' as HexAddress
  const campaignId = '1'

  const rewards: Array<{ address: string; amount: string }> = [
    { address: '0xbAcc0DbDbBDbDd47cC7712bBd32D592227133071', amount: '10000000000000000000000' },
    { address: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759', amount: '10000000000000000000000' },
    { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '10000000000000000000000' },
    { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', amount: '10000000000000000000000' },
    { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', amount: '10000000000000000000000' },
    { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: '10000000000000000000000' },
    { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', amount: '10000000000000000000000' },
    { address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', amount: '10000000000000000000000' },
    { address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9', amount: '10000000000000000000000' },
    { address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955', amount: '10000000000000000000000' },
    { address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', amount: '10000000000000000000000' },
    { address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720', amount: '10000000000000000000000' },
  ]

  // On-chain tx hashes in block order (sepolia)
  const txHashes = [
    '0xabf5289c7a6e9f4bc1b59f3d41710470e50445453b7eae08c5afad82bda1f0f1', // CampaignCreated(0) + MerkleCampaignSet(0)
    '0x9b8171b035c616fd3642567abb1d4846ac68de7b8968092a5c29cb7322a9d148', // PayoutClaimed(0)
    // '0xd2abc779cdc075ed36b89514d2bb8fa679bee15a57b1fff6a79ce03f25bb20db', // CampaignCreated(1) + MerkleCampaignSet(1)
  ]

  beforeEach(function () {
    this.timeout(100000000)
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle admin upload + real on-chain events via tx hashes', async function () {
    this.timeout(100000000)

    // Step 1: Create DAO and Plugin fixtures
    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      network,
      address: daoAddress,
      name: 'Test DAO',
      description: 'Test DAO for Admin Lifecycle',
      transactionHash: '0xdao123',
      blockNumber: 100,
      blockTimestamp: 1640995200,
      ensName: 'test-dao.eth',
      creatorAddress: '0x1111111111111111111111111111111111111111' as HexAddress,
    })

    await Models.Plugin.create({
      id: `${network}-${pluginAddress}-0`,
      address: pluginAddress,
      network,
      transactionHash: '0xplugin123',
      blockNumber: 10141611,
      status: 'installed',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      daoAddress,
      isSupported: true,
    })

    // Step 2: Admin uploads member list
    const uploadResult = await CapitalDistributorAdminController.uploadMembersList({
      campaignId,
      pluginAddress,
      network,
      rewards,
    })

    expect(uploadResult.success).to.be.true
    expect(uploadResult.totalInserted).to.equal(12)

    // Step 3: Generate merkle data via gateway
    await CapitalDistributorGateway.generateMerkleData({
      campaignId,
      pluginAddress,
      network,
    })

    const rewardsAfterMerkle = await Models.CampaignReward.find({ pluginAddress, network, campaignId })
    expect(rewardsAfterMerkle).to.have.lengthOf(12)
    rewardsAfterMerkle.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
    })

    const merkleRoot = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, campaignId)
    expect(merkleRoot).to.exist
    expect(merkleRoot.merkleRoot).to.be.a('string')
    expect(merkleRoot.totalMembers).to.equal(12)

    const merkleRootValue = merkleRoot.merkleRoot

    // Step 4: Process real on-chain events via tx hashes
    await LibUtils.handleEventsFromTxHashes(txHashes, network)

    const configIndexerServiceName = ConfigIndexerHelper.builders.campaignAllocationStrategy(
      NetworksEnum.ethereumSepolia,
      '0x624B8E10e84ae73eB302A89772d8f3f20c230fad',
    )

    const allocationStrat = await Models.ConfigIndexer.findOne({
      service: configIndexerServiceName,
    })

    expect(allocationStrat).to.exist
    allocationStrat.lastSync = 10142781
    await allocationStrat.save()

    await LibUtils.handleEventsFromTxHashes(
      ['0xd2abc779cdc075ed36b89514d2bb8fa679bee15a57b1fff6a79ce03f25bb20db'],
      network,
    )

    // Step 5: Verify campaign 1 was created and merkle root set
    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(campaign).to.exist
    expect(campaign.active).to.be.true
    expect(campaign.campaignId).to.equal(campaignId)
    expect(campaign.merkleRoot).to.be.a('string')

    const expectedTotal = rewards.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)).toString()
    expect(campaign.totalRewards).to.equal(expectedTotal)

    // Step 6: Verify all 12 rewards intact with proofs
    const finalRewards = await Models.CampaignReward.find({ pluginAddress, network, campaignId })
    expect(finalRewards).to.have.lengthOf(12)
    finalRewards.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
      expect(reward.amount).to.equal('10000000000000000000000')
    })

    // Step 7: Verify merkle root record
    const finalMerkleRoot = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, campaignId)
    expect(finalMerkleRoot).to.exist
    expect(finalMerkleRoot.merkleRoot).to.equal(merkleRootValue)

    // Step 8: Admin campaign details
    const details = await CapitalDistributorAdminController.getCampaignDetails({
      campaignId,
      pluginAddress,
      network,
    })
    expect(details.totalMembers).to.equal(12)
    expect(details.merkleRoot).to.equal(merkleRootValue)

    // Step 9: Public API controllers
    const user0Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: rewards[0].address as HexAddress,
      campaignId,
    })
    expect(user0Reward.exists).to.be.true
    expect(user0Reward.amount).to.equal('10000000000000000000000')
    expect(user0Reward.totalClaimed).to.equal('0')
    expect(user0Reward.isFullyClaimed).to.be.false

    const user1Status = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      rewards[1].address as HexAddress,
    )
    expect(user1Status.totalClaimed).to.equal('0')
    expect(user1Status.totalClaimable).to.equal('10000000000000000000000')

    const campaignsPaginated = await CapitalDistributorController.getCampaignsWithPagination(
      { page: 1, pageSize: 10 },
      { pluginAddress, network, userAddress: rewards[1].address as HexAddress },
    )
    expect(campaignsPaginated.data).to.have.lengthOf(1)
    expect(campaignsPaginated.data[0].campaignId).to.equal(campaignId)
    expect(campaignsPaginated.data[0].active).to.be.true
  })
})
