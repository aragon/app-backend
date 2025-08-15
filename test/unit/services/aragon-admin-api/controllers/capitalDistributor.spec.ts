import * as sinon from 'sinon'
import { expect } from 'chai'
import CapitalDistributorAdminController from '@services/aragon-admin-api/controllers/capitalDistributor'
import { Models } from '@dbModels'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import * as errors from '@errors'

describe('Controller: CapitalDistributorAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('uploadMembersList', () => {
    it('should upload members list successfully', async () => {
      const fakeCampaign = { id: 'campaign1' }
      const insertResult = [
        { userAddress: '0xabc', amount: '1000' },
        { userAddress: '0xdef', amount: '2000' },
      ]

      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'countDocuments').resolves(0)
      sandbox.stub(Models.CampaignReward, 'deleteMany').resolves({ deletedCount: 0 })
      sandbox.stub(Models.CampaignReward, 'insertMany').resolves(insertResult)

      const result = await CapitalDistributorAdminController.uploadMembersList({
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
        rewards: [
          { address: '0xabc', amount: '1000' },
          { address: '0xdef', amount: '2000' },
        ],
      })

      expect(result).to.deep.equal({
        success: true,
        message: 'Members list uploaded successfully',
        totalMembers: 2,
        campaignId: 'campaign1',
      })
    })

    it('should throw error if campaign is not found', async () => {
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorAdminController.uploadMembersList({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
          rewards: [{ address: '0xabc', amount: '1000' }],
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.calledOnce).to.be.true
    })

    it('should throw error if members have claiming history', async () => {
      const fakeCampaign = { id: 'campaign1' }
      
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'countDocuments').resolves(1)

      await expect(
        CapitalDistributorAdminController.uploadMembersList({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
          rewards: [{ address: '0xabc', amount: '1000' }],
        }),
      ).to.be.rejectedWith('Cannot upload new members list: 1 members have claiming history')
    })
  })

  describe('syncMerkleTree', () => {
    it('should sync merkle tree successfully', async () => {
      const fakeCampaign = { 
        id: 'campaign1',
        updateMerkleRoot: sandbox.stub().resolves()
      }
      const fakeMembers = [
        { userAddress: '0xabc', amount: '1000' },
        { userAddress: '0xdef', amount: '2000' },
      ]

      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'countDocuments').resolves(0)
      sandbox.stub(Models.CampaignReward, 'find').returns({ lean: () => Promise.resolve(fakeMembers) })
      sandbox.stub(Models.CampaignReward, 'bulkWrite').resolves({ modifiedCount: 2 })

      const result = await CapitalDistributorAdminController.generateMerkleData({
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message', 'Merkle tree synced successfully')
      expect(result).to.have.property('totalMembers', 2)
      expect(result).to.have.property('merkleRoot')
    })

    it('should throw error if no members found', async () => {
      const fakeCampaign = { id: 'campaign1' }

      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'countDocuments').resolves(0)
      sandbox.stub(Models.CampaignReward, 'find').returns({ lean: () => Promise.resolve([]) })

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith('No members found to sync merkle tree')
    })

    it('should throw error if members have claiming history', async () => {
      const fakeCampaign = { id: 'campaign1' }

      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'countDocuments').resolves(1)

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith('Cannot sync merkle tree: 1 members have claiming history')
    })
  })

  describe('getMembersList', () => {
    it('should retrieve members list with claim status', async () => {
      const fakeCampaign = { id: 'campaign1' }
      const fakeMembers = [
        { 
          userAddress: '0xabc', 
          amount: '1000',
          claims: [{ claimedAmount: '100' }],
          proof: ['0x123', '0x456'],
          leaf: '0xleaf123'
        },
        { 
          userAddress: '0xdef', 
          amount: '2000',
          claims: [],
          proof: ['0x789'],
          leaf: '0xleaf456'
        },
      ]

      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(fakeCampaign)
      sandbox.stub(Models.CampaignReward, 'find').returns({
        select: () => ({ lean: () => Promise.resolve(fakeMembers) })
      })

      const result = await CapitalDistributorAdminController.getMembersList({
        campaignId: 'campaign1',
        pluginAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.property('members')
      expect(result.members).to.have.length(2)
      expect(result.members[0]).to.deep.equal({
        address: '0xabc',
        amount: '1000',
        claimedAmount: '100',
        remainingAmount: '900',
        hasProof: true,
        hasLeaf: true,
        proofLength: 2,
      })
      expect(result.members[1]).to.deep.equal({
        address: '0xdef',
        amount: '2000',
        claimedAmount: '0',
        remainingAmount: '2000',
        hasProof: true,
        hasLeaf: true,
        proofLength: 1,
      })
    })
  })
})