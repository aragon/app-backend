import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { ErrorKeyEnum, NetworksEnum, HexAddress, IClaimStat, ITokenType } from '@types'
import { Models } from '@dbModels'
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
        extraParams,
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
})
