import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import addProposalConditionAddressMigration from '@src/migrations/20250826140626-addProposalConditionAddress'
import { Models } from '@dbModels'
import logger from '@logger'
import { PluginList } from '@test/mock/fakePlugins'

describe('migration: addProposalConditionAddress', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('addProposalConditionAddressMigration with real database', () => {
    it('should successfully update plugins with proposalCreationCondition', async () => {
      // Create test plugins with different permission scenarios
      await Models.Plugin.create({
        ...PluginList[0],
        address: '0x1111111111111111111111111111111111111111',
        permissions: [
          {
            operation: 0,
            where: '0x1111111111111111111111111111111111111111',
            who: '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA',
            condition: '0x2222222222222222222222222222222222222222',
            permissionId: '0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90',
          },
        ],
        proposalCreationCondition: undefined,
      })

      await Models.Plugin.create({
        ...PluginList[1],
        address: '0x3333333333333333333333333333333333333333',
        permissions: [
          {
            operation: 0,
            where: '0x3333333333333333333333333333333333333333',
            who: '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA',
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: '0x' + 'other'.padStart(64, '0'),
          },
        ],
        proposalCreationCondition: undefined,
      })

      await Models.Plugin.create({
        ...PluginList[2],
        address: '0x4444444444444444444444444444444444444444',
        permissions: [],
        proposalCreationCondition: undefined,
      })

      // Run migration
      await addProposalConditionAddressMigration.start()

      // Verify logger calls
      const loggerInfo = logger.info as sinon.SinonStub
      expect(loggerInfo.calledWith('Starting migration')).to.be.true
      expect(loggerInfo.calledWith('Migration completed successfully')).to.be.true

      // Verify results
      const updatedPlugin1 = await Models.Plugin.findOne({
        address: '0x1111111111111111111111111111111111111111',
      })
      expect(updatedPlugin1?.proposalCreationCondition).to.equal('0x2222222222222222222222222222222222222222')

      const updatedPlugin2 = await Models.Plugin.findOne({
        address: '0x3333333333333333333333333333333333333333',
      })
      expect(updatedPlugin2?.proposalCreationCondition).to.equal('0x0000000000000000000000000000000000000000')

      const updatedPlugin3 = await Models.Plugin.findOne({
        address: '0x4444444444444444444444444444444444444444',
      })
      expect(updatedPlugin3?.proposalCreationCondition).to.equal('0x0000000000000000000000000000000000000000')
    })

    it('should handle plugins with multiple CREATE_PROPOSAL_PERMISSION entries', async () => {
      await Models.Plugin.create({
        ...PluginList[0],
        address: '0x5555555555555555555555555555555555555555',
        permissions: [
          {
            operation: 0,
            where: '0x5555555555555555555555555555555555555555',
            who: '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA',
            condition: '0x1111111111111111111111111111111111111111',
            permissionId: '0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90',
          },
          {
            operation: 0,
            where: '0x5555555555555555555555555555555555555555',
            who: '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA',
            condition: '0x2222222222222222222222222222222222222222',
            permissionId: '0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90',
          },
        ],
        proposalCreationCondition: undefined,
      })

      await addProposalConditionAddressMigration.start()

      const updatedPlugin = await Models.Plugin.findOne({
        address: '0x5555555555555555555555555555555555555555',
      })
      expect(updatedPlugin?.proposalCreationCondition).to.equal('0x1111111111111111111111111111111111111111')
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await addProposalConditionAddressMigration.stop()
    })
  })
})
