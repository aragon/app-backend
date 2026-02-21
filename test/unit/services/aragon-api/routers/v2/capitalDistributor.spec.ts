import CapitalDistributorController from '@api/controllers/capitalDistributor'
import CapitalDistributorRouter from '@api/routers/v2/capitalDistributor'
import * as errors from '@errors'
import ValidationSchema from '@helpers/validationSchema'
import UploadMiddleware from '@middlewares/upload'
import { ErrorKeyEnum, HexAddress, IUserCampaignStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: CapitalDistributor', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getCampaignsWithPagination', () => {
    it('Should get campaigns with pagination - all params', async () => {
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
            claimCount: 5,
          },
          {
            campaignId: 'campaign-002',
            title: 'Test Campaign 2',
            description: 'Description 2',
            active: true,
            claimCount: 2,
          },
        ],
      }

      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          status: 'claimable' as 'claimable',
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getCampaignsWithPagination')
        .resolves(mockResult as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          status: 'claimable',
          page: '1',
          pageSize: '10',
          sort: 'startTime',
          order: 'desc',
        },
      }

      await CapitalDistributorRouter.getCampaignsWithPagination(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.deep.eq(validationResult.paginationParams)
      expect(controllerStub.args[0][1]).to.deep.eq(validationResult.params)
    })

    it('Should get campaigns with pagination - required params only', async () => {
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
            claimCount: 0,
          },
        ],
      }

      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        extraParams: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getCampaignsWithPagination')
        .resolves(mockResult as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
        },
      }

      await CapitalDistributorRouter.getCampaignsWithPagination(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
    })

    it('Should pass correct validation schema', async () => {
      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          status: 'claimed' as 'claimed',
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      sandbox.stub(CapitalDistributorController, 'getCampaignsWithPagination').resolves({} as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          status: 'claimed',
        },
      }

      await CapitalDistributorRouter.getCampaignsWithPagination(ctx)

      expect(validationStub.calledOnce).to.be.true

      const validationArgs = validationStub.args[0]
      expect(validationArgs[0]).to.eq(ctx)
      expect(validationArgs[1].paginationSort).to.eq('startTime')
      expect(validationArgs[1].params!.pluginAddress).to.eq(ctx.query.pluginAddress)
      expect(validationArgs[1].params!.network).to.eq(ctx.query.network)
      expect(validationArgs[1].params!.userAddress).to.eq(ctx.query.userAddress)
      expect(validationArgs[1].params!.status).to.eq(ctx.query.status)
      expect(validationArgs[1].params!.onlyActive).to.eq(true)
      expect(validationArgs[1].schemas.params).to.exist
    })

    it('Should default onlyActive to true when not provided', async () => {
      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      sandbox.stub(CapitalDistributorController, 'getCampaignsWithPagination').resolves({} as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
        },
      }

      await CapitalDistributorRouter.getCampaignsWithPagination(ctx)

      const validationArgs = validationStub.args[0]
      expect(validationArgs[1].params!.onlyActive).to.eq(true)
    })

    it('Should set onlyActive to false when explicitly passed as false', async () => {
      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          onlyActive: false,
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      sandbox.stub(CapitalDistributorController, 'getCampaignsWithPagination').resolves({} as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          onlyActive: 'false',
        },
      }

      await CapitalDistributorRouter.getCampaignsWithPagination(ctx)

      const validationArgs = validationStub.args[0]
      expect(validationArgs[1].params!.onlyActive).to.eq(false)
    })

    it('Should handle validation errors', async () => {
      const validationError = new Error('Invalid pluginAddress')
      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').rejects(validationError)

      const ctx: any = {
        query: {
          pluginAddress: 'invalid-address',
          network: 'ethereum',
        },
      }

      await expect(CapitalDistributorRouter.getCampaignsWithPagination(ctx)).to.be.rejectedWith('Invalid pluginAddress')

      expect(validationStub.calledOnce).to.be.true
    })

    it('Should handle controller errors', async () => {
      const validationResult = {
        paginationParams: {
          page: 1,
          pageSize: 10,
          sort: 'startTime',
          order: 'desc',
        },
        extraParams: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      }

      const controllerError = new Error('Database connection failed')
      sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getCampaignsWithPagination')
        .rejects(controllerError)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
        },
      }

      await expect(CapitalDistributorRouter.getCampaignsWithPagination(ctx)).to.be.rejectedWith(
        'Database connection failed',
      )

      expect(controllerStub.calledOnce).to.be.true
    })
  })

  describe('getUserCampaignStatus', () => {
    it('Should get user campaign status successfully', async () => {
      const mockResult: IUserCampaignStatus = {
        totalClaimed: '1500000000000000000',
        totalClaimable: '2500000000000000000',
      }

      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox.stub(CapitalDistributorController, 'getUserCampaignStatus').resolves(mockResult)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
      }

      await CapitalDistributorRouter.getUserCampaignStatus(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.eq(validationResult.params.pluginAddress)
      expect(controllerStub.args[0][1]).to.eq(validationResult.params.network)
      expect(controllerStub.args[0][2]).to.eq(validationResult.params.userAddress)
    })

    it('Should pass correct validation schema', async () => {
      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      sandbox.stub(CapitalDistributorController, 'getUserCampaignStatus').resolves({} as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
      }

      await CapitalDistributorRouter.getUserCampaignStatus(ctx)

      expect(validationStub.calledOnce).to.be.true

      const validationArgs = validationStub.args[0]
      expect(validationArgs[0]).to.eq(ctx)
      expect(validationArgs[1].params!.pluginAddress).to.eq(ctx.query.pluginAddress)
      expect(validationArgs[1].params!.network).to.eq(ctx.query.network)
      expect(validationArgs[1].params!.userAddress).to.eq(ctx.query.userAddress)
      expect(validationArgs[1].schemas.params).to.exist
    })

    it('Should handle validation errors', async () => {
      const validationError = new Error('Invalid userAddress')
      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').rejects(validationError)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: 'invalid-address',
        },
      }

      await expect(CapitalDistributorRouter.getUserCampaignStatus(ctx)).to.be.rejectedWith('Invalid userAddress')

      expect(validationStub.calledOnce).to.be.true
    })

    it('Should handle controller errors', async () => {
      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
        },
      }

      const controllerError = new Error('Database query failed')
      sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getUserCampaignStatus')
        .rejects(controllerError)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
      }

      await expect(CapitalDistributorRouter.getUserCampaignStatus(ctx)).to.be.rejectedWith('Database query failed')

      expect(controllerStub.calledOnce).to.be.true
    })
  })

  describe('getUserCampaignReward', () => {
    it('Should get user campaign reward successfully', async () => {
      const mockResult = {
        exists: true,
        campaignId: 'campaign-001',
        userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        amount: '1000000000000000000',
        totalClaimed: '500000000000000000',
        claims: [
          {
            amount: '500000000000000000',
            timestamp: '1640995200',
            txHash: '0xabc123...',
          },
        ],
        proof: ['0x1234567890abcdef...', '0xfedcba0987654321...'],
        leaf: '0x9876543210fedcba...',
        isFullyClaimed: false,
      }

      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          campaignId: 'campaign-001',
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox.stub(CapitalDistributorController, 'getUserCampaignReward').resolves(mockResult)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          campaignId: 'campaign-001',
        },
      }

      await CapitalDistributorRouter.getUserCampaignReward(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.deep.eq({
        pluginAddress: validationResult.params.pluginAddress,
        network: validationResult.params.network,
        userAddress: validationResult.params.userAddress,
        campaignId: validationResult.params.campaignId,
      })
    })

    it('Should pass correct validation schema', async () => {
      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          campaignId: 'campaign-001',
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      sandbox.stub(CapitalDistributorController, 'getUserCampaignReward').resolves({} as any)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          campaignId: 'campaign-001',
        },
      }

      await CapitalDistributorRouter.getUserCampaignReward(ctx)

      expect(validationStub.calledOnce).to.be.true

      const validationArgs = validationStub.args[0]
      expect(validationArgs[0]).to.eq(ctx)
      expect(validationArgs[1].params!.pluginAddress).to.eq(ctx.query.pluginAddress)
      expect(validationArgs[1].params!.network).to.eq(ctx.query.network)
      expect(validationArgs[1].params!.userAddress).to.eq(ctx.query.userAddress)
      expect(validationArgs[1].params!.campaignId).to.eq(ctx.query.campaignId)
      expect(validationArgs[1].schemas.params).to.exist
    })

    it('Should handle validation errors', async () => {
      const validationError = new Error('Invalid campaignId')
      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').rejects(validationError)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          campaignId: '',
        },
      }

      await expect(CapitalDistributorRouter.getUserCampaignReward(ctx)).to.be.rejectedWith('Invalid campaignId')

      expect(validationStub.calledOnce).to.be.true
    })

    it('Should handle controller errors', async () => {
      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          campaignId: 'campaign-001',
        },
      }

      const controllerError = new Error('Campaign not found')
      sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getUserCampaignReward')
        .rejects(controllerError)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          campaignId: 'campaign-001',
        },
      }

      await expect(CapitalDistributorRouter.getUserCampaignReward(ctx)).to.be.rejectedWith('Campaign not found')

      expect(controllerStub.calledOnce).to.be.true
    })

    it('Should handle case when reward does not exist', async () => {
      const mockResult = {
        exists: false,
        campaignId: 'campaign-001',
        userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        amount: '0',
        totalClaimed: '0',
        claims: [],
        proof: [],
        leaf: null,
        isFullyClaimed: false,
      }

      const validationResult = {
        params: {
          pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress,
          campaignId: 'campaign-001',
        },
      }

      sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox.stub(CapitalDistributorController, 'getUserCampaignReward').resolves(mockResult)

      const ctx: any = {
        query: {
          pluginAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          campaignId: 'campaign-001',
        },
      }

      await CapitalDistributorRouter.getUserCampaignReward(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(ctx.body.exists).to.be.false
      expect(controllerStub.calledOnce).to.be.true
    })
  })

  describe('uploadCampaignMembers', () => {
    it('Should upload campaign members with file', async () => {
      const mockRewards = [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', amount: '1000000000000000000' },
        { address: '0x1234567890123456789012345678901234567890', amount: '2000000000000000000' },
      ]

      const mockResult = {
        success: true,
        totalInserted: 2,
        totalUpdated: 0,
        totalDeleted: 0,
        totalProcessed: 2,
        campaignId: 'draft-campaign-id',
      }

      const validationResult = {
        params: {
          daoAddress: '0xDAO1234567890123456789012345678901234567' as HexAddress,
          capitalDistributorAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      }

      const parseJsonFileStub = sandbox.stub(UploadMiddleware, 'parseJsonFile').returns(mockRewards)
      const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves()
      const validateRouteStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'uploadCampaignMembers')
        .resolves(mockResult as any)

      const ctx: any = {
        file: { buffer: Buffer.from(JSON.stringify(mockRewards)) },
        request: {
          body: {
            daoAddress: '0xDAO1234567890123456789012345678901234567',
            capitalDistributorAddress: '0x1234567890123456789012345678901234567890',
            network: 'ethereum',
          },
        },
      }

      await CapitalDistributorRouter.uploadCampaignMembers(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(parseJsonFileStub.calledOnce).to.be.true
      expect(validateParamsStub.calledOnce).to.be.true
      expect(validateRouteStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.deep.eq({
        ...validationResult.params,
        rewards: mockRewards,
      })
    })

    it('Should throw badParams when file data is not an array', async () => {
      const nonArrayData = { address: '0x123', amount: '100' }

      sandbox.stub(UploadMiddleware, 'parseJsonFile').returns(nonArrayData)
      const assertExposableStub = sandbox.stub(errors, 'assertExposable').throws(new Error('Bad params'))

      const ctx: any = {
        file: { buffer: Buffer.from(JSON.stringify(nonArrayData)) },
        request: {
          body: {
            daoAddress: '0xDAO1234567890123456789012345678901234567',
            capitalDistributorAddress: '0x1234567890123456789012345678901234567890',
            network: 'ethereum',
          },
        },
      }

      await expect(CapitalDistributorRouter.uploadCampaignMembers(ctx)).to.be.rejectedWith('Bad params')

      expect(assertExposableStub.calledOnce).to.be.true
      expect(assertExposableStub.args[0][0]).to.eq(false)
      expect(assertExposableStub.args[0][1]).to.eq(ErrorKeyEnum.badParams)
    })

    it('Should upload campaign members without file (empty rewards)', async () => {
      const mockResult = {
        success: true,
        totalInserted: 0,
        totalUpdated: 0,
        totalDeleted: 0,
        totalProcessed: 0,
        campaignId: 'draft-campaign-id',
      }

      const validationResult = {
        params: {
          daoAddress: '0xDAO1234567890123456789012345678901234567' as HexAddress,
          capitalDistributorAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      }

      const validateParamsStub = sandbox.stub(ValidationSchema, 'validateParams').resolves()
      const validateRouteStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'uploadCampaignMembers')
        .resolves(mockResult as any)

      const ctx: any = {
        request: {
          body: {
            daoAddress: '0xDAO1234567890123456789012345678901234567',
            capitalDistributorAddress: '0x1234567890123456789012345678901234567890',
            network: 'ethereum',
          },
        },
      }

      await CapitalDistributorRouter.uploadCampaignMembers(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validateParamsStub.calledOnce).to.be.true
      expect(validateRouteStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.deep.eq({
        ...validationResult.params,
        rewards: [],
      })
    })
  })

  describe('getCampaignPrepareStatus', () => {
    it('Should get campaign prepare status successfully', async () => {
      const mockResult = {
        campaignId: 'draft-campaign-id',
        pluginAddress: '0x1234567890123456789012345678901234567890',
        network: 'ethereum',
        merkleRoot: '0xabcdef1234567890',
        totalMembers: 10,
      }

      const validationResult = {
        params: {
          capitalDistributorAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
          network: NetworksEnum.ethereumMainnet,
          campaignId: 'draft-campaign-id',
        },
      }

      const validationStub = sandbox.stub(ValidationSchema, 'validateRoute').resolves(validationResult as any)
      const controllerStub = sandbox
        .stub(CapitalDistributorController, 'getCampaignPrepareStatus')
        .resolves(mockResult as any)

      const ctx: any = {
        query: {
          capitalDistributorAddress: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          campaignId: 'draft-campaign-id',
        },
      }

      await CapitalDistributorRouter.getCampaignPrepareStatus(ctx)

      expect(ctx.body).to.deep.eq(mockResult)
      expect(validationStub.calledOnce).to.be.true
      expect(controllerStub.calledOnce).to.be.true
      expect(controllerStub.args[0][0]).to.deep.eq(validationResult.params)
    })
  })

  describe('router', () => {
    it('Should return a router with all routes configured', () => {
      const router = CapitalDistributorRouter.router()

      expect(router).to.exist
      expect(router.stack).to.have.length(5)

      // Check campaigns route
      expect(router.stack[0].path).to.eq('/campaigns')
      expect(router.stack[0].methods).to.include('GET')

      // Check campaigns/stats route
      expect(router.stack[1].path).to.eq('/campaigns/stats')
      expect(router.stack[1].methods).to.include('GET')

      // Check campaign/reward route
      expect(router.stack[2].path).to.eq('/campaign/reward')
      expect(router.stack[2].methods).to.include('GET')

      // Check campaign/upload route
      expect(router.stack[3].path).to.eq('/campaign/upload')
      expect(router.stack[3].methods).to.include('POST')

      // Check campaign/prepare/status route
      expect(router.stack[4].path).to.eq('/campaign/prepare/status')
      expect(router.stack[4].methods).to.include('GET')
    })
  })
})
