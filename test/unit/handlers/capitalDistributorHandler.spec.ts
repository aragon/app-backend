import { Models } from '@dbModels'
import { CapitalDistributorHandler } from '@handlers/capitalDistributorHandler'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'
import { HexAddress, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Handler: CapitalDistributor', () => {
  let sandbox: SinonSandbox
  let logInfo: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    logInfo = {
      address: '0x1234567890123456789012345678901234567890' as HexAddress,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345678,
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as HexAddress,
    }

    await Models.Plugin.create({
      id: `${logInfo.network}-${logInfo.transactionHash}-${logInfo.address}`,
      address: logInfo.address,
      network: logInfo.network,
      transactionHash: logInfo.transactionHash,
      blockNumber: logInfo.blockNumber,
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.capitalDistributor,
      daoAddress: '0xdao1234567890123456789012345678901234567890' as HexAddress,
      pluginSetupRepoAddress: '0xrepo123456789012345678901234567890123456' as HexAddress,
      name: 'Capital Distributor',
      build: '1',
      release: '1',
    })

    // Stub Web3Helper only (will be re-stubbed in individual tests as needed)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1640995200)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('campaignCreated', () => {
    let parsedEvent: any

    beforeEach(() => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
          metadataUri: 'https://ipfs.io/ipfs/QmTest123',
          allocationStrategy: '0x1234567890123456789012345678901234567890' as HexAddress,
          token: '0xA0b86a33E6441E13C7D3a1F1f432bE40e2dca91a' as HexAddress,
          actionEncoder: '0x9876543210987654321098765432109876543210' as HexAddress,
          startTime: BigInt(1640995200),
          endTime: BigInt(1672531200),
        },
      }
    })

    it('Should create campaign in database', async () => {
      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://ipfs.io/ipfs/QmTest123')
      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const strategyStartStub = sandbox.stub(LogCampaignStrategy, 'start').resolves()
      const calculateTotalRewardsStub = sandbox
        .stub(Models.CampaignReward, 'calculateTotalRewards')
        .resolves('5000000000000000000')
      const loggerStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.campaignCreated(parsedEvent, logInfo)

      // Verify campaign was created in database
      const createdCampaign = await Models.Campaign.findExisting({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
      })

      expect(createdCampaign).to.not.be.null
      expect(createdCampaign?.pluginAddress).to.eq(logInfo.address)
      expect(createdCampaign?.network).to.eq(logInfo.network)
      expect(createdCampaign?.campaignId).to.eq('1')
      expect(createdCampaign?.transactionHash).to.eq(logInfo.transactionHash)
      expect(createdCampaign?.blockNumber).to.eq(logInfo.blockNumber)
      expect(createdCampaign?.blockTimestamp).to.eq(1640995200)
      expect(createdCampaign?.metadataURI).to.eq('https://ipfs.io/ipfs/QmTest123')
      expect(createdCampaign?.allocationStrategy).to.eq(parsedEvent.args.allocationStrategy)
      expect(createdCampaign?.token).to.eq(parsedEvent.args.token)
      expect(createdCampaign?.payoutEncoder).to.eq(parsedEvent.args.actionEncoder)
      expect(createdCampaign?.startTime).to.eq(1640995200)
      expect(createdCampaign?.endTime).to.eq(1672531200)
      expect(createdCampaign?.active).to.eq(true)

      // Verify external services were called
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(saveAndGetStub.args[0][0]).to.eq(parsedEvent.args.token)
      expect(saveAndGetStub.args[0][1]).to.eq(logInfo.network)

      expect(calculateTotalRewardsStub.calledOnce).to.be.true
      expect(calculateTotalRewardsStub.args[0][0]).to.eq(logInfo.address)
      expect(calculateTotalRewardsStub.args[0][1]).to.eq(logInfo.network)
      expect(calculateTotalRewardsStub.args[0][2]).to.eq('1')

      // Verify campaign total rewards was updated
      expect(createdCampaign?.totalRewards).to.eq('5000000000000000000')

      expect(strategyStartStub.calledOnce).to.be.true
      expect(strategyStartStub.args[0][0]).to.eq(parsedEvent.args.allocationStrategy)
      expect(strategyStartStub.args[0][1]).to.eq(logInfo.network)
      expect(strategyStartStub.args[0][2]).to.eq(logInfo.blockNumber)

      expect(loggerStub.calledWith('Campaign Created. Starting allocation strategy crawler' as any)).to.be.true
    })

    it('Should not create duplicate campaign', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      sandbox.stub(Models.Campaign, 'findExisting').resolves({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
      } as any)

      await CapitalDistributorHandler.campaignCreated(parsedEvent, logInfo)
      expect(loggerWarnStub.calledWith('Campaign already exists' as any)).to.be.true
      expect(proxyTokenStub.notCalled).to.be.true
    })

    it('Should update metadata when IPFS data is available', async () => {
      const mockMetadata = {
        title: 'Test Campaign',
        description: 'A test campaign',
        resources: [{ name: 'test', url: 'https://example.com' }],
        type: 'distribution',
      }

      sandbox.stub(Web3Utils, 'extractMetadataUri').returns('https://ipfs.io/ipfs/QmTest123')
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const ipfsStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(mockMetadata)
      const web3UtilsStub = sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns(mockMetadata)
      const calculateTotalRewardsStub = sandbox
        .stub(Models.CampaignReward, 'calculateTotalRewards')
        .resolves('3000000000000000000')
      const strategyStub = sandbox.stub(LogCampaignStrategy, 'start').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.campaignCreated(parsedEvent, logInfo)

      // Verify campaign was created with metadata
      const createdCampaign = await Models.Campaign.findExisting({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
      })

      expect(createdCampaign?.metadata?.title).to.eq('Test Campaign')
      expect(createdCampaign?.metadata?.description).to.eq('A test campaign')
      expect(createdCampaign?.metadata?.resources[0].name).to.eq('test')
      expect(createdCampaign?.metadata?.resources[0].url).to.eq('https://example.com')

      // Verify external services were called
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.args[0][0]).to.eq(parsedEvent.args.token)
      expect(proxyTokenStub.args[0][1]).to.eq(logInfo.network)

      expect(ipfsStub.calledOnce).to.be.true
      expect(web3UtilsStub.calledOnce).to.be.true

      expect(calculateTotalRewardsStub.calledOnce).to.be.true
      expect(calculateTotalRewardsStub.args[0][0]).to.eq(logInfo.address)
      expect(calculateTotalRewardsStub.args[0][1]).to.eq(logInfo.network)
      expect(calculateTotalRewardsStub.args[0][2]).to.eq('1')

      // Verify campaign total rewards was updated
      expect(createdCampaign?.totalRewards).to.eq('3000000000000000000')

      expect(strategyStub.calledOnce).to.be.true
      expect(strategyStub.args[0][0]).to.eq(parsedEvent.args.allocationStrategy)
      expect(strategyStub.args[0][1]).to.eq(logInfo.network)
      expect(strategyStub.args[0][2]).to.eq(logInfo.blockNumber)

      expect(loggerInfoStub.calledWith('Campaign Created. Starting allocation strategy crawler' as any)).to.be.true
    })

    it('Should warn and return early when plugin not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      // Use a different plugin address that doesn't exist
      const nonExistentLogInfo = {
        ...logInfo,
        address: '0x9999999999999999999999999999999999999999' as HexAddress,
      }

      await CapitalDistributorHandler.campaignCreated(parsedEvent, nonExistentLogInfo)

      // Verify no campaign was created
      const createdCampaign = await Models.Campaign.findExisting({
        pluginAddress: nonExistentLogInfo.address,
        network: nonExistentLogInfo.network,
        campaignId: '1',
      })

      expect(createdCampaign).to.be.null
      expect(loggerWarnStub.calledWith('Plugin not found' as any)).to.be.true
    })

    it('should handle error gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Campaign, 'findExisting').rejects(new Error('Database error'))

      await CapitalDistributorHandler.campaignCreated(parsedEvent, logInfo)
      expect(loggerErrorStub.calledWith('Error processing CampaignCreated event' as any)).to.be.true
    })
  })

  describe('merkleCampaignSet', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
          merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      }

      // Create campaign in database first
      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address, // Using address as allocation strategy for this test
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('Should set merkle root in database', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.merkleRoot).to.be.null

      await CapitalDistributorHandler.merkleCampaignSet(parsedEvent, logInfo)

      // Verify merkle root was set in database
      const updatedCampaign = await Models.Campaign.findOne({
        allocationStrategy: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
      })

      expect(updatedCampaign?.merkleRoot).to.eq(parsedEvent.args.merkleRoot)
      expect(loggerInfoStub.calledWith('Merkle root set for campaign' as any)).to.be.true
    })

    it('Should warn when campaign not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      const nonExistentEvent = {
        args: {
          campaignId: BigInt(999),
          merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      }

      await CapitalDistributorHandler.merkleCampaignSet(nonExistentEvent as any, logInfo)

      expect(loggerWarnStub.calledWith('Campaign not found for merkle root update' as any)).to.be.true
    })

    it('should handle error gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Campaign, 'findOne').rejects(new Error('Database error'))

      await CapitalDistributorHandler.merkleCampaignSet(parsedEvent, logInfo)
      expect(loggerErrorStub.calledWith('Error processing MerkleCampaignSet event' as any)).to.be.true
    })

    it('Should reconcile draft campaign rewards to real campaignId', async () => {
      const draftCampaignId = 'draft-uuid-123456789'
      const realCampaignId = '1'
      const merkleRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      // Create draft CampaignMerkleRoot with UUID
      await Models.CampaignMerkleRoot.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: draftCampaignId,
        merkleRoot,
        totalMembers: 2,
        isDraft: true,
      })

      // Create draft CampaignReward records with UUID
      await Models.CampaignReward.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: draftCampaignId,
        userAddress: '0xuser1234567890123456789012345678901234567890' as HexAddress,
        amount: '1000000000000000000',
      })

      await Models.CampaignReward.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: draftCampaignId,
        userAddress: '0xuser2234567890123456789012345678901234567890' as HexAddress,
        amount: '2000000000000000000',
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.merkleCampaignSet({ args: { campaignId: BigInt(1), merkleRoot } } as any, logInfo)

      // Verify CampaignReward records were reconciled to real campaignId
      const reconciledRewards = await Models.CampaignReward.find({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: realCampaignId,
      })
      expect(reconciledRewards).to.have.length(2)

      // Verify draft rewards no longer exist
      const draftRewards = await Models.CampaignReward.find({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: draftCampaignId,
      })
      expect(draftRewards).to.have.length(0)

      // Verify CampaignMerkleRoot was updated
      const updatedMerkleRoot = await Models.CampaignMerkleRoot.findByParams(
        logInfo.address,
        logInfo.network,
        realCampaignId,
      )
      expect(updatedMerkleRoot?.campaignId).to.eq(realCampaignId)
      expect(updatedMerkleRoot?.isDraft).to.be.false

      // Verify campaign totalRewards was updated
      const updatedCampaign = await Models.Campaign.findOne({
        allocationStrategy: logInfo.address,
        network: logInfo.network,
        campaignId: realCampaignId,
      })
      expect(updatedCampaign?.totalRewards).to.eq('3000000000000000000')
      expect(updatedCampaign?.merkleRoot).to.eq(merkleRoot)

      expect(loggerInfoStub.calledWith('Reconciled draft campaign to real campaignId' as any)).to.be.true
      expect(loggerInfoStub.calledWith('Merkle root set for campaign' as any)).to.be.true
    })

    it('Should skip reconciliation when existingMerkleData exists (admin flow)', async () => {
      const realCampaignId = '1'
      const merkleRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      // Create CampaignMerkleRoot with real campaignId (admin flow)
      await Models.CampaignMerkleRoot.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: realCampaignId,
        merkleRoot,
        totalMembers: 2,
        isDraft: false,
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.merkleCampaignSet({ args: { campaignId: BigInt(1), merkleRoot } } as any, logInfo)

      // Verify no reconciliation log
      expect(loggerInfoStub.calledWith('Reconciled draft campaign to real campaignId' as any)).to.be.false
      expect(loggerInfoStub.calledWith('Merkle root set for campaign' as any)).to.be.true

      // Verify campaign merkle root was still updated
      const updatedCampaign = await Models.Campaign.findOne({
        allocationStrategy: logInfo.address,
        network: logInfo.network,
        campaignId: realCampaignId,
      })
      expect(updatedCampaign?.merkleRoot).to.eq(merkleRoot)
    })

    it('Should skip reconciliation when no draft found', async () => {
      const realCampaignId = '1'
      const merkleRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.merkleCampaignSet({ args: { campaignId: BigInt(1), merkleRoot } } as any, logInfo)

      // Verify no reconciliation log
      expect(loggerInfoStub.calledWith('Reconciled draft campaign to real campaignId' as any)).to.be.false
      expect(loggerInfoStub.calledWith('Merkle root set for campaign' as any)).to.be.true

      // Verify campaign merkle root was still updated
      const updatedCampaign = await Models.Campaign.findOne({
        allocationStrategy: logInfo.address,
        network: logInfo.network,
        campaignId: realCampaignId,
      })
      expect(updatedCampaign?.merkleRoot).to.eq(merkleRoot)
    })
  })

  describe('merkleCampaignUpdated', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
          newMerkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      }

      // Create campaign in database first
      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address, // Using address as allocation strategy for this test
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      })
    })

    it('Should update merkle root in database', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.merkleRoot).to.eq('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')

      await CapitalDistributorHandler.merkleCampaignUpdated(parsedEvent, logInfo)

      // Verify merkle root was updated in database
      const updatedCampaign = await Models.Campaign.findOne({
        allocationStrategy: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
      })

      expect(updatedCampaign?.merkleRoot).to.eq(parsedEvent.args.newMerkleRoot)
      expect(loggerInfoStub.calledWith('Merkle root updated for campaign' as any)).to.be.true
    })

    it('Should warn when campaign not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      const nonExistentEvent = {
        args: {
          campaignId: BigInt(999),
          newMerkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      }

      await CapitalDistributorHandler.merkleCampaignUpdated(nonExistentEvent as any, logInfo)

      expect(loggerWarnStub.calledWith('Campaign not found for merkle root update' as any)).to.be.true
    })

    it('should handle error gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Campaign, 'findOne').rejects(new Error('Database error'))

      await CapitalDistributorHandler.merkleCampaignUpdated(parsedEvent, logInfo)
      expect(loggerErrorStub.calledWith('Error processing MerkleCampaignUpdated event' as any)).to.be.true
    })
  })

  describe('payoutClaimed', () => {
    let parsedEvent: any

    beforeEach(() => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
          recipient: '0xuser1234567890123456789012345678901234567890' as HexAddress,
          amount: BigInt('1000000000000000000'),
          totalClaimed: BigInt('1000000000000000000'),
        },
      }
    })

    it('Should create new reward and add claim when reward does not exist', async () => {
      // Create campaign first
      await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        claimCount: 0,
        totalClaimed: '0',
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.payoutClaimed(parsedEvent, logInfo)

      // Verify reward was created in database
      const createdReward = await Models.CampaignReward.findRewardForCampaign(
        logInfo.address,
        logInfo.network,
        '1',
        parsedEvent.args.recipient,
      )

      expect(createdReward).to.not.be.null
      expect(createdReward?.pluginAddress).to.eq(logInfo.address)
      expect(createdReward?.network).to.eq(logInfo.network)
      expect(createdReward?.campaignId).to.eq('1')
      expect(createdReward?.userAddress).to.eq(parsedEvent.args.recipient)
      expect(createdReward?.amount).to.eq('1000000000000000000')
      expect(createdReward?.totalClaimed).to.eq('1000000000000000000')
      expect(createdReward?.claims).to.have.length(1)
      expect(createdReward?.claims[0].claimedAmount).to.eq('1000000000000000000')
      expect(createdReward?.claims[0].transactionHash).to.eq(logInfo.transactionHash)
      expect(createdReward?.claims[0].blockNumber).to.eq(logInfo.blockNumber)
      expect(createdReward?.claims[0].blockTimestamp).to.eq(1640995200)

      // Verify campaign claim count was incremented and total claimed was updated
      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.claimCount).to.eq(1)
      expect(updatedCampaign?.totalClaimed).to.eq('1000000000000000000')

      expect(loggerInfoStub.calledWith('Payout claimed' as any)).to.be.true
    })

    it('Should add claim to existing reward when reward exists', async () => {
      // Create campaign first
      await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        claimCount: 3, // Starting with existing claims
        totalClaimed: '2000000000000000000', // Starting with existing total claimed
      })

      await Models.CampaignReward.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
        userAddress: parsedEvent.args.recipient,
        amount: '2000000000000000000',
        totalClaimed: '500000000000000000',
        claims: [
          {
            claimedAmount: '500000000000000000',
            transactionHash: '0xprevious1234567890123456789012345678901234567890123456789012345678' as HexAddress,
            blockNumber: 12345677,
            blockTimestamp: 1640995100,
          },
        ],
      })

      sandbox.stub(logger, 'info')
      await CapitalDistributorHandler.payoutClaimed(parsedEvent, logInfo)

      // Verify existing reward was updated with a new claim
      const updatedReward = await Models.CampaignReward.findRewardForCampaign(
        logInfo.address,
        logInfo.network,
        '1',
        parsedEvent.args.recipient,
      )

      expect(updatedReward?.totalClaimed).to.eq('1500000000000000000') // 500000000000000000 + 1000000000000000000
      expect(updatedReward?.claims).to.have.length(2)
      expect(updatedReward?.claims[1].claimedAmount).to.eq('1000000000000000000')
      expect(updatedReward?.claims[1].transactionHash).to.eq(logInfo.transactionHash)

      // Verify campaign claim count was incremented and total claimed was updated
      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.claimCount).to.eq(4) // 3 + 1
      expect(updatedCampaign?.totalClaimed).to.eq('3000000000000000000') // 2000000000000000000 + 1000000000000000000
    })

    it('Should warn and return when plugin not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      // Use a different plugin address that doesn't exist
      const nonExistentLogInfo = {
        ...logInfo,
        address: '0x9999999999999999999999999999999999999999' as HexAddress,
      }

      await CapitalDistributorHandler.payoutClaimed(parsedEvent, nonExistentLogInfo)

      // Verify no reward was created
      const createdReward = await Models.CampaignReward.findRewardForCampaign(
        nonExistentLogInfo.address,
        nonExistentLogInfo.network,
        '1',
        parsedEvent.args.recipient,
      )

      expect(createdReward).to.be.null
      expect(loggerWarnStub.calledWith('Plugin not found' as any)).to.be.true
    })

    it('Should handle case when campaign not found for claim count increment', async () => {
      // Create a reward without a corresponding campaign to test the edge case
      await Models.CampaignReward.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '999', // Different campaign ID with no matching campaign
        userAddress: parsedEvent.args.recipient,
        amount: '1000000000000000000',
        totalClaimed: '0',
        claims: [],
      })

      // Use campaign ID 999 for this test
      const eventWithNoCampaign = {
        args: {
          campaignId: BigInt(999),
          recipient: parsedEvent.args.recipient,
          amount: BigInt('1000000000000000000'),
          totalClaimed: BigInt('1000000000000000000'),
        },
      }

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.payoutClaimed(eventWithNoCampaign as any, logInfo)

      // Verify the claim was still processed (reward updated)
      const updatedReward = await Models.CampaignReward.findRewardForCampaign(
        logInfo.address,
        logInfo.network,
        '999',
        parsedEvent.args.recipient,
      )
      expect(updatedReward?.totalClaimed).to.eq('1000000000000000000')
      expect(updatedReward?.claims).to.have.length(1)

      // Verify logging occurred
      expect(loggerInfoStub.calledWith('Payout claimed' as any)).to.be.true
    })

    it('should return when the claimed tx is already saved', async () => {
      await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })

      const existingReward = await Models.CampaignReward.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        campaignId: '1',
        userAddress: parsedEvent.args.recipient,
        amount: '1000000000000000000',
        totalClaimed: '1000000000000000000',
      })

      await existingReward.addClaim(
        parsedEvent.args.amount.toString(),
        logInfo.transactionHash,
        logInfo.blockNumber,
        1640995200,
      )

      const loggerInfoStub = sandbox.stub(logger, 'info')

      const claimStub = sandbox.spy(Models.CampaignReward.prototype, 'addClaim')

      await CapitalDistributorHandler.payoutClaimed(parsedEvent, logInfo)

      const updatedReward = await Models.CampaignReward.findRewardForCampaign(
        logInfo.address,
        logInfo.network,
        '1',
        parsedEvent.args.recipient,
      )

      expect(updatedReward?.claims).to.have.length(1)
      expect(loggerInfoStub.calledWith('Payout claimed' as any)).to.be.false
      expect(claimStub.callCount).to.be.eq(0)
    })

    it('should handle error gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.CampaignReward, 'findRewardForCampaign').rejects(new Error('Database error'))

      await CapitalDistributorHandler.payoutClaimed(parsedEvent, logInfo)
      expect(loggerErrorStub.calledWith('Error processing PayoutClaimed event' as any)).to.be.true
    })
  })

  describe('updateCampaignActiveState', () => {
    let existingCampaign: any

    beforeEach(async () => {
      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('Should update campaign active state to false', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.active).to.be.true

      await CapitalDistributorHandler.updateCampaignActiveState(logInfo.address, logInfo.network, '1', false)

      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.active).to.be.false
      expect(loggerInfoStub.calledWith('Campaign status updated' as any)).to.be.true
    })

    it('Should update campaign active state to true', async () => {
      await existingCampaign.update({ active: false })
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await CapitalDistributorHandler.updateCampaignActiveState(logInfo.address, logInfo.network, '1', true)

      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.active).to.be.true
      expect(loggerInfoStub.calledWith('Campaign status updated' as any)).to.be.true
    })

    it('Should warn when plugin not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await CapitalDistributorHandler.updateCampaignActiveState(
        '0x9999999999999999999999999999999999999999',
        logInfo.network,
        '1',
        false,
      )

      expect(loggerWarnStub.calledWith('Plugin not found' as any)).to.be.true
    })

    it('Should warn when campaign not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await CapitalDistributorHandler.updateCampaignActiveState(logInfo.address, logInfo.network, '999', false)

      expect(loggerWarnStub.calledWith('Campaign not found for' as any)).to.be.true
    })

    it('Should handle error gracefully', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({
        ...existingCampaign,
        update: sandbox.stub().rejects(new Error('Database error')),
      } as any)

      await CapitalDistributorHandler.updateCampaignActiveState(logInfo.address, logInfo.network, '1', false)

      expect(loggerErrorStub.calledWith('Error processing Campaign event' as any)).to.be.true
    })
  })

  describe('campaignPaused', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
        },
      }

      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('Should pause campaign by setting active to false', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.active).to.be.true

      await CapitalDistributorHandler.campaignPaused(parsedEvent, logInfo)

      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.active).to.be.false
      expect(loggerInfoStub.calledWith('Campaign status updated' as any)).to.be.true
    })
  })

  describe('campaignResumed', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
        },
      }

      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: false,
      })
    })

    it('Should resume campaign by setting active to true', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.active).to.be.false

      await CapitalDistributorHandler.campaignResumed(parsedEvent, logInfo)

      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.active).to.be.true
      expect(loggerInfoStub.calledWith('Campaign status updated' as any)).to.be.true
    })
  })

  describe('campaignEnded', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
        },
      }

      existingCampaign = await Models.Campaign.create({
        pluginAddress: logInfo.address,
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        blockNumber: logInfo.blockNumber,
        blockTimestamp: 1640995200,
        campaignId: '1',
        metadataURI: 'https://ipfs.io/ipfs/QmTest123',
        allocationStrategy: logInfo.address,
        token: '0xtoken1234567890123456789012345678901234' as HexAddress,
        payoutEncoder: '0xencoder123456789012345678901234567890' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('Should end campaign by setting active to false and ended to true', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.active).to.be.true
      expect(existingCampaign.ended).to.be.false

      await CapitalDistributorHandler.campaignEnded(parsedEvent, logInfo)

      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.active).to.be.false
      expect(updatedCampaign?.ended).to.be.true
      expect(loggerInfoStub.calledWith('Campaign status updated' as any)).to.be.true
    })
  })

  describe('payoutClaimedBatch', () => {
    const pluginAddress = '0xCapitalDistributor123456789012345678901234' as any
    const batchNetwork = NetworksEnum.ethereumMainnet

    beforeEach(async () => {
      await Models.Plugin.create({
        id: `${batchNetwork}-${pluginAddress}-batch`,
        address: pluginAddress,
        network: batchNetwork,
        transactionHash: '0xbatchtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 100,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao1234567890123456789012345678901234567890' as HexAddress,
        pluginSetupRepoAddress: '0xrepo123456789012345678901234567890123456' as HexAddress,
        name: 'Capital Distributor',
        build: '1',
        release: '1',
      })
    })

    const makeClaimEvent = (overrides: any = {}) => ({
      parsedEvent: {
        args: {
          campaignId: overrides.campaignId || BigInt(1),
          recipient: overrides.recipient || ('0xuser1234567890123456789012345678901234567890' as HexAddress),
          amount: overrides.amount || BigInt('1000000000000000000'),
        },
      } as any,
      info: {
        address: overrides.address || pluginAddress,
        network: batchNetwork,
        blockNumber: overrides.blockNumber || 12345678,
        transactionHash:
          overrides.transactionHash ||
          ('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as HexAddress),
        transactionIndex: overrides.transactionIndex || 0,
        logIndex: overrides.logIndex || 0,
        context: {
          getBlockTimestamps: sinon
            .stub()
            .resolves(new Map(overrides.timestampEntries || [[overrides.blockNumber || 12345678, 1640995200]])),
        },
      } as any,
    })

    it('should skip when events array is empty', async () => {
      const rewardBulkWriteStub = sandbox.stub(Models.CampaignReward, 'bulkWrite')

      await CapitalDistributorHandler.payoutClaimedBatch([])

      expect(rewardBulkWriteStub.notCalled).to.be.true
    })

    it('should skip when no plugins found', async () => {
      const rewardBulkWriteStub = sandbox.stub(Models.CampaignReward, 'bulkWrite')

      const events = [
        makeClaimEvent({
          address: '0x9999999999999999999999999999999999999999' as HexAddress,
        }),
      ]

      await CapitalDistributorHandler.payoutClaimedBatch(events)

      expect(rewardBulkWriteStub.notCalled).to.be.true
    })

    it('should upsert rewards and push claims via bulkWrite', async () => {
      const rewardBulkWriteStub = sandbox.stub(Models.CampaignReward, 'bulkWrite').resolves()
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({
        incrementClaimCount: sandbox.stub().resolves(),
        addToTotalClaimed: sandbox.stub().resolves(),
      } as any)

      await CapitalDistributorHandler.payoutClaimedBatch([makeClaimEvent()])

      expect(rewardBulkWriteStub.calledOnce).to.be.true
      const ops = rewardBulkWriteStub.getCall(0).args[0] as any[]
      expect(ops).to.have.lengthOf(2)
      // First op: upsert with $setOnInsert only
      expect(ops[0].updateOne.update.$setOnInsert.userAddress).to.equal(
        '0xuser1234567890123456789012345678901234567890',
      )
      expect(ops[0].updateOne.upsert).to.be.true
      // Second op: push claim with $ne guard
      expect(ops[1].updateOne.update.$push.claims.claimedAmount).to.equal('1000000000000000000')
      expect(ops[1].updateOne.filter['claims.transactionHash'].$ne).to.exist
    })

    it('should update campaign claimCount and totalClaimed', async () => {
      sandbox.stub(Models.CampaignReward, 'bulkWrite').resolves()

      const incrementClaimCountStub = sandbox.stub().resolves()
      const addToTotalClaimedStub = sandbox.stub().resolves()
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({
        incrementClaimCount: incrementClaimCountStub,
        addToTotalClaimed: addToTotalClaimedStub,
      } as any)

      const events = [
        makeClaimEvent({ logIndex: 0 }),
        makeClaimEvent({
          logIndex: 1,
          recipient: '0xuser2234567890123456789012345678901234567890' as HexAddress,
          transactionHash: '0xbbbbbb1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as HexAddress,
        }),
      ]

      await CapitalDistributorHandler.payoutClaimedBatch(events)

      // Each event calls incrementClaimCount and addToTotalClaimed
      expect(incrementClaimCountStub.callCount).to.equal(2)
      expect(addToTotalClaimedStub.callCount).to.equal(2)
      expect(addToTotalClaimedStub.getCall(0).args[0]).to.equal('1000000000000000000')
      expect(addToTotalClaimedStub.getCall(1).args[0]).to.equal('1000000000000000000')
    })

    it('should deduplicate claims via $addToSet', async () => {
      const rewardBulkWriteStub = sandbox.stub(Models.CampaignReward, 'bulkWrite').resolves()
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({
        incrementClaimCount: sandbox.stub().resolves(),
        addToTotalClaimed: sandbox.stub().resolves(),
      } as any)

      await CapitalDistributorHandler.payoutClaimedBatch([makeClaimEvent()])

      expect(rewardBulkWriteStub.calledOnce).to.be.true
      const ops = rewardBulkWriteStub.getCall(0).args[0] as any[]
      // Uses $push with $ne filter for dedup instead of $addToSet
      expect(ops[1].updateOne.update.$push).to.exist
      expect(ops[1].updateOne.update.$push.claims.transactionHash).to.equal(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )
      // Filter guards against duplicate transactionHash
      expect(ops[1].updateOne.filter['claims.transactionHash'].$ne).to.equal(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )
    })

    it('should fetch timestamps via context.getBlockTimestamps', async () => {
      sandbox.stub(Models.CampaignReward, 'bulkWrite').resolves()
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({
        incrementClaimCount: sandbox.stub().resolves(),
        addToTotalClaimed: sandbox.stub().resolves(),
      } as any)

      const getBlockTimestampsStub = sinon.stub().resolves(
        new Map([
          [100, 1630425600],
          [200, 1630425700],
        ]),
      )

      const events = [
        makeClaimEvent({ blockNumber: 100, logIndex: 0, timestampEntries: [[100, 1630425600]] }),
        makeClaimEvent({
          blockNumber: 200,
          logIndex: 1,
          transactionHash: '0xcccccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as HexAddress,
          timestampEntries: [[200, 1630425700]],
        }),
      ]

      events[0].info.context = { getBlockTimestamps: getBlockTimestampsStub }

      await CapitalDistributorHandler.payoutClaimedBatch(events)

      expect(getBlockTimestampsStub.calledOnce).to.be.true
      const calledWith = getBlockTimestampsStub.getCall(0).args[0]
      expect(calledWith).to.include(100)
      expect(calledWith).to.include(200)
    })

    it('should throw when an error occurs in payoutClaimedBatch', async () => {
      sandbox.stub(logger, 'error')
      sandbox
        .stub(Models.Plugin, 'find')
        .returns({ lean: sinon.stub().rejects(new Error('DB connection lost')) } as any)

      try {
        await CapitalDistributorHandler.payoutClaimedBatch([makeClaimEvent()])
        expect.fail('Expected an error to be thrown')
      } catch (error: any) {
        expect(error.message).to.equal('DB connection lost')
      }
    })
  })
})
