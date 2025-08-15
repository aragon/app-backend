import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { CapitalDistributorHandler } from '@handlers/capitalDistributorHandler'
import { Models } from '@dbModels'
import { NetworksEnum, HexAddress, IPluginStatus, IPluginInterfaceType } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'
import { ProxyToken } from '@modules/proxyToken'
import logger from '@logger'

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
      interfaceType: IPluginInterfaceType.capitalDistribution,
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
          metadataURI: 'https://ipfs.io/ipfs/QmTest123',
          allocationStrategy: '0x1234567890123456789012345678901234567890' as HexAddress,
          token: '0xA0b86a33E6441E13C7D3a1F1f432bE40e2dca91a' as HexAddress,
          actionEncoder: '0x9876543210987654321098765432109876543210' as HexAddress,
          multipleClaimsAllowed: true,
          startTime: BigInt(1640995200),
          endTime: BigInt(1672531200),
        },
      }
    })

    it('Should create campaign in database', async () => {
      const saveAndGetStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const strategyStartStub = sandbox.stub(LogCampaignStrategy, 'start').resolves()
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
      expect(createdCampaign?.multipleClaimsAllowed).to.eq(true)
      expect(createdCampaign?.startTime).to.eq(1640995200)
      expect(createdCampaign?.endTime).to.eq(1672531200)
      expect(createdCampaign?.active).to.eq(true)

      // Verify external services were called
      expect(saveAndGetStub.calledOnce).to.be.true
      expect(saveAndGetStub.args[0][0]).to.eq(parsedEvent.args.token)
      expect(saveAndGetStub.args[0][1]).to.eq(logInfo.network)

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
        resources: ['https://example.com'],
        type: 'distribution',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const ipfsStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(mockMetadata)
      const web3UtilsStub = sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns(mockMetadata)
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
      expect(createdCampaign?.metadata?.resources).to.deep.eq(['https://example.com'])

      // Verify external services were called
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.args[0][0]).to.eq(parsedEvent.args.token)
      expect(proxyTokenStub.args[0][1]).to.eq(logInfo.network)

      expect(ipfsStub.calledOnce).to.be.true
      expect(ipfsStub.args[0][0]).to.eq('https://ipfs.io/ipfs/QmTest123')
      expect(web3UtilsStub.calledOnce).to.be.true

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
  })

  describe('campaignDeactivated', () => {
    let parsedEvent: any
    let existingCampaign: any

    beforeEach(async () => {
      parsedEvent = {
        args: {
          campaignId: BigInt(1),
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
        token: '0xA0b86a33E6441E13C7D3a1F1f432bE40e2dca91a' as HexAddress,
        payoutEncoder: '0x9876543210987654321098765432109876543210' as HexAddress,
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('Should deactivate campaign in database', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      expect(existingCampaign.active).to.be.true

      await CapitalDistributorHandler.campaignDeactivated(parsedEvent, logInfo)

      // Verify campaign was deactivated in database
      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')

      expect(updatedCampaign?.active).to.be.false
      expect(loggerInfoStub.calledWith('Campaign deactivated' as any)).to.be.true
    })

    it('Should warn when campaign not found', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      const nonExistentEvent = {
        args: {
          campaignId: BigInt(999),
        },
      } as any

      await CapitalDistributorHandler.campaignDeactivated(nonExistentEvent, logInfo)

      expect(loggerWarnStub.calledWith('Campaign not found for deactivation' as any)).to.be.true
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
        multipleClaimsAllowed: true,
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
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        claimCount: 0,
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

      // Verify campaign claim count was incremented
      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.claimCount).to.eq(1)

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
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        claimCount: 3, // Starting with existing claims
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

      // Verify campaign claim count was incremented
      const updatedCampaign = await Models.Campaign.findCampaignById(logInfo.address, logInfo.network, '1')
      expect(updatedCampaign?.claimCount).to.eq(4) // 3 + 1
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
  })
})
