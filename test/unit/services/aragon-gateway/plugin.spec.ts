import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Plugin from '@services/aragon-gateway/plugin'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import GaugeHelper from '@helpers/gauge'
import { expect } from 'chai'
import { IEventLogPluginType, NetworksEnum } from '@types'
import Utils from '@helpers/utils'

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

    it('should return null when plugin is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves({})

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when installation log is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(null)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when transaction receipt is not found', async () => {
      const installationLog = {
        transactionHash,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when no matching log entries are found', async () => {
      const installationLog = {
        transactionHash,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }

      const txReceipt = { logs: [] }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should return null when plugin log is not found', async () => {
      const installationLog = {
        transactionHash,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }

      const txReceipt = { logs: [] }
      const parsedLog = {
        parsed: {
          args: {
            plugin: '0xdifferentAddress',
          },
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })

    it('should successfully return installation data', async () => {
      const installationLog = {
        transactionHash,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }

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
      }

      const expectedResult = '{"plugin":"0x1234567890123456789012345678901234567890"}'

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])
      sandbox.stub(Utils, 'JSONStringifyCircular').returns(expectedResult)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.deep.equal(JSON.parse(expectedResult))
      expect(Utils.JSONStringifyCircular.calledOnce).to.be.true
    })

    it('should return null when there is an error processing the plugin data', async () => {
      const installationLog = {
        transactionHash,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }

      const txReceipt = { logs: [] }

      // Create mock args that will throw an error
      const mockArgs = {
        plugin: pluginAddress,
        toObject: () => {
          throw new Error('Conversion error')
        },
      }

      const parsedLog = {
        parsed: {
          args: mockArgs,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.be.null
    })
  })

  describe('getGaugeEpochId', () => {
    const pluginAddress = '0x9999999999999999999999999999999999999990'
    const network = NetworksEnum.ethereumMainnet
    const epochId = '5'

    it('should return epochId from Web3Helper', async () => {
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

    it('should propagate errors from Web3Helper', async () => {
      const error = new Error('Web3 connection error')
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').rejects(error)

      try {
        await Plugin.getGaugeEpochId(pluginAddress, network)
        expect.fail('Should have thrown an error')
      } catch (err: any) {
        expect(err).to.equal(error)
        expect(err.message).to.equal('Web3 connection error')
      }
    })

    it('should handle null/undefined return from Web3Helper', async () => {
      sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(null as any)

      const result = await Plugin.getGaugeEpochId(pluginAddress, network)

      expect(result).to.be.null
    })
  })
})
