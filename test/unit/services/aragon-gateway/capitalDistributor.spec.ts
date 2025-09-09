import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, HexAddress, IPluginInterfaceType } from '@types'
import { Models } from '@dbModels'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { MemberGovernanceFactory, CapitalDistributorGovernance } from '@src/governance'
import logger from '@logger'

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

      expect(campaignMerkleRootStub.calledWith(
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
      )).to.be.true

      expect(loggerInfoStub.calledWith('Generating merkle data')).to.be.true
      expect(loggerInfoStub.calledWith('Merkle data Generation completed')).to.be.true
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
      expect(loggerInfoStub.calledWith('Merkle data Generation completed')).to.be.false
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

      expect(campaignMerkleRootStub.calledWith(
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
      )).to.be.true
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
})