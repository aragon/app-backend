import { Models } from '@dbModels'
import { CampaignPrepareProgress, CampaignPrepareStatus, HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: CampaignPrepare', () => {
  let sandbox: SinonSandbox

  const testDaoAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const testCapitalDistributorAddress = '0x2222222222222222222222222222222222222222' as HexAddress
  const testGaugePluginAddress = '0x3333333333333333333333333333333333333333' as HexAddress
  const testTokenAddress = '0x4444444444444444444444444444444444444444' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('should create CampaignPrepare with default status and progress', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      expect(created.id).to.be.a('string')
      expect(created.id).to.include('prepare-')
      expect(created.daoAddress).to.equal(testDaoAddress)
      expect(created.network).to.equal(testNetwork)
      expect(created.status).to.equal(CampaignPrepareStatus.pending)
      expect(created.progress).to.equal(CampaignPrepareProgress.queued)
      expect(created.epochId).to.equal('')
      expect(created.totalMembers).to.equal(0)
    })

    it('should create with provided epochId', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
        epochId: '5',
      })

      expect(created.epochId).to.equal('5')
    })

    it('should generate unique prepareId with timestamp', async () => {
      const created1 = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      const created2 = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      expect(created1.id).to.not.equal(created2.id)
    })
  })

  describe('generatePrepareId', () => {
    it('should generate id with correct format', () => {
      const id = Models.CampaignPrepare.generatePrepareId({
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
      })

      expect(id).to.include('prepare-')
      expect(id).to.include(testNetwork)
      expect(id).to.include(testCapitalDistributorAddress)
    })
  })

  describe('findByPrepareId', () => {
    it('should find existing prepare by id', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      const found = await Models.CampaignPrepare.findByPrepareId(created.id)

      expect(found).to.exist
      expect(found!.id).to.equal(created.id)
    })

    it('should return null for non-existent id', async () => {
      const found = await Models.CampaignPrepare.findByPrepareId('non-existent-id')

      expect(found).to.be.null
    })
  })

  describe('findByDao', () => {
    it('should find all prepares for a DAO', async () => {
      await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest1',
      })

      await new Promise(resolve => setTimeout(resolve, 10))

      await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '2000000000000000000',
        metadataUri: 'ipfs://QmTest2',
      })

      const found = await Models.CampaignPrepare.findByDao(testDaoAddress, testNetwork)

      expect(found).to.have.lengthOf(2)
    })
  })

  describe('update', () => {
    it('should update status and progress', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      expect(created.status).to.equal(CampaignPrepareStatus.pending)
      expect(created.progress).to.equal(CampaignPrepareProgress.queued)

      await created.update({
        status: CampaignPrepareStatus.processing,
        progress: CampaignPrepareProgress.fetchingEpoch,
      })

      expect(created.status).to.equal(CampaignPrepareStatus.processing)
      expect(created.progress).to.equal(CampaignPrepareProgress.fetchingEpoch)
    })

    it('should update merkleRoot and totalMembers on completion', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      const testMerkleRoot = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

      await created.update({
        status: CampaignPrepareStatus.completed,
        progress: CampaignPrepareProgress.done,
        merkleRoot: testMerkleRoot,
        totalMembers: 100,
        epochId: '5',
      })

      expect(created.status).to.equal(CampaignPrepareStatus.completed)
      expect(created.progress).to.equal(CampaignPrepareProgress.done)
      expect(created.merkleRoot).to.equal(testMerkleRoot)
      expect(created.totalMembers).to.equal(100)
      expect(created.epochId).to.equal('5')
    })

    it('should not update required field with falsy value', async () => {
      const created = await Models.CampaignPrepare.create({
        daoAddress: testDaoAddress,
        network: testNetwork,
        capitalDistributorAddress: testCapitalDistributorAddress,
        gaugePluginAddress: testGaugePluginAddress,
        tokenAddress: testTokenAddress,
        totalAmount: '1000000000000000000',
        metadataUri: 'ipfs://QmTest',
      })

      const originalDaoAddress = created.daoAddress

      await created.update({
        daoAddress: null as any,
      })

      expect(created.daoAddress).to.equal(originalDaoAddress)
    })
  })

  describe('progress enum values', () => {
    it('should have all progress states defined', () => {
      expect(CampaignPrepareProgress.queued).to.equal('queued')
      expect(CampaignPrepareProgress.fetchingEpoch).to.equal('fetching_epoch')
      expect(CampaignPrepareProgress.validatingBalance).to.equal('validating_balance')
      expect(CampaignPrepareProgress.buildingRewards).to.equal('building_rewards')
      expect(CampaignPrepareProgress.uploadingMembers).to.equal('uploading_members')
      expect(CampaignPrepareProgress.generatingMerkle).to.equal('generating_merkle')
      expect(CampaignPrepareProgress.done).to.equal('done')
    })
  })
})
