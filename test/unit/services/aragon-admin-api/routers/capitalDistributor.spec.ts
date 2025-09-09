import * as sinon from 'sinon'
import { expect } from 'chai'
import CapitalDistributorAdminRouter from '@services/aragon-admin-api/routers/capitalDistributor'
import { CapitalDistributorAdminController } from '@services/aragon-admin-api/controllers/capitalDistributor'
import ValidationSchema from '@helpers/validationSchema'
import UploadMiddleware from '@middlewares/upload'
import * as errors from '@errors'
import { ErrorKeyEnum } from '@types'

describe('Router: CapitalDistributorAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('uploadMembersList', () => {
    it('should validate params and call controller', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        request: {
          body: {
            rewards: [{ address: '0xabc', amount: '1000' }],
          },
        },
        body: null,
      }

      const formattedParams = {
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: 'ethereumMainnet',
      }

      const formattedBody = {
        rewards: [{ address: '0xabc', amount: '1000' }],
      }

      const controllerResult = {
        success: true,
        message: 'Members list uploaded successfully',
        totalMembers: 1,
        campaignId: 'campaign1',
      }

      sandbox
        .stub(ValidationSchema, 'validateParams')
        .onFirstCall()
        .resolves(formattedParams)
        .onSecondCall()
        .resolves(formattedBody)

      sandbox.stub(CapitalDistributorAdminController, 'uploadMembersList').resolves(controllerResult)

      await CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })

    it('should handle file upload and validate file data', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        file: {
          buffer: Buffer.from('test file content'),
          mimetype: 'application/json',
        },
        body: null,
      }

      const fileData = [{ address: '0xabc', amount: '1000' }]
      const formattedParams = {
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: 'ethereumMainnet',
      }

      const controllerResult = {
        success: true,
        message: 'Members list uploaded successfully',
        totalMembers: 1,
        campaignId: 'campaign1',
      }

      sandbox.stub(UploadMiddleware, 'parseJsonFile').returns(fileData)
      sandbox.stub(ValidationSchema, 'validateParams').resolves(formattedParams)
      sandbox.stub(CapitalDistributorAdminController, 'uploadMembersList').resolves(controllerResult)

      await CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })

    it('should throw error when file data is not an array', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        file: {
          buffer: Buffer.from('invalid file content'),
          mimetype: 'application/json',
        },
        body: null,
      }

      const invalidFileData = { invalid: 'data' } // Not an array
      sandbox.stub(UploadMiddleware, 'parseJsonFile').returns(invalidFileData)
      sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.badParams))

      await expect(CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.badParams,
      )
    })

    it('should handle validation errors for request body', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        request: {
          body: {
            rewards: 'invalid_rewards', // Invalid format
          },
        },
        body: null,
      }

      const validationError = new Error('Validation failed')
      sandbox.stub(ValidationSchema, 'validateParams').onFirstCall().throws(validationError)

      await expect(CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)).to.be.rejectedWith(
        Error,
        'Validation failed',
      )
    })

    it('should handle validation errors for params', async () => {
      const mockCtx = {
        params: {
          campaignId: '', // Invalid empty campaign ID
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        request: {
          body: {
            rewards: [{ address: '0xabc', amount: '1000' }],
          },
        },
        body: null,
      }

      const formattedBody = {
        rewards: [{ address: '0xabc', amount: '1000' }],
      }

      const validationError = new Error('Invalid campaign ID')
      sandbox
        .stub(ValidationSchema, 'validateParams')
        .onFirstCall()
        .resolves(formattedBody)
        .onSecondCall()
        .throws(validationError)

      await expect(CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)).to.be.rejectedWith(
        Error,
        'Invalid campaign ID',
      )
    })
  })

  describe('generateMerkleData', () => {
    it('should validate params and call controller', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        body: null,
      }

      const formattedParams = {
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: 'ethereumMainnet',
      }

      const controllerResult = {
        success: true,
        merkleRoot: '0x123abc',
        totalMembers: 2,
        updatedMembers: 2,
        campaignId: 'campaign1',
      }

      sandbox.stub(ValidationSchema, 'validateParams').resolves(formattedParams)
      sandbox.stub(CapitalDistributorAdminController, 'generateMerkleData').resolves(controllerResult)

      await CapitalDistributorAdminRouter.generateMerkleData(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })

    it('should handle validation errors for generateMerkleData', async () => {
      const mockCtx = {
        params: {
          campaignId: '', // Invalid empty campaign ID
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        body: null,
      }

      const validationError = new Error('Invalid campaign parameters')
      sandbox.stub(ValidationSchema, 'validateParams').throws(validationError)

      await expect(CapitalDistributorAdminRouter.generateMerkleData(mockCtx as any)).to.be.rejectedWith(
        Error,
        'Invalid campaign parameters',
      )
    })
  })

  describe('getCampaignDetails', () => {
    it('should validate params and call controller', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: 'ethereumMainnet',
        },
        body: null,
      }

      const formattedParams = {
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: 'ethereumMainnet',
      }

      const controllerResult = {
        membersCount: 2,
        campaignId: 'campaign1',
        root: '0xmerkleroot123', // Change from merkleRoot to root
      }

      sandbox.stub(ValidationSchema, 'validateParams').resolves(formattedParams)
      sandbox.stub(CapitalDistributorAdminController, 'getCampaignDetails').resolves(controllerResult)

      await CapitalDistributorAdminRouter.getCampaignDetails(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })

    it('should handle validation errors for getCampaignDetails', async () => {
      const mockCtx = {
        params: {
          campaignId: 'campaign1',
          pluginAddress: 'invalid_address', // Invalid plugin address
          network: 'ethereumMainnet',
        },
        body: null,
      }

      const validationError = new Error('Invalid plugin address')
      sandbox.stub(ValidationSchema, 'validateParams').throws(validationError)

      await expect(CapitalDistributorAdminRouter.getCampaignDetails(mockCtx as any)).to.be.rejectedWith(
        Error,
        'Invalid plugin address',
      )
    })
  })

  describe('router', () => {
    it('should create router with correct routes', () => {
      const router = CapitalDistributorAdminRouter.router()
      expect(router).to.exist

      // Check that router has the expected structure
      const stack = router.stack
      expect(stack).to.exist
      expect(stack.length).to.equal(4)
    })
  })
})
