import { Models } from '@dbModels'
import logger from '@logger'
import markCrossChainControllerSupportedMigration from '@src/migrations/20260831194214-markCrossChainControllerSupported'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: markCrossChainControllerSupported', () => {
  const network = NetworksEnum.ethereumMainnet

  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const seedPlugin = async (
    address: string,
    interfaceType: IPluginInterfaceType,
    isSupported: boolean,
  ): Promise<void> => {
    await Models.Plugin.create({
      address,
      daoAddress: '0xabCDef1234567890abCdEF1234567890ABcDeF12',
      network,
      interfaceType,
      status: IPluginStatus.installed,
      isSupported,
      blockNumber: 1000,
      transactionHash: '0xabc123',
    })
  }

  describe('start', () => {
    it('marks unsupported crossChainController plugins as supported', async () => {
      await seedPlugin('0xA000000000000000000000000000000000000001', IPluginInterfaceType.crossChainController, false)
      await seedPlugin('0xA000000000000000000000000000000000000002', IPluginInterfaceType.crossChainController, false)

      await markCrossChainControllerSupportedMigration.start()

      const plugins = await Models.Plugin.collection
        .find({ interfaceType: IPluginInterfaceType.crossChainController })
        .toArray()
      expect(plugins).to.have.lengthOf(2)
      for (const plugin of plugins) {
        expect(plugin.isSupported).to.be.true
      }
    })

    it('leaves plugins of other interface types untouched', async () => {
      await seedPlugin('0xA000000000000000000000000000000000000003', IPluginInterfaceType.tokenVoting, false)
      await seedPlugin('0xA000000000000000000000000000000000000004', IPluginInterfaceType.crossChainController, false)

      await markCrossChainControllerSupportedMigration.start()

      const untouched = await Models.Plugin.collection.findOne({
        address: '0xA000000000000000000000000000000000000003',
      })
      expect(untouched!.isSupported).to.be.false

      const updated = await Models.Plugin.collection.findOne({
        address: '0xA000000000000000000000000000000000000004',
      })
      expect(updated!.isSupported).to.be.true
    })

    it('completes cleanly when there is nothing to migrate', async () => {
      await seedPlugin('0xA000000000000000000000000000000000000005', IPluginInterfaceType.crossChainController, true)

      await markCrossChainControllerSupportedMigration.start()

      const plugin = await Models.Plugin.collection.findOne({
        address: '0xA000000000000000000000000000000000000005',
      })
      expect(plugin!.isSupported).to.be.true
    })

    it('logs error and rethrows when the update fails', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin.collection, 'updateMany').rejects(new Error('Database error'))

      await expect(markCrossChainControllerSupportedMigration.start()).to.be.rejectedWith('Database error')
      const failedErrorCall = loggerErrorStub.getCalls().find(call => String(call.args[0]) === 'Migration failed')
      expect(failedErrorCall).to.exist
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await markCrossChainControllerSupportedMigration.stop()
      expect(true).to.be.true
    })
  })
})
