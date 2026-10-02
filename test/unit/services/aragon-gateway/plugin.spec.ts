import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import Plugin from '@services/aragon-gateway/plugin'
import { IEventLogPluginType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getInstallationData', () => {
    const pluginAddress = '0x1234567890123456789012345678901234567890'
    const network = NetworksEnum.ethereumMainnet
    const transactionHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    const setupLog = {
      transactionHash,
      network,
      logIndex: 7,
      preparedSetupId: '0xsetupId',
      event: IEventLogPluginType.InstallationPrepared,
    }

    it('should return null when plugin is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves({} as any)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when installation log is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(null)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when transaction receipt is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(setupLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when no matching log entries are found', async () => {
      const txReceipt = { logs: [] }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(setupLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when the receipt has the event only at another log index', async () => {
      const txReceipt = { logs: [] }
      const parsedLog = {
        parsed: { args: { preparedSetupId: '0xsetupId' } },
        txLog: { index: 8 },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(setupLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should successfully return installation data', async () => {
      const txReceipt = { logs: [] }

      // Create mock args with toObject and toArray methods
      const mockVersionTag = {
        toArray: () => [1, 2],
      }

      const mockHelpers = {
        toArray: () => ['0xhelper1', '0xhelper2'],
      }

      const mockPermissions = {
        toArray: () => ['permission1', 'permission2'],
      }

      const mockPreparedSetupData = {
        toObject: () => ({
          helpers: mockHelpers,
          permissions: mockPermissions,
        }),
        helpers: mockHelpers,
        permissions: mockPermissions,
      }

      const mockArgs = {
        plugin: pluginAddress,
        dao: '0xdaoAddress',
        preparedSetupId: '0xsetupId',
        versionTag: mockVersionTag,
        preparedSetupData: mockPreparedSetupData,
        toObject: () => ({
          plugin: pluginAddress,
          dao: '0xdaoAddress',
          preparedSetupId: '0xsetupId',
          versionTag: mockVersionTag,
          preparedSetupData: mockPreparedSetupData,
        }),
      }

      const parsedLog = {
        parsed: {
          args: mockArgs,
        },
        txLog: { index: 7 },
      }

      const expectedResult = '{"plugin":"0x1234567890123456789012345678901234567890"}'

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(setupLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])
      sandbox.stub(Utils, 'JSONStringifyCircular').returns(expectedResult)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.deep.equal(JSON.parse(expectedResult))
      expect(Utils.JSONStringifyCircular.calledOnce).to.be.true
    })

    it('should return the helpers and version of an applied update', async () => {
      const updateLog = { ...setupLog, event: IEventLogPluginType.UpdatePrepared }
      const toArray = (values: any[]) => ({ toArray: () => values })
      const args = {
        preparedSetupId: '0xsetupId',
        toObject: () => ({
          dao: '0xdaoAddress',
          preparedSetupId: '0xsetupId',
          versionTag: toArray([1, 3]),
          setupPayload: {
            toObject: () => ({
              plugin: pluginAddress,
              currentHelpers: toArray(['0xoldHelper']),
              data: '0x',
            }),
          },
          preparedSetupData: {
            toObject: () => ({ helpers: toArray([]), permissions: toArray([]) }),
          },
          initData: '0x',
        }),
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(updateLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)
      const findLogsByName = sandbox
        .stub(Web3Utils, 'findLogsByName')
        .returns([{ parsed: { args }, txLog: { index: 7 } } as any])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(findLogsByName.firstCall.args[1]).to.equal(IEventLogPluginType.UpdatePrepared)
      expect(result.plugin).to.equal(pluginAddress)
      expect(result.versionTag).to.deep.equal([1, 3])
      expect(result.preparedSetupData.helpers).to.deep.equal([])
      expect(result.setupPayload.currentHelpers).to.deep.equal(['0xoldHelper'])
    })

    it('should return null when there is an error processing the plugin data', async () => {
      const txReceipt = { logs: [] }

      // Create mock args that will throw an error
      const mockArgs = {
        plugin: pluginAddress,
        preparedSetupId: '0xsetupId',
        toObject: () => {
          throw new Error('Conversion error')
        },
      }

      const parsedLog = {
        parsed: {
          args: mockArgs,
        },
        txLog: { index: 7 },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Plugin, '_findAppliedSetupLog').resolves(setupLog as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('_findAppliedSetupLog', () => {
    const network = NetworksEnum.ethereumMainnet
    const daoAddress = '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
    const pluginAddress = '0x563Ebb4972bb6fABb1128c5895A31B6FAC2f6e14'
    const installId = '0x' + '1'.repeat(64)
    const updateId = '0x' + '2'.repeat(64)

    let logIndex = 0
    const seedLog = (
      event: IEventLogPluginType,
      blockNumber: number,
      preparedSetupId: string,
      plugin = pluginAddress,
    ) =>
      Models.LogPluginSetupProcessor.create({
        event,
        network,
        daoAddress,
        pluginAddress: plugin,
        preparedSetupId,
        blockNumber,
        transactionHash: '0x' + blockNumber.toString(16).padStart(64, '0'),
        transactionIndex: 0,
        logIndex: logIndex++,
      })

    const seedInstall = async (plugin = pluginAddress) => {
      await seedLog(IEventLogPluginType.InstallationPrepared, 100, installId, plugin)
      await seedLog(IEventLogPluginType.InstallationApplied, 101, installId, plugin)
    }

    it('should return the install preparation when nothing is applied yet', async () => {
      await seedLog(IEventLogPluginType.InstallationPrepared, 100, installId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log?.event).to.equal(IEventLogPluginType.InstallationPrepared)
    })

    it('should return the update preparation once the update is applied', async () => {
      await seedInstall()
      await seedLog(IEventLogPluginType.UpdatePrepared, 200, updateId)
      await seedLog(IEventLogPluginType.UpdateApplied, 201, updateId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log?.event).to.equal(IEventLogPluginType.UpdatePrepared)
      expect(log?.preparedSetupId).to.equal(updateId)
    })

    it('should ignore an update that is prepared but not applied', async () => {
      await seedInstall()
      await seedLog(IEventLogPluginType.UpdatePrepared, 200, updateId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log?.event).to.equal(IEventLogPluginType.InstallationPrepared)
    })

    it('should return the latest applied update when the plugin was updated twice', async () => {
      const secondUpdateId = '0x' + '4'.repeat(64)
      const pendingUpdateId = '0x' + '5'.repeat(64)
      await seedInstall()
      await seedLog(IEventLogPluginType.UpdatePrepared, 200, updateId)
      await seedLog(IEventLogPluginType.UpdateApplied, 201, updateId)
      await seedLog(IEventLogPluginType.UpdatePrepared, 300, secondUpdateId)
      await seedLog(IEventLogPluginType.UpdateApplied, 301, secondUpdateId)
      await seedLog(IEventLogPluginType.UpdatePrepared, 400, pendingUpdateId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log?.preparedSetupId).to.equal(secondUpdateId)
    })

    it('should return each plugin its own preparation when two updates share a setup id', async () => {
      const otherPlugin = '0x4CD6c5eEA22Aa897341C5b051E496B8861b29678'
      await seedInstall()
      await seedInstall(otherPlugin)
      await seedLog(IEventLogPluginType.UpdatePrepared, 200, updateId)
      await seedLog(IEventLogPluginType.UpdateApplied, 201, updateId)
      await seedLog(IEventLogPluginType.UpdatePrepared, 300, updateId, otherPlugin)
      await seedLog(IEventLogPluginType.UpdateApplied, 301, updateId, otherPlugin)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)
      const otherLog = await Plugin._findAppliedSetupLog(otherPlugin, network)

      expect(log?.pluginAddress).to.equal(pluginAddress)
      expect(log?.blockNumber).to.equal(200)
      expect(otherLog?.pluginAddress).to.equal(otherPlugin)
      expect(otherLog?.blockNumber).to.equal(300)
    })

    it('should return null when the applied update has no preparation', async () => {
      await seedInstall()
      await seedLog(IEventLogPluginType.UpdateApplied, 201, updateId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log).to.be.null
    })

    it('should return the last applied update of an uninstalled plugin', async () => {
      const uninstallId = '0x' + '3'.repeat(64)
      await seedInstall()
      await seedLog(IEventLogPluginType.UpdatePrepared, 200, updateId)
      await seedLog(IEventLogPluginType.UpdateApplied, 201, updateId)
      await seedLog(IEventLogPluginType.UninstallationPrepared, 300, uninstallId)
      await seedLog(IEventLogPluginType.UninstallationApplied, 301, uninstallId)

      const log = await Plugin._findAppliedSetupLog(pluginAddress, network)

      expect(log?.event).to.equal(IEventLogPluginType.UpdatePrepared)
    })
  })

  describe('getGaugeEpochId', () => {
    const pluginAddress = '0x9999999999999999999999999999999999999990'
    const network = NetworksEnum.ethereumMainnet
    const epochId = '5'

    it('should return epochId from GaugeHelper', async () => {
      const getGaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(epochId)

      const result = await Plugin.getGaugeEpochId(pluginAddress, network)

      expect(result).to.equal(epochId)
      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledWith(pluginAddress, network)).to.be.true
    })

    it('should handle different epochId values', async () => {
      const differentEpochId = '100'
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(differentEpochId)

      const result = await Plugin.getGaugeEpochId(pluginAddress, network)

      expect(result).to.equal(differentEpochId)
    })

    it('should handle different networks', async () => {
      const arbitrumNetwork = NetworksEnum.arbitrumMainnet
      const getGaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(epochId)

      const result = await Plugin.getGaugeEpochId(pluginAddress, arbitrumNetwork)

      expect(result).to.equal(epochId)
      expect(getGaugeEpochIdStub.calledWith(pluginAddress, arbitrumNetwork)).to.be.true
    })

    it('should propagate errors from GaugeHelper', async () => {
      const error = new Error('Gauge connection error')
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').rejects(error)

      try {
        await Plugin.getGaugeEpochId(pluginAddress, network)
        expect.fail('Should have thrown an error')
      } catch (err: any) {
        expect(err).to.equal(error)
        expect(err.message).to.equal('Gauge connection error')
      }
    })

    it('should handle null/undefined return from GaugeHelper', async () => {
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(null as any)

      const result = await Plugin.getGaugeEpochId(pluginAddress, network)

      expect(result).to.be.null
    })
  })
})
