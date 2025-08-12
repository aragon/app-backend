import * as sinon from 'sinon'
import { expect } from 'chai'
import CapitalDistributorAdminRouter from '@services/aragon-admin-api/routers/capitalDistributor'
import CapitalDistributorAdminController from '@services/aragon-admin-api/controllers/capitalDistributor'
import ValidationSchema from '@helpers/validationSchema'

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
            rewards: [
              { address: '0xabc', amount: '1000' },
            ],
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
        rewards: [
          { address: '0xabc', amount: '1000' },
        ],
      }

      const controllerResult = {
        success: true,
        message: 'Members list uploaded successfully',
        totalMembers: 1,
        campaignId: 'campaign1',
      }

      sandbox.stub(ValidationSchema, 'validateParams')
        .onFirstCall().resolves(formattedParams)
        .onSecondCall().resolves(formattedBody)

      sandbox.stub(CapitalDistributorAdminController, 'uploadMembersList').resolves(controllerResult)

      await CapitalDistributorAdminRouter.uploadMembersList(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })
  })

  describe('syncMerkleTree', () => {
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
        message: 'Merkle tree synced successfully',
        merkleRoot: '0x123abc',
        totalMembers: 2,
        updatedMembers: 2,
        campaignId: 'campaign1',
      }

      sandbox.stub(ValidationSchema, 'validateParams').resolves(formattedParams)
      sandbox.stub(CapitalDistributorAdminController, 'syncMerkleTree').resolves(controllerResult)

      await CapitalDistributorAdminRouter.syncMerkleTree(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })
  })

  describe('getMembersList', () => {
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
        members: [
          {
            address: '0xabc',
            amount: '1000',
            claimedAmount: '0',
            remainingAmount: '1000',
            hasProof: true,
            hasLeaf: true,
            proofLength: 2,
          }
        ],
        total: 1,
        campaignId: 'campaign1',
      }

      sandbox.stub(ValidationSchema, 'validateParams').resolves(formattedParams)
      sandbox.stub(CapitalDistributorAdminController, 'getMembersList').resolves(controllerResult)

      await CapitalDistributorAdminRouter.getMembersList(mockCtx as any)

      expect(mockCtx.body).to.deep.equal(controllerResult)
    })
  })

  describe('router', () => {
    it('should create router with correct routes', () => {
      const router = CapitalDistributorAdminRouter.router()
      expect(router).to.exist
      
      // Check that router has the expected structure
      const stack = router.stack
      expect(stack).to.exist
      expect(stack.length).to.equal(3) // uploadMembersList, getMembersList, syncMerkleTree
    })
  })
})