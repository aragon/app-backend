import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { MemberGovernanceFactory } from '@src/governance'
import { CampaignPrepareProgress, CampaignPrepareStatus, HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Service: CapitalDistributorGateway', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub

  const mockParams = {
    campaignId: 'campaign-123',
    pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
    network: NetworksEnum.ethereumMainnet,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerWarnStub = sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('generateMerkleData', () => {
    it('should generate merkle data successfully', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        generateMerkleData: sandbox.stub().resolves({
          success: true,
          merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          totalMembers: 100,
        }),
      }

      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      const campaignMerkleRootStub = sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate').resolves({})

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(pluginStub.calledWith(mockParams.pluginAddress, mockParams.network)).to.be.true
      expect(factoryStub.calledWith(mockPlugin)).to.be.true
      expect(mockGovernance.generateMerkleData.calledWith({ campaignId: mockParams.campaignId })).to.be.true

      const expectedId = Models.CampaignMerkleRoot.getEntityId({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(
        campaignMerkleRootStub.calledWith(
          { id: expectedId },
          {
            $set: {
              id: expectedId,
              pluginAddress: mockParams.pluginAddress,
              network: mockParams.network,
              campaignId: mockParams.campaignId,
              merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              totalMembers: 100,
            },
          },
          { upsert: true, new: true },
        ),
      ).to.be.true

      expect(loggerInfoStub.calledWith('Generating merkle data')).to.be.true
      expect(loggerInfoStub.calledWith('Merkle data generation completed')).to.be.true
    })

    it('should return early when plugin not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const governanceStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin')

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(Models.Plugin.findByAddress.calledWith(mockParams.pluginAddress, mockParams.network)).to.be.true
      expect(loggerWarnStub.calledWith('Plugin not found or invalid interface type')).to.be.true
      expect(governanceStub.called).to.be.false
    })

    it('should return early when plugin has wrong interface type', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      const governanceStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin')

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(Models.Plugin.findByAddress.calledWith(mockParams.pluginAddress, mockParams.network)).to.be.true
      expect(loggerWarnStub.calledWith('Plugin not found or invalid interface type')).to.be.true
      expect(governanceStub.called).to.be.false
    })

    it('should handle governance response without success', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        generateMerkleData: sandbox.stub().resolves({
          success: false,
        }),
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      const campaignMerkleRootStub = sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate')

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(mockGovernance.generateMerkleData.calledWith({ campaignId: mockParams.campaignId })).to.be.true
      expect(campaignMerkleRootStub.called).to.be.false
      expect(loggerInfoStub.calledWith('Merkle data generation completed')).to.be.false
    })

    it('should handle governance response without merkleRoot', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        generateMerkleData: sandbox.stub().resolves({
          success: true,
          totalMembers: 50,
        }),
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      const campaignMerkleRootStub = sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate')

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(mockGovernance.generateMerkleData.calledWith({ campaignId: mockParams.campaignId })).to.be.true
      expect(campaignMerkleRootStub.called).to.be.false
    })

    it('should handle default totalMembers when not provided', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        generateMerkleData: sandbox.stub().resolves({
          success: true,
          merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        }),
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      const campaignMerkleRootStub = sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate').resolves({})

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      const expectedId = Models.CampaignMerkleRoot.getEntityId({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(
        campaignMerkleRootStub.calledWith(
          { id: expectedId },
          {
            $set: {
              id: expectedId,
              pluginAddress: mockParams.pluginAddress,
              network: mockParams.network,
              campaignId: mockParams.campaignId,
              merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              totalMembers: 0,
            },
          },
          { upsert: true, new: true },
        ),
      ).to.be.true
    })

    it('should measure and log execution time', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        generateMerkleData: sandbox.stub().resolves({
          success: true,
          merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          totalMembers: 25,
        }),
      }

      const dateStub = sandbox.stub(Date, 'now')
      dateStub.onFirstCall().returns(1000)
      dateStub.onSecondCall().returns(2500)

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate').resolves({})

      await CapitalDistributorGateway.generateMerkleData(mockParams)

      expect(loggerInfoStub.getCall(1).args[1]).to.deep.include({
        params: mockParams,
        timeTaken: '1500ms',
      })
    })
  })

  describe('prepareCampaignFromGauge', () => {
    const prepareParams = {
      prepareId: 'prepare-ethereum-0x1234-1234567890',
    }

    const testDaoAddress = '0x1234567890123456789012345678901234567890' as HexAddress
    const testCapitalDistributorAddress = '0x2222222222222222222222222222222222222222' as HexAddress
    const testGaugePluginAddress = '0x3333333333333333333333333333333333333333' as HexAddress
    const testTokenAddress = '0x4444444444444444444444444444444444444444' as HexAddress

    const createMockCampaignPrepare = () => ({
      id: prepareParams.prepareId,
      daoAddress: testDaoAddress,
      network: NetworksEnum.ethereumMainnet,
      capitalDistributorAddress: testCapitalDistributorAddress,
      gaugePluginAddress: testGaugePluginAddress,
      tokenAddress: testTokenAddress,
      totalAmount: '1000000000000000000',
      status: CampaignPrepareStatus.pending,
      progress: CampaignPrepareProgress.queued,
      update: sandbox.stub().resolves(),
    })

    let loggerErrorStub: sinon.SinonStub

    beforeEach(() => {
      loggerErrorStub = sandbox.stub(logger, 'error')
    })

    it('should return early when CampaignPrepare not found', async () => {
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(null)

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      expect(loggerErrorStub.calledWith('CampaignPrepare not found')).to.be.true
    })

    it('should fail when token balance is insufficient', async () => {
      const mockPrepare = createMockCampaignPrepare()
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)
      sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
      sandbox.stub(Web3Helper, 'getTokenBalance').resolves('100') // Less than totalAmount

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      expect(mockPrepare.update.calledWith({ status: CampaignPrepareStatus.failed })).to.be.true
      expect(loggerWarnStub.calledWith('Insufficient token balance')).to.be.true
    })

    it('should fail when no votes found', async () => {
      const mockPrepare = createMockCampaignPrepare()
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)
      sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
      sandbox.stub(Web3Helper, 'getTokenBalance').resolves('2000000000000000000')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: testGaugePluginAddress,
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 100,
      } as any)
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves([])

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      expect(mockPrepare.update.calledWith({ status: CampaignPrepareStatus.failed })).to.be.true
      expect(loggerWarnStub.calledWith('No votes found')).to.be.true
    })

    it('should update progress through all stages on success', async () => {
      const mockPrepare = createMockCampaignPrepare()
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)
      sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
      sandbox.stub(Web3Helper, 'getTokenBalance').resolves('2000000000000000000')

      const mockLogs = [
        {
          event: {
            name: 'Voted',
            args: {
              voter: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
              votingPowerCastForGauge: '500000000000000000',
            },
          },
        },
      ]

      const pluginFindStub = sandbox.stub(Models.Plugin, 'findByAddress')
      pluginFindStub.withArgs(testGaugePluginAddress, sinon.match.any).resolves({
        address: testGaugePluginAddress,
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 100,
      } as any)
      pluginFindStub.withArgs(testCapitalDistributorAddress, sinon.match.any).resolves({
        address: testCapitalDistributorAddress,
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      } as any)

      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves(mockLogs as any)

      const mockGovernance = {
        uploadMembersList: sandbox.stub().resolves(),
        generateMerkleData: sandbox.stub().resolves({
          success: true,
          merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          totalMembers: 1,
        }),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)
      sandbox.stub(Models.CampaignMerkleRoot, 'findOneAndUpdate').resolves({})

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      // Verify progress updates were called in order
      expect(mockPrepare.update.calledWith({ progress: CampaignPrepareProgress.fetchingOnChainVotes })).to.be.true
      expect(mockPrepare.update.calledWith({ progress: CampaignPrepareProgress.buildingRewards })).to.be.true
      expect(mockPrepare.update.calledWith({ progress: CampaignPrepareProgress.uploadingMembers })).to.be.true
      expect(mockPrepare.update.calledWith({ progress: CampaignPrepareProgress.generatingMerkle })).to.be.true
      expect(
        mockPrepare.update.calledWith({
          status: CampaignPrepareStatus.completed,
          progress: CampaignPrepareProgress.done,
          totalMembers: 1,
          merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        }),
      ).to.be.true
    })

    it('should fail when merkle root generation fails', async () => {
      const mockPrepare = createMockCampaignPrepare()
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)
      sandbox.stub(Web3Helper, 'getNumCampaigns').resolves('0')
      sandbox.stub(Web3Helper, 'getTokenBalance').resolves('2000000000000000000')

      const mockLogs = [
        {
          event: {
            name: 'Voted',
            args: {
              voter: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
              votingPowerCastForGauge: '500000000000000000',
            },
          },
        },
      ]

      const pluginFindStub = sandbox.stub(Models.Plugin, 'findByAddress')
      pluginFindStub.withArgs(testGaugePluginAddress, sinon.match.any).resolves({
        address: testGaugePluginAddress,
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 100,
      } as any)
      pluginFindStub.withArgs(testCapitalDistributorAddress, sinon.match.any).resolves({
        address: testCapitalDistributorAddress,
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      } as any)

      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves(mockLogs as any)

      const mockGovernance = {
        uploadMembersList: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockGovernanceFromPlugin = {
        generateMerkleData: sandbox.stub().resolves({ success: false }),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernanceFromPlugin as any)

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      expect(mockPrepare.update.calledWith({ status: CampaignPrepareStatus.failed })).to.be.true
      expect(loggerWarnStub.calledWith('Failed to generate merkle root')).to.be.true
    })

    it('should catch and log errors', async () => {
      const mockPrepare = createMockCampaignPrepare()
      sandbox.stub(Models.CampaignPrepare, 'findByPrepareId').resolves(mockPrepare as any)
      sandbox.stub(Web3Helper, 'getNumCampaigns').rejects(new Error('Network error'))

      await CapitalDistributorGateway.prepareCampaignFromGauge(prepareParams)

      expect(loggerErrorStub.calledWith('Error preparing campaign from gauge')).to.be.true
      expect(mockPrepare.update.calledWith({ status: CampaignPrepareStatus.failed })).to.be.true
    })
  })
})
