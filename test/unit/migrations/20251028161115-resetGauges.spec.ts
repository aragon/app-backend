import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import resetGaugesMigration from '@src/migrations/20251028161115-resetGauges'
import { NetworksEnum, IPluginInterfaceType, IPluginStatus, EnumQueueName } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ConfigIndexerHelper from '@helpers/configIndexer'

describe('migration: resetGauges', () => {
  let sandbox: SinonSandbox
  let sendMessageStub: SinonStub
  let gaugeSettingsStub: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    gaugeSettingsStub = sandbox.stub(PluginSettingHandler, 'gaugeSettings').resolves()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should reset gauge plugin data and send RabbitMQ message', async () => {
      // Arrange - Create real data in database
      const plugin = await Models.Plugin.create({
        address: '0x1234567890aBcDeF1234567890AbcDef12345678',
        daoAddress: '0xabCDef1234567890abCdEF1234567890ABcDeF12',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.gauge,
        status: IPluginStatus.installed,
        tokenAddress: '0xTokenAddress123',
        blockNumber: 1000,
        transactionHash: '0xabc123',
      })

      await Models.Gauge.create({
        pluginAddress: plugin.address,
        network: plugin.network,
        address: '0xGauge1',
        creatorAddress: '0xCreator1',
        transactionHash: '0xtxHash1',
      })

      await Models.GaugeMetrics.create({
        pluginAddress: plugin.address,
        network: plugin.network,
        gaugeAddress: '0xGauge1',
        epoch: 1,
        epochId: 'epoch-1',
      })

      await Models.VoteGauge.create({
        pluginAddress: plugin.address,
        network: plugin.network,
        voter: '0xVoter1',
        transactionHash: '0xVoteTxHash',
        transactionIndex: 0,
        logIndex: 0,
        epochId: 'epoch-1',
        memberAddress: '0xVoter1',
        gaugeAddress: '0xGauge1',
        blockNumber: 1001,
      })

      await Models.ConfigIndexer.create({
        service: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
        blockNumber: 1000,
        network: plugin.network,
      })

      // Act
      await resetGaugesMigration.start()

      // Assert - Verify all data was deleted
      const remainingGauges = await Models.Gauge.find({ pluginAddress: plugin.address })
      const remainingMetrics = await Models.GaugeMetrics.find({ pluginAddress: plugin.address })
      const remainingVotes = await Models.VoteGauge.find({ pluginAddress: plugin.address })
      const remainingConfig = await Models.ConfigIndexer.find({
        service: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      })

      expect(remainingGauges).to.have.lengthOf(0)
      expect(remainingMetrics).to.have.lengthOf(0)
      expect(remainingVotes).to.have.lengthOf(0)
      expect(remainingConfig).to.have.lengthOf(0)

      // Verify RabbitMQ message was sent
      expect(sendMessageStub.calledOnce).to.be.true
      expect(sendMessageStub.firstCall.args).to.deep.equal([
        EnumQueueName.plugins,
        {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network },
        },
      ])

      // Verify gauge settings was called
      expect(gaugeSettingsStub.calledOnce).to.be.true
    })

    it('should log error when reset fails', async () => {
      // Arrange
      const loggerErrorStub = sandbox.stub(logger, 'error')
      await Models.Plugin.create({
        address: '0x1234567890aBcDeF1234567890AbcDef12345678',
        daoAddress: '0xabCDef1234567890abCdEF1234567890ABcDeF12',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.gauge,
        status: IPluginStatus.installed,
        tokenAddress: '0xTokenAddress123',
        blockNumber: 1000,
        transactionHash: '0xabc123',
      })

      // Make gaugeSettings throw an error to trigger the reset error
      gaugeSettingsStub.rejects(new Error('Gauge settings failed'))

      // Act
      await resetGaugesMigration.start()

      // Assert - Verify error was logged
      const errorCalls = loggerErrorStub.getCalls()
      const resetErrorCall = errorCalls.find(call => String(call.args[0]) === 'Migration reset error')
      expect(resetErrorCall).to.exist
    })

    it('should log error when fails', async () => {
      // Arrange
      const loggerErrorStub = sandbox.stub(logger, 'error')

      // Make Plugin.find fail
      sandbox.stub(Models.Plugin, 'find').rejects(new Error('Database error'))

      // Act & Assert
      await expect(resetGaugesMigration.start()).to.be.rejectedWith('Database error')
      const errorCalls = loggerErrorStub.getCalls()
      const failedErrorCall = errorCalls.find(call => String(call.args[0]) === 'Migration failed')
      expect(failedErrorCall).to.exist
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await resetGaugesMigration.stop()
      expect(true).to.be.true
    })
  })
})
