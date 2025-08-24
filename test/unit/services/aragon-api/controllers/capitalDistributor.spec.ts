import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { ErrorKeyEnum, NetworksEnum, HexAddress, IClaimStat, IUserCampaignStatus, IPluginInterfaceType } from '@types'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@src/governance'
import * as errors from '@errors'

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
})
