import { Models } from '@dbModels'
import * as errors from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { MemberGovernanceFactory } from '@src/governance'
import { ErrorKeyEnum, HexAddress, IClaimStat, IPluginInterfaceType, IUserCampaignStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: CapitalDistributor', () => {
  let sandbox: SinonSandbox

  const mockParams = {
    pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
    network: NetworksEnum.ethereumMainnet,
    userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getCampaignsWithPagination', () => {
    it('Should get campaigns with pagination successfully', async () => {
      const mockResult = {
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 2,
        },
        data: [
          {
            campaignId: 'campaign-001',
            title: 'Test Campaign 1',
            description: 'Description 1',
            active: true,
            startTime: 1640995200,
            endTime: 1672531200,
            claimCount: 5,
            strategy: { root: '0xmerkleroot123' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
            userData: {
              status: IClaimStat.CLAIMABLE,
              totalAmount: '1000000000000000000',
              totalClaimed: '0',
            },
          },
          {
            campaignId: 'campaign-002',
            title: 'Test Campaign 2',
            description: 'Description 2',
            active: true,
            startTime: 1640995300,
            endTime: 1672531300,
            claimCount: 2,
            strategy: { root: '' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
            userData: {
              status: IClaimStat.CLAIMED,
              totalAmount: '2000000000000000000',
              totalClaimed: '2000000000000000000',
            },
          },
        ],
      }

      const campaignStub = sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)

      const paginationParams = {
        page: 1,
        pageSize: 10,
        sort: 'startTime',
        order: 'desc',
      }

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        status: IClaimStat.CLAIMABLE,
      }

      const result = await CapitalDistributorController.getCampaignsWithPagination(paginationParams, extraParams)

      expect(result).to.deep.eq(mockResult)
      expect(campaignStub.calledOnce).to.be.true
      expect(campaignStub.args[0][0]).to.deep.eq({
        paginationParams,
        params: extraParams,
      })
    })

    it('Should throw error when pluginAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      const extraParams = {
        network: mockParams.network,
        userAddress: mockParams.userAddress,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams as any)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when network is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.badParams)) // network check fails

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        userAddress: mockParams.userAddress,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams as any)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledTwice).to.be.true
      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should work without optional userAddress parameter', async () => {
      const mockResult = {
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 1,
        },
        data: [
          {
            campaignId: 'campaign-001',
            title: 'Test Campaign',
            description: 'Description',
            active: true,
            startTime: 1640995200,
            endTime: 1672531200,
            claimCount: 0,
            strategy: { root: '' },
            token: {
              symbol: 'TEST',
              name: 'Test Token',
              decimals: 18,
            },
          },
        ],
      }

      const campaignStub = sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      const result = await CapitalDistributorController.getCampaignsWithPagination({}, extraParams)

      expect(result).to.deep.eq(mockResult)
      expect(campaignStub.calledOnce).to.be.true
    })

    it('Should handle and rethrow errors from Campaign model', async () => {
      const campaignError = new Error('Database connection failed')
      sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').rejects(campaignError)

      const extraParams = {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      await expect(CapitalDistributorController.getCampaignsWithPagination({}, extraParams)).to.be.rejectedWith(
        'Database connection failed',
      )
    })

    it('Should use default empty objects when no parameters provided', async () => {
      const mockResult = {
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
        data: [],
      }

      sandbox.stub(Models.Campaign, 'getCampaignsWithPagination').resolves(mockResult as any)
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(CapitalDistributorController.getCampaignsWithPagination({} as any, {} as any)).to.be.rejectedWith(
        ErrorKeyEnum.badParams,
      )

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })
  })

  describe('getUserCampaignStatus', () => {
    it('Should get user campaign status successfully', async () => {
      const mockResult: IUserCampaignStatus = {
        totalClaimed: '1500000000000000000',
        totalClaimable: '2500000000000000000',
      }

      const campaignRewardStub = sandbox.stub(Models.CampaignReward, 'getUserCampaignStatus').resolves(mockResult)

      const result = await CapitalDistributorController.getUserCampaignStatus(
        mockParams.pluginAddress,
        mockParams.network,
        mockParams.userAddress,
      )

      expect(result).to.deep.eq(mockResult)
      expect(campaignRewardStub.calledOnce).to.be.true
      expect(campaignRewardStub.args[0][0]).to.eq(mockParams.pluginAddress)
      expect(campaignRewardStub.args[0][1]).to.eq(mockParams.network)
      expect(campaignRewardStub.args[0][2]).to.eq(mockParams.userAddress)
    })

    it('Should throw error when pluginAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          '' as HexAddress,
          mockParams.network,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when network is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          '' as NetworksEnum,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledTwice).to.be.true
      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should throw error when userAddress is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onFirstCall().returns(true as any)
      assertStub.onSecondCall().returns(true as any)
      assertStub.onThirdCall().throws(new Error(ErrorKeyEnum.badParams))

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          mockParams.network,
          '' as HexAddress,
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)

      expect(assertStub.calledThrice).to.be.true
      expect(assertStub.thirdCall.calledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should handle and rethrow errors from CampaignReward model', async () => {
      const modelError = new Error('Database query failed')
      sandbox.stub(Models.CampaignReward, 'getUserCampaignStatus').rejects(modelError)

      await expect(
        CapitalDistributorController.getUserCampaignStatus(
          mockParams.pluginAddress,
          mockParams.network,
          mockParams.userAddress,
        ),
      ).to.be.rejectedWith('Database query failed')
    })
  })

  describe('getCampaignClaimers', () => {
    const testCampaignId = 'campaign-001'

    it('Should get campaign claimers successfully', async () => {
      const mockResult = {
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 2,
        },
        data: [
          {
            userAddress: '0x1111111111111111111111111111111111111111',
            amount: '1000000000000000000',
            claimedAmount: '1000000000000000000',
            transactionHash: '0xtx1',
            blockNumber: 100,
            blockTimestamp: 1700000000,
          },
          {
            userAddress: '0x2222222222222222222222222222222222222222',
            amount: '2000000000000000000',
            claimedAmount: '2000000000000000000',
            transactionHash: '0xtx2',
            blockNumber: 200,
            blockTimestamp: 1700000100,
          },
        ],
      }

      const findCampaignStub = sandbox
        .stub(Models.Campaign, 'findCampaignById')
        .resolves({ campaignId: testCampaignId } as any)
      const claimersStub = sandbox.stub(Models.CampaignReward, 'getCampaignClaimers').resolves(mockResult as any)

      const paginationParams = { page: 1, pageSize: 10 }

      const result = await CapitalDistributorController.getCampaignClaimers(paginationParams, {
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: testCampaignId,
      })

      expect(result).to.deep.eq(mockResult)
      expect(findCampaignStub.calledOnce).to.be.true
      expect(findCampaignStub.calledWith(mockParams.pluginAddress, mockParams.network, testCampaignId)).to.be.true
      expect(claimersStub.calledOnce).to.be.true
      expect(claimersStub.args[0][0]).to.eq(mockParams.pluginAddress)
      expect(claimersStub.args[0][1]).to.eq(mockParams.network)
      expect(claimersStub.args[0][2]).to.eq(testCampaignId)
      expect(claimersStub.args[0][3]).to.deep.eq(paginationParams)
    })

    it('Should throw notFound when campaign does not exist', async () => {
      const findCampaignStub = sandbox.stub(Models.Campaign, 'findCampaignById').resolves(null)
      const claimersStub = sandbox.stub(Models.CampaignReward, 'getCampaignClaimers')
      const assertStub = sandbox.stub(errors, 'assertExposable')
      assertStub.onSecondCall().throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorController.getCampaignClaimers(
          {},
          {
            pluginAddress: mockParams.pluginAddress,
            network: mockParams.network,
            campaignId: testCampaignId,
          },
        ),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(findCampaignStub.calledOnce).to.be.true
      expect(assertStub.secondCall.calledWith(false, ErrorKeyEnum.notFound)).to.be.true
      expect(claimersStub.called).to.be.false
    })

    it('Should throw error when any required param is missing', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      const missingVariants = [
        { pluginAddress: '' as HexAddress, network: mockParams.network, campaignId: testCampaignId },
        { pluginAddress: mockParams.pluginAddress, network: '' as NetworksEnum, campaignId: testCampaignId },
        { pluginAddress: mockParams.pluginAddress, network: mockParams.network, campaignId: '' },
      ]

      for (const params of missingVariants) {
        await expect(CapitalDistributorController.getCampaignClaimers({}, params)).to.be.rejectedWith(
          Error,
          ErrorKeyEnum.badParams,
        )
      }

      expect(assertStub.alwaysCalledWith(false, ErrorKeyEnum.badParams)).to.be.true
    })

    it('Should handle and rethrow errors from CampaignReward model', async () => {
      const modelError = new Error('Database query failed')
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves({ campaignId: testCampaignId } as any)
      sandbox.stub(Models.CampaignReward, 'getCampaignClaimers').rejects(modelError)

      await expect(
        CapitalDistributorController.getCampaignClaimers(
          {},
          {
            pluginAddress: mockParams.pluginAddress,
            network: mockParams.network,
            campaignId: testCampaignId,
          },
        ),
      ).to.be.rejectedWith('Database query failed')
    })
  })

  describe('getUserCampaignReward', () => {
    const testCampaignId = 'test-campaign-123'
    let mockGovernance: any
    let factoryStub: sinon.SinonStub

    beforeEach(() => {
      mockGovernance = {
        getUserCampaignReward: sandbox.stub(),
      }
      factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance)
    })

    it('should get user campaign reward via governance factory', async () => {
      const expectedResult = {
        exists: true,
        campaignId: testCampaignId,
        userAddress: mockParams.userAddress,
        amount: '1000',
        totalClaimed: '500',
        claims: [
          {
            claimedAmount: '500',
            transactionHash: '0xabc',
            blockNumber: 123,
            blockTimestamp: 1640995200,
          },
        ],
        proof: ['0x123'],
        leaf: '0xleaf',
        isFullyClaimed: false,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      mockGovernance.getUserCampaignReward.resolves(expectedResult)

      const result = await CapitalDistributorController.getUserCampaignReward({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        campaignId: testCampaignId,
      })

      expect(result).to.deep.equal(expectedResult)
      expect(factoryStub.calledOnce).to.be.true
      expect(factoryStub.args[0][0]).to.deep.equal({
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      })
      expect(
        mockGovernance.getUserCampaignReward.calledWith({
          campaignId: testCampaignId,
          userAddress: mockParams.userAddress,
        }),
      ).to.be.true
    })

    it('should return exists: false for non-existing reward', async () => {
      const expectedResult = {
        exists: false,
        campaignId: testCampaignId,
        userAddress: mockParams.userAddress,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      }

      mockGovernance.getUserCampaignReward.resolves(expectedResult)

      const result = await CapitalDistributorController.getUserCampaignReward({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        userAddress: mockParams.userAddress,
        campaignId: testCampaignId,
      })

      expect(result).to.deep.equal(expectedResult)
      expect(result.exists).to.be.false
    })

    it('should handle governance errors gracefully', async () => {
      mockGovernance.getUserCampaignReward.rejects(new Error('Governance error'))

      await expect(
        CapitalDistributorController.getUserCampaignReward({
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
          userAddress: mockParams.userAddress,
          campaignId: testCampaignId,
        }),
      ).to.be.rejectedWith('Governance error')
    })
  })

  describe('uploadCampaignMembers', () => {
    let mockGovernance: any
    let factoryStub: sinon.SinonStub

    const uploadParams = {
      daoAddress: '0xdao1234567890123456789012345678901234567890' as HexAddress,
      capitalDistributorAddress: mockParams.pluginAddress,
      network: mockParams.network,
      rewards: [
        { address: '0xaddr1234567890123456789012345678901234567890', amount: '1000000000000000000' },
        { address: '0xaddr2234567890123456789012345678901234567890', amount: '2000000000000000000' },
      ],
    }

    beforeEach(() => {
      mockGovernance = {
        uploadMembersList: sandbox.stub(),
      }
      factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance)
    })

    it('should upload campaign members successfully', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: mockParams.pluginAddress,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      } as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const uploadResult = {
        success: true,
        message: 'Members list replaced successfully',
        totalInserted: 2,
        totalUpdated: 0,
        totalDeleted: 0,
        totalProcessed: 2,
        campaignId: 'draft-uuid-123',
      }
      mockGovernance.uploadMembersList.resolves(uploadResult)

      const result = await CapitalDistributorController.uploadCampaignMembers(uploadParams)

      expect(result.success).to.be.true
      expect(result.totalProcessed).to.eq(2)
      expect(result.campaignId).to.be.a('string')
      expect(factoryStub.calledOnce).to.be.true
      expect(mockGovernance.uploadMembersList.calledOnce).to.be.true
    })

    it('should throw error when plugin not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      await expect(CapitalDistributorController.uploadCampaignMembers(uploadParams)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.notFound,
      )
    })
  })

  describe('getCampaignPrepareStatus', () => {
    let mockGovernance: any
    let factoryStub: sinon.SinonStub

    const statusParams = {
      capitalDistributorAddress: mockParams.pluginAddress,
      network: mockParams.network,
      campaignId: 'draft-uuid-123',
    }

    beforeEach(() => {
      mockGovernance = {
        getMerkleGenerationStatus: sandbox.stub(),
      }
      factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance)
    })

    it('should get campaign prepare status successfully', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: mockParams.pluginAddress,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      } as any)

      const statusResult = {
        campaignId: 'draft-uuid-123',
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        merkleRoot: '0xabcdef123456',
        totalMembers: 10,
      }
      mockGovernance.getMerkleGenerationStatus.resolves(statusResult)

      const result = await CapitalDistributorController.getCampaignPrepareStatus(statusParams)

      expect(result).to.deep.eq(statusResult)
      expect(factoryStub.calledOnce).to.be.true
      expect(mockGovernance.getMerkleGenerationStatus.calledOnce).to.be.true
    })

    it('should return null when merkle data not ready', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: mockParams.pluginAddress,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      } as any)

      mockGovernance.getMerkleGenerationStatus.resolves(null)

      const result = await CapitalDistributorController.getCampaignPrepareStatus(statusParams)

      expect(result).to.be.null
    })

    it('should throw error when plugin not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(CapitalDistributorController.getCampaignPrepareStatus(statusParams)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.notFound,
      )

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
    })
  })
})
