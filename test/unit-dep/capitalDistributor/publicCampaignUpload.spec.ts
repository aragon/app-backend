import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import { CapitalDistributorHandler } from '@handlers/capitalDistributorHandler'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integration: Public Campaign Upload Flow', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const pluginAddress = '0x5dA61302D0d08d80D39f015b75595052fD4CdD06' as HexAddress
  const multisigAddress = '0xABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD' as HexAddress
  const userAddress = '0x17366cae2b9c6C3055e9e3C78936a69006BE5409' as HexAddress
  const tokenAddress = '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357' as HexAddress
  const allocationStrategyAddress = '0x9876543210987654321098765432109876543210' as HexAddress

  const WALLET_COUNT = 1000

  let rewards: Array<{ address: string; amount: string }>

  beforeEach(function () {
    this.timeout(100000000)
    sandbox = sinon.createSandbox()

    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(LogCampaignStrategy, 'start').resolves()
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1640995200)
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves(null)
    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

    rewards = []
    for (let i = 0; i < WALLET_COUNT; i++) {
      const wallet = ethers.Wallet.createRandom()
      rewards.push({ address: wallet.address, amount: String((i + 1) * 100) })
    }
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle public campaign upload with draft reconciliation and claims', async function () {
    // Setup: Create DAO, Plugin, PluginMember
    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      network,
      address: daoAddress,
      name: 'Test DAO',
      description: 'Test DAO for Public Upload',
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
      blockNumber: 101,
      status: 'installed',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      daoAddress,
      isSupported: true,
    })

    await Models.PluginMember.create({
      memberAddress: userAddress,
      pluginAddress: multisigAddress,
      network,
      daoAddress,
    })

    // Step 1: Public upload via controller
    const uploadResult = await CapitalDistributorController.uploadCampaignMembers({
      daoAddress,
      userAddress,
      multisigAddress,
      capitalDistributorAddress: pluginAddress,
      network,
      rewards,
    })

    expect(uploadResult.success).to.be.true
    expect(uploadResult.totalInserted).to.equal(WALLET_COUNT)
    expect(uploadResult.campaignId).to.be.a('string')

    const draftCampaignId = uploadResult.campaignId

    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).calledOnce).to.be.true
    const sendMessageCall = (RabbitMQHelper.sendMessage as sinon.SinonStub).getCall(0)
    expect(sendMessageCall.args[1].params.isDraft).to.be.true

    // Step 2: Verify draft rewards in DB
    const draftRewards = await Models.CampaignReward.find({ campaignId: draftCampaignId })
    expect(draftRewards).to.have.lengthOf(WALLET_COUNT)

    const spotCheck = draftRewards.find(r => r.userAddress === rewards[0].address)
    expect(spotCheck).to.exist
    expect(spotCheck.amount).to.equal(rewards[0].amount)

    // Step 3: Merkle generation (call gateway directly)
    await CapitalDistributorGateway.generateMerkleData({
      campaignId: draftCampaignId,
      pluginAddress,
      network,
      isDraft: true,
    })

    const rewardsAfterMerkle = await Models.CampaignReward.find({ campaignId: draftCampaignId })
    expect(rewardsAfterMerkle).to.have.lengthOf(WALLET_COUNT)
    rewardsAfterMerkle.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
    })

    const draftMerkleRoot = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, draftCampaignId)
    expect(draftMerkleRoot).to.exist
    expect(draftMerkleRoot.isDraft).to.be.true
    expect(draftMerkleRoot.merkleRoot).to.be.a('string')

    const merkleRootValue = draftMerkleRoot.merkleRoot

    // Step 4: Check prepare status via controller
    const prepareStatus = await CapitalDistributorController.getCampaignPrepareStatus({
      capitalDistributorAddress: pluginAddress,
      network,
      campaignId: draftCampaignId,
    })

    expect(prepareStatus).to.exist
    expect(prepareStatus!.merkleRoot).to.equal(merkleRootValue)
    expect(prepareStatus!.totalMembers).to.equal(WALLET_COUNT)

    // Step 5: Simulate on-chain campaign creation
    const campaignCreationEvent = {
      args: {
        campaignId: BigInt(1),
        metadataUri: '0x',
        allocationStrategy: allocationStrategyAddress,
        token: tokenAddress,
        actionEncoder: '0xB1c86a33E6417aB8E96c8Bec61AF9A42D0b4f5B2',
        startTime: BigInt(1640995200),
        endTime: BigInt(1672531200),
      },
    } as any

    const logInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xcampaign123',
      blockNumber: 102,
      blockTimestamp: 1640995300,
    }

    await CapitalDistributorHandler.campaignCreated(campaignCreationEvent, logInfo as any)

    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, '1')
    expect(campaign).to.exist
    expect(campaign.active).to.be.true

    // Step 6: Simulate MerkleCampaignSet → triggers reconciliation
    const merkleCampaignSetEvent = {
      args: {
        campaignId: BigInt(1),
        merkleRoot: merkleRootValue,
      },
    } as any

    const merkleLogInfo = {
      address: allocationStrategyAddress,
      network,
      transactionHash: '0xmerkle123',
      blockNumber: 103,
      blockTimestamp: 1640995400,
    }

    await CapitalDistributorHandler.merkleCampaignSet(merkleCampaignSetEvent, merkleLogInfo as any)

    // Step 7: Verify reconciliation
    const reconciledRewards = await Models.CampaignReward.find({ campaignId: '1' })
    expect(reconciledRewards).to.have.lengthOf(WALLET_COUNT)

    const orphanedRewards = await Models.CampaignReward.find({ campaignId: draftCampaignId })
    expect(orphanedRewards).to.have.lengthOf(0)

    const reconciledMerkle = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, '1')
    expect(reconciledMerkle).to.exist
    expect(reconciledMerkle.isDraft).to.be.false

    const updatedCampaign = await Models.Campaign.findCampaignById(pluginAddress, network, '1')
    expect(updatedCampaign.merkleRoot).to.equal(merkleRootValue)

    const expectedTotal = rewards.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)).toString()
    expect(updatedCampaign.totalRewards).to.equal(expectedTotal)

    // Step 8: Simulate claims (3 random users)
    const claimUsers = [rewards[0], rewards[500], rewards[999]]
    for (let i = 0; i < claimUsers.length; i++) {
      const claimEvent = {
        args: {
          campaignId: BigInt(1),
          recipient: claimUsers[i].address,
          amount: BigInt(claimUsers[i].amount),
          totalClaimed: BigInt(claimUsers[i].amount),
        },
      } as any

      const claimLogInfo = {
        address: pluginAddress,
        network,
        transactionHash: `0xclaim${i}`,
        blockNumber: 104 + i,
        blockTimestamp: 1640995500 + i,
      }

      await CapitalDistributorHandler.payoutClaimed(claimEvent, claimLogInfo as any)
    }

    for (const claimUser of claimUsers) {
      const reward = await Models.CampaignReward.findRewardForCampaign(
        pluginAddress,
        network,
        '1',
        claimUser.address as HexAddress,
      )
      expect(reward.totalClaimed).to.equal(claimUser.amount)
      expect(reward.claims).to.have.lengthOf(1)
      expect(reward.claims[0].claimedAmount).to.equal(claimUser.amount)
    }

    // Step 9: Final state via API controllers
    const user0Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: claimUsers[0].address as HexAddress,
      campaignId: '1',
    })
    expect(user0Reward.exists).to.be.true
    expect(user0Reward.amount).to.equal(claimUsers[0].amount)
    expect(user0Reward.totalClaimed).to.equal(claimUsers[0].amount)
    expect(user0Reward.isFullyClaimed).to.be.true

    const user0Status = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      claimUsers[0].address as HexAddress,
    )
    expect(user0Status.totalClaimed).to.equal(claimUsers[0].amount)
    expect(user0Status.totalClaimable).to.equal('0')

    const campaignsPaginated = await CapitalDistributorController.getCampaignsWithPagination(
      { page: 1, pageSize: 10 },
      { pluginAddress, network },
    )
    expect(campaignsPaginated.data).to.have.lengthOf(1)
    expect(campaignsPaginated.data[0].campaignId).to.equal('1')
  })
})

