import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Plugin from '@services/aragon-dao/plugin'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
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
      const logArgs = {
        plugin: pluginAddress,
        dao: '0xdaoAddress',
        preparedSetupId: '0xsetupId',
        versionTag: { release: 1, build: 2 },
      }

      const parsedLog = {
        parsed: {
          args: logArgs,
        },
      }

      const expectedJson = '{"plugin":"0x1234567890123456789012345678901234567890"}'

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({})
      sandbox.stub(Models.LogPluginSetupProcessor, 'findOne').resolves(installationLog)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([parsedLog as any])
      sandbox.stub(Utils, 'JSONStringifyCircular').returns(expectedJson)
      sandbox.stub(Utils, 'deepConvertToObject').returns(logArgs)

      const result = await Plugin.getInstallationData(pluginAddress, network)

      expect(result).to.equal(expectedJson)
      expect(Utils.deepConvertToObject.calledWith(logArgs)).to.be.true
      expect(Utils.JSONStringifyCircular.calledOnce).to.be.true
    })
  })
})
