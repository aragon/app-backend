import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import { EIP712ActionType } from '@modules/eip712Auth'
import ProviderModule from '@modules/provider'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import {
  CampaignPrepareProgress,
  CampaignPrepareStatus,
  EnumQueueName,
  type HexAddress,
  IPluginInterfaceType,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { getAddress, Wallet } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('Integration: Prepare Campaign Flow', () => {
  let sandbox: SinonSandbox
  let rabbitMQStub: SinonStub

  const network = NetworksEnum.ethereumSepolia
  const chainId = 11155111
  const daoAddress = getAddress('0x1234567890123456789012345678901234567890') as HexAddress
  const multisigPluginAddress = getAddress('0x2222222222222222222222222222222222222222') as HexAddress
  const gaugePluginAddress = getAddress('0x3333333333333333333333333333333333333333') as HexAddress
  const capitalDistributorAddress = getAddress('0x4444444444444444444444444444444444444444') as HexAddress
  const tokenAddress = getAddress('0x5555555555555555555555555555555555555555') as HexAddress
  const epochId = '1'

  const testWallet = Wallet.createRandom()
  const signerAddress = getAddress(testWallet.address) as HexAddress

  const gaugeVoters = [
    {
      memberAddress: getAddress('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B') as HexAddress,
      votingPower: '1000000000000000000',
    },
    {
      memberAddress: getAddress('0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8') as HexAddress,
      votingPower: '2000000000000000000',
    },
    {
      memberAddress: getAddress('0x3c499c542cef5e3811e1192ce70d8cc03d5c3359') as HexAddress,
      votingPower: '3000000000000000000',
    },
  ]

  const totalAmount = '6000000000000000000' // 6 tokens (matching total voting power for easy math)

  const stubRabbitmqSend = () => {
    rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage')
    rabbitMQStub.callsFake(async (queue: string, job: any) => {
      if (queue === EnumQueueName.prepareCampaignFromGauge) {
        await CapitalDistributorGateway.prepareCampaignFromGauge(job.params)
      }
    })
    return rabbitMQStub
  }

  beforeEach(async function () {
    this.timeout(30000)
    sandbox = sinon.createSandbox()

    // Stub ProviderModule.getChainId
    sandbox.stub(ProviderModule, 'getChainId').returns(chainId)

    // Stub RabbitMQ to call gateway directly
    stubRabbitmqSend()

    // Stub Web3Helper methods
    sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
    sandbox.stub(Web3Helper, 'getTokenBalance').resolves('10000000000000000000')

    // Stub GaugeHelper.getGaugeEpochId
    sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(epochId)

    // Create DAO
    await Models.Dao.create({
      id: `${network}-${daoAddress}`,
      network,
      address: daoAddress,
      name: 'Test DAO',
      description: 'Test DAO for Prepare Campaign Flow',
      transactionHash: '0xdao123',
      blockNumber: 100,
      blockTimestamp: 1640995200,
      ensName: 'test-dao.eth',
      creatorAddress: getAddress('0x1111111111111111111111111111111111111111') as HexAddress,
    })

    // Create Multisig Plugin
    await Models.Plugin.create({
      id: `${network}-${multisigPluginAddress}-0`,
      address: multisigPluginAddress,
      network,
      transactionHash: '0xmultisig123',
      blockNumber: 101,
      status: 'installed',
      interfaceType: IPluginInterfaceType.multisig,
      daoAddress,
      isSupported: true,
    })

    // Create Plugin Member (the signer)
    await Models.PluginMember.create({
      id: `${network}-${multisigPluginAddress}-${signerAddress}`,
      network,
      pluginAddress: multisigPluginAddress,
      memberAddress: signerAddress,
      daoAddress,
      pluginInterfaceType: IPluginInterfaceType.multisig,
    })

    // Create Gauge Plugin
    await Models.Plugin.create({
      id: `${network}-${gaugePluginAddress}-0`,
      address: gaugePluginAddress,
      network,
      transactionHash: '0xgauge123',
      blockNumber: 102,
      status: 'installed',
      interfaceType: IPluginInterfaceType.gauge,
      daoAddress,
      isSupported: true,
    })

    // Create Capital Distributor Plugin
    await Models.Plugin.create({
      id: `${network}-${capitalDistributorAddress}-0`,
      address: capitalDistributorAddress,
      network,
      transactionHash: '0xcapital123',
      blockNumber: 103,
      status: 'installed',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      daoAddress,
      isSupported: true,
    })

    // Create VoteGauge records for epoch votes
    for (let i = 0; i < gaugeVoters.length; i++) {
      const voter = gaugeVoters[i]
      await Models.VoteGauge.create({
        id: `${network}-${gaugePluginAddress}-${epochId}-${voter.memberAddress}`,
        network,
        pluginAddress: gaugePluginAddress,
        epochId,
        memberAddress: voter.memberAddress,
        votingPower: voter.votingPower,
        gaugeAddress: getAddress('0x6666666666666666666666666666666666666666'),
        transactionHash: `0xvote${voter.memberAddress.slice(-6)}`,
        blockNumber: 110,
        blockTimestamp: 1640995300,
        logIndex: i,
        transactionIndex: i,
        resetVoteTransactionHash: null,
      })
    }
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should complete the full prepare campaign flow from frontend to database', async function () {
    this.timeout(60000)

    // Step 1: Frontend calls getPrepareMessage to get EIP-712 typed data
    const prepareMessageResult = await CapitalDistributorController.getPrepareMessage({
      daoAddress,
      network,
    })

    expect(prepareMessageResult.typedData).to.exist
    expect(prepareMessageResult.nonce).to.be.a('string')
    expect(prepareMessageResult.expiresAt).to.be.a('number')
    expect(prepareMessageResult.typedData.domain.chainId).to.equal(chainId)
    expect(prepareMessageResult.typedData.message.action).to.equal(EIP712ActionType.prepareCampaign)
    expect(prepareMessageResult.typedData.message.daoAddress).to.equal(daoAddress)

    // Step 2: Frontend signs the message with wallet
    const { typedData } = prepareMessageResult
    const signature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

    expect(signature).to.be.a('string')
    expect(signature).to.have.length.greaterThan(0)

    // Step 3: Frontend calls prepareCampaignFromGauge with signature
    // Note: RabbitMQ stub will directly call the gateway handler
    const prepareResult = await CapitalDistributorController.prepareCampaignFromGauge({
      daoAddress,
      network,
      gaugePluginAddress,
      capitalDistributorAddress,
      tokenAddress,
      totalAmount,
      metadataUri: 'ipfs://QmTestCampaignMetadata',
      nonce: prepareMessageResult.nonce,
      signature,
    })

    expect(prepareResult.prepareId).to.be.a('string')
    expect(prepareResult.status).to.equal(CampaignPrepareStatus.pending)

    // Step 4: Verify RabbitMQ was called with correct queue
    expect(rabbitMQStub.calledOnce).to.be.true
    expect(rabbitMQStub.firstCall.args[0]).to.equal(EnumQueueName.prepareCampaignFromGauge)

    // Step 5: Verify CampaignPrepare is now completed (gateway was called by stub)
    const completedPrepare = await Models.CampaignPrepare.findByPrepareId(prepareResult.prepareId)
    expect(completedPrepare).to.exist
    expect(completedPrepare.status).to.equal(CampaignPrepareStatus.completed)
    expect(completedPrepare.progress).to.equal(CampaignPrepareProgress.done)
    expect(completedPrepare.merkleRoot).to.be.a('string')
    expect(completedPrepare.merkleRoot).to.have.length.greaterThan(0)
    expect(completedPrepare.totalMembers).to.equal(3)
    expect(completedPrepare.epochId).to.equal(epochId)

    // Step 6: Verify CampaignReward records were created with proofs
    const campaignRewards = await Models.CampaignReward.find({
      pluginAddress: capitalDistributorAddress,
      network,
      campaignId: '0',
    }).sort({ index: 1 })

    expect(campaignRewards).to.have.lengthOf(3)

    for (const reward of campaignRewards) {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      expect(reward.leaf).to.be.a('string')
      expect(reward.leaf).to.have.length.greaterThan(0)
    }

    // Verify reward amounts are proportional to voting power
    const voter1Reward = campaignRewards.find(r => r.userAddress === gaugeVoters[0].memberAddress)
    const voter2Reward = campaignRewards.find(r => r.userAddress === gaugeVoters[1].memberAddress)
    const voter3Reward = campaignRewards.find(r => r.userAddress === gaugeVoters[2].memberAddress)

    expect(voter1Reward).to.exist
    expect(voter1Reward.amount).to.equal('1000000000000000000')

    expect(voter2Reward).to.exist
    expect(voter2Reward.amount).to.equal('2000000000000000000')

    expect(voter3Reward).to.exist
    expect(voter3Reward.amount).to.equal('3000000000000000000')

    // Step 7: Verify CampaignMerkleRoot was created
    const campaignMerkleRoot = await Models.CampaignMerkleRoot.findByParams(capitalDistributorAddress, network, '0')

    expect(campaignMerkleRoot).to.exist
    expect(campaignMerkleRoot.merkleRoot).to.equal(completedPrepare.merkleRoot)
    expect(campaignMerkleRoot.totalMembers).to.equal(3)

    // Step 8: Test getPrepareStatus endpoint
    const statusResult = await CapitalDistributorController.getPrepareStatus(prepareResult.prepareId)

    expect(statusResult.prepareId).to.equal(prepareResult.prepareId)
    expect(statusResult.status).to.equal(CampaignPrepareStatus.completed)
    expect(statusResult.progress).to.equal(CampaignPrepareProgress.done)
    expect(statusResult.merkleRoot).to.equal(completedPrepare.merkleRoot)
    expect(statusResult.totalMembers).to.equal(3)
    expect(statusResult.daoAddress).to.equal(daoAddress)
    expect(statusResult.network).to.equal(network)
  })

  it('should reject prepare with invalid signature (non-multisig member)', async function () {
    this.timeout(30000)

    const prepareMessageResult = await CapitalDistributorController.getPrepareMessage({
      daoAddress,
      network,
    })

    // Sign with a different wallet (not a multisig member)
    const wrongWallet = Wallet.createRandom()
    const { typedData } = prepareMessageResult
    const wrongSignature = await wrongWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

    try {
      await CapitalDistributorController.prepareCampaignFromGauge({
        daoAddress,
        network,
        gaugePluginAddress,
        capitalDistributorAddress,
        tokenAddress,
        totalAmount,
        metadataUri: 'ipfs://QmTestCampaignMetadata',
        nonce: prepareMessageResult.nonce,
        signature: wrongSignature,
      })
      expect.fail('Should have thrown unauthorized error')
    } catch (error: any) {
      expect(error.message).to.equal('unauthorized')
    }
  })

  it('should reject prepare with reused nonce', async function () {
    this.timeout(30000)

    const prepareMessageResult = await CapitalDistributorController.getPrepareMessage({
      daoAddress,
      network,
    })

    const { typedData } = prepareMessageResult
    const signature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

    // First call should succeed
    const firstResult = await CapitalDistributorController.prepareCampaignFromGauge({
      daoAddress,
      network,
      gaugePluginAddress,
      capitalDistributorAddress,
      tokenAddress,
      totalAmount,
      metadataUri: 'ipfs://QmTestCampaignMetadata',
      nonce: prepareMessageResult.nonce,
      signature,
    })

    expect(firstResult.prepareId).to.be.a('string')

    // Second call with same nonce should fail
    try {
      await CapitalDistributorController.prepareCampaignFromGauge({
        daoAddress,
        network,
        gaugePluginAddress,
        capitalDistributorAddress,
        tokenAddress,
        totalAmount,
        metadataUri: 'ipfs://QmTestCampaignMetadata',
        nonce: prepareMessageResult.nonce,
        signature,
      })
      expect.fail('Should have thrown unauthorized error for reused nonce')
    } catch (error: any) {
      expect(error.message).to.equal('unauthorized')
    }
  })

  it('should fail gateway processing when no gauge votes exist', async function () {
    this.timeout(30000)

    // Stub RabbitMQ to NOT call gateway (we'll call it manually after setup)
    rabbitMQStub.restore()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    // Remove all gauge votes
    await Models.VoteGauge.deleteMany({ pluginAddress: gaugePluginAddress, network })

    const prepareMessageResult = await CapitalDistributorController.getPrepareMessage({
      daoAddress,
      network,
    })

    const { typedData } = prepareMessageResult
    const signature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

    const prepareResult = await CapitalDistributorController.prepareCampaignFromGauge({
      daoAddress,
      network,
      gaugePluginAddress,
      capitalDistributorAddress,
      tokenAddress,
      totalAmount,
      metadataUri: 'ipfs://QmTestCampaignMetadata',
      nonce: prepareMessageResult.nonce,
      signature,
    })

    // Manually call gateway handler
    await CapitalDistributorGateway.prepareCampaignFromGauge({
      prepareId: prepareResult.prepareId,
    })

    const failedPrepare = await Models.CampaignPrepare.findByPrepareId(prepareResult.prepareId)
    expect(failedPrepare).to.exist
    expect(failedPrepare.status).to.equal(CampaignPrepareStatus.failed)
  })

  it('should fail gateway processing when token balance is insufficient', async function () {
    this.timeout(30000)

    // Stub RabbitMQ to NOT call gateway
    rabbitMQStub.restore()
    sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .resolves()

    // Re-stub with insufficient balance
    ;(Web3Helper.getTokenBalance as SinonStub).restore()
    sandbox.stub(Web3Helper, 'getTokenBalance').resolves('1000000000000000000') // Only 1 token

    const prepareMessageResult = await CapitalDistributorController.getPrepareMessage({
      daoAddress,
      network,
    })

    const { typedData } = prepareMessageResult
    const signature = await testWallet.signTypedData(typedData.domain, typedData.types, typedData.message)

    const prepareResult = await CapitalDistributorController.prepareCampaignFromGauge({
      daoAddress,
      network,
      gaugePluginAddress,
      capitalDistributorAddress,
      tokenAddress,
      totalAmount, // Requesting 6 tokens but only 1 available
      metadataUri: 'ipfs://QmTestCampaignMetadata',
      nonce: prepareMessageResult.nonce,
      signature,
    })

    // Manually call gateway handler
    await CapitalDistributorGateway.prepareCampaignFromGauge({
      prepareId: prepareResult.prepareId,
    })

    const failedPrepare = await Models.CampaignPrepare.findByPrepareId(prepareResult.prepareId)
    expect(failedPrepare).to.exist
    expect(failedPrepare.status).to.equal(CampaignPrepareStatus.failed)
  })
})