describe('Integration: Public Campaign Upload with On-Chain Sync', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x6f38f0F26dECa2527a7F6669Fcb7e13F66840901' as HexAddress
  const pluginAddress = '0x8CfE7A05Fc1b4e39f913B2a0CA6B4B22e4E89a53' as HexAddress
  const multisigAddress = '0xABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD' as HexAddress
  const userAddress = '0x17366cae2b9c6C3055e9e3C78936a69006BE5409' as HexAddress

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
  ]

  beforeEach(function () {
    this.timeout(100000000)
    sandbox = sinon.createSandbox()

    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle public upload + real on-chain sync with draft reconciliation', async function () {
    this.timeout(100000000)

    // Step 1: Create DAO, Plugin, PluginMember fixtures
    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      network,
      address: daoAddress,
      name: 'Test DAO',
      description: 'Test DAO for Public On-Chain Sync',
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

    await Models.PluginMember.create({
      memberAddress: userAddress,
      pluginAddress: multisigAddress,
      network,
      daoAddress,
    })

    // Step 2: Public upload → draft UUID campaignId
    const uploadResult = await CapitalDistributorController.uploadCampaignMembers({
      daoAddress,
      userAddress,
      multisigAddress,
      capitalDistributorAddress: pluginAddress,
      network,
      rewards,
    })

    expect(uploadResult.success).to.be.true
    expect(uploadResult.totalInserted).to.equal(12)
    expect(uploadResult.campaignId).to.be.a('string')

    const draftCampaignId = uploadResult.campaignId

    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).calledOnce).to.be.true
    const sendMessageCall = (RabbitMQHelper.sendMessage as sinon.SinonStub).getCall(0)
    expect(sendMessageCall.args[1].params.isDraft).to.be.true

    // Step 3: Generate merkle data (isDraft: true)
    await CapitalDistributorGateway.generateMerkleData({
      campaignId: draftCampaignId,
      pluginAddress,
      network,
      isDraft: true,
    })

    const rewardsAfterMerkle = await Models.CampaignReward.find({ campaignId: draftCampaignId })
    expect(rewardsAfterMerkle).to.have.lengthOf(12)
    rewardsAfterMerkle.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
    })

    const draftMerkleRoot = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, draftCampaignId)
    expect(draftMerkleRoot).to.exist
    expect(draftMerkleRoot.isDraft).to.be.true
    expect(draftMerkleRoot.merkleRoot).to.be.a('string')

    const merkleRootValue = draftMerkleRoot.merkleRoot

    // Step 4: Check prepare status
    const prepareStatus = await CapitalDistributorController.getCampaignPrepareStatus({
      capitalDistributorAddress: pluginAddress,
      network,
      campaignId: draftCampaignId,
    })

    expect(prepareStatus).to.exist
    expect(prepareStatus!.merkleRoot).to.equal(merkleRootValue)
    expect(prepareStatus!.totalMembers).to.equal(12)

    // Step 5: Sync first batch of real on-chain events (campaign 0 + PayoutClaimed)
    await LibUtils.handleEventsFromTxHashes(txHashes, network)

    // Step 6: Adjust configIndexer lastSync so campaign 1 events get picked up
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

    // Step 7: Sync last tx (CampaignCreated(1) + MerkleCampaignSet(1)) → triggers reconciliation
    await LibUtils.handleEventsFromTxHashes(
      ['0xd2abc779cdc075ed36b89514d2bb8fa679bee15a57b1fff6a79ce03f25bb20db'],
      network,
    )

    // Step 8: Verify reconciliation — draft rewards moved to real campaignId "1"
    const reconciledRewards = await Models.CampaignReward.find({ pluginAddress, network, campaignId: '1' })
    expect(reconciledRewards).to.have.lengthOf(12)

    const orphanedRewards = await Models.CampaignReward.find({ campaignId: draftCampaignId })
    expect(orphanedRewards).to.have.lengthOf(0)

    reconciledRewards.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
      expect(reward.amount).to.equal('10000000000000000000000')
    })

    // Step 9: Verify merkle root reconciled
    const reconciledMerkle = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, '1')
    expect(reconciledMerkle).to.exist
    expect(reconciledMerkle.isDraft).to.be.false
    expect(reconciledMerkle.merkleRoot).to.equal(merkleRootValue)

    // Step 10: Verify campaign record
    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, '1')
    expect(campaign).to.exist
    expect(campaign.active).to.be.true
    expect(campaign.merkleRoot).to.equal(merkleRootValue)

    const expectedTotal = rewards.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)).toString()
    expect(campaign.totalRewards).to.equal(expectedTotal)

    // Step 11: Public API controllers
    const user0Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: rewards[0].address as HexAddress,
      campaignId: '1',
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
    expect(campaignsPaginated.data[0].campaignId).to.equal('1')
    expect(campaignsPaginated.data[0].active).to.be.true
  })
})
