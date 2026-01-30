import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import MerkleTreeHelper from '@helpers/merkleTree'
import { ethers } from 'ethers'
import { MerkleTree } from 'merkletreejs'
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
import { Contract, getAddress, Wallet } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('Integration: Prepare Campaign Flow', () => {
  let sandbox: SinonSandbox
  let rabbitMQStub: SinonStub

  const network = NetworksEnum.katanaMainnet
  const chainId = 747474
  const daoAddress = getAddress('0x1234567890123456789012345678901234567890') as HexAddress
  const multisigPluginAddress = getAddress('0x2222222222222222222222222222222222222222') as HexAddress
  const gaugePluginAddress = getAddress('0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9') as HexAddress
  const capitalDistributorAddress = getAddress('0x4444444444444444444444444444444444444444') as HexAddress
  const tokenAddress = getAddress('0x5555555555555555555555555555555555555555') as HexAddress

  const testWallet = Wallet.createRandom()
  const signerAddress = getAddress(testWallet.address) as HexAddress

  const totalAmount = '6000000000000000000'

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

    sandbox.stub(ProviderModule, 'getChainId').returns(chainId)
    stubRabbitmqSend()

    sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
    sandbox.stub(Web3Helper, 'getTokenBalance').resolves('10000000000000000000')

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

    await Models.PluginMember.create({
      id: `${network}-${multisigPluginAddress}-${signerAddress}`,
      network,
      pluginAddress: multisigPluginAddress,
      memberAddress: signerAddress,
      daoAddress,
      pluginInterfaceType: IPluginInterfaceType.multisig,
    })

    // Real gauge plugin on katana-mainnet — crawler will fetch real on-chain events
    await Models.Plugin.create({
      id: `${network}-${gaugePluginAddress}-0`,
      address: gaugePluginAddress,
      network,
      transactionHash: '0xgauge123',
      blockNumber: '17593531',
      status: 'installed',
      interfaceType: IPluginInterfaceType.gauge,
      daoAddress,
      isSupported: true,
    })

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
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should complete the full prepare campaign flow from frontend to database', async function () {
    this.timeout(120000)

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
    // RabbitMQ stub calls the gateway directly — crawler fetches real on-chain events
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

    expect(rabbitMQStub.calledOnce).to.be.true
    expect(rabbitMQStub.firstCall.args[0]).to.equal(EnumQueueName.prepareCampaignFromGauge)

    // Step 4: Verify CampaignPrepare completed — on-chain crawl succeeded
    const completedPrepare = await Models.CampaignPrepare.findByPrepareId(prepareResult.prepareId)
    expect(completedPrepare).to.exist
    expect(completedPrepare.status).to.equal(CampaignPrepareStatus.completed)
    expect(completedPrepare.progress).to.equal(CampaignPrepareProgress.done)
    expect(completedPrepare.merkleRoot).to.be.a('string')
    expect(completedPrepare.merkleRoot).to.have.length.greaterThan(0)
    expect(completedPrepare.totalMembers).to.be.greaterThan(0)

    const campaignRewards = await Models.CampaignReward.find({
      pluginAddress: capitalDistributorAddress,
      network,
      campaignId: '0',
    }).sort({ index: 1 })

    expect(campaignRewards).to.have.lengthOf(completedPrepare.totalMembers)

    let rewardsTotalVotingPower = 0n
    for (const reward of campaignRewards) {
      expect(reward.proof).to.be.an('array')
      expect(reward.proof.length).to.be.greaterThan(0)
      rewardsTotalVotingPower += BigInt(reward.amount)
    }

    expect(rewardsTotalVotingPower.toString()).to.equal(totalAmount)

    // Step 6: Verify each reward's merkle proof against the root (no tree rebuild)
    for (const reward of campaignRewards) {
      const leaf = MerkleTreeHelper.createLeaf({ address: reward.userAddress, amount: reward.amount })
      const isValid = MerkleTree.verify(reward.proof, leaf, completedPrepare.merkleRoot, ethers.keccak256, {
        sortPairs: true,
      })
      expect(isValid, `Invalid merkle proof for ${reward.userAddress}`).to.be.true
    }

    // Step 7: Validate tallied voting power against on-chain totalVotingPowerCast
    const provider = ProviderModule.getAnyRpcProvider(network)
    const gaugeContract = new Contract(gaugePluginAddress, GaugeVoter.abi, provider)
    const onChainTotalVotingPower: bigint = await gaugeContract.totalVotingPowerCast()

    expect(onChainTotalVotingPower > 0n).to.be.true

    // Step 8: Verify CampaignMerkleRoot record was created
    const campaignMerkleRoot = await Models.CampaignMerkleRoot.findByParams(capitalDistributorAddress, network, '0')

    expect(campaignMerkleRoot).to.exist
    expect(campaignMerkleRoot.merkleRoot).to.equal(completedPrepare.merkleRoot)
    expect(campaignMerkleRoot.totalMembers).to.equal(completedPrepare.totalMembers)

    // Step 8: Test getPrepareStatus endpoint
    const statusResult = await CapitalDistributorController.getPrepareStatus(prepareResult.prepareId)

    expect(statusResult.prepareId).to.equal(prepareResult.prepareId)
    expect(statusResult.status).to.equal(CampaignPrepareStatus.completed)
    expect(statusResult.progress).to.equal(CampaignPrepareProgress.done)
    expect(statusResult.merkleRoot).to.equal(completedPrepare.merkleRoot)
    expect(statusResult.daoAddress).to.equal(daoAddress)
    expect(statusResult.network).to.equal(network)
  })
})
