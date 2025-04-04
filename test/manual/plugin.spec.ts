import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IEventLogPluginType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'

describe('Manual: Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should fetch installationPrepared', async function () {
    this.timeout(1600000) // Increase timeout for the test

    sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
    await ProviderModule.connectToAllNetworks()

    const txReceipt = await Web3Helper.getTransactionReceipt(
      '0xdcff8f4477f3b39529de62394883707a2468d46bff3eb5e99335f5c49ec41f81',
      NetworksEnum.ethereumMainnet,
    )

    const installationPreparedLogs = Web3Utils.findLogsByName(
      txReceipt!,
      IEventLogPluginType.InstallationPrepared,
      PluginSetupProcessor.abi,
    )

    const logInfo = Web3Utils.parseInfoLog(
      installationPreparedLogs[0].txLog,
      IEventLogPluginType.InstallationPrepared,
      NetworksEnum.ethereumMainnet,
    )

    const iFace = new Interface(PluginSetupProcessor.abi)
    const event = Web3Utils.parseLog(installationPreparedLogs[0].txLog, iFace)!

    await PluginSetupProcessorHandler.installationPrepared(event, logInfo)
  })
})
