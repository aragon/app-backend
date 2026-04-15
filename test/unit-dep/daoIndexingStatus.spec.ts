import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { EnumQueueName, IPluginInterfaceType, ITransactionIndexCheckType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { LogAdmin } from '@plugins/logAdmin'
import { LogDao } from '@plugins/logDao'
import { Models } from '@dbModels'
import TransactionController from '@api/controllers/transaction'
import { Interface } from 'ethers'
import { expect } from 'chai'
import PluginRepoMockData from '@test/unit-dep/mockData/pluginRepo.json'

describe('Integ: DAO create indexing status includes admin plugin member', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const txHash = '0x5f3f21bf0fbbfd8296dfe74575ce001e6feeeeb33366309c72a41c34b4976301'

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should return isProcessed=true after dao and admin plugin are indexed', async function () {
    this.timeout(1000000000)

    if (PluginRepoMockData[network]) {
      await Models.PluginRepo.insertMany(PluginRepoMockData[network])
    }

    sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (queue: string, job: any) => {
      if (queue === EnumQueueName.logDao) {
        const dao = await Models.Dao.findByAddress(job.params.address, job.params.network)
        if (dao) {
          await LogDao.start(dao)
        }
      }

      if (queue === EnumQueueName.plugins) {
        const plugin = await Models.Plugin.findByAddress(job.params.address, job.params.network)
        if (plugin?.interfaceType === IPluginInterfaceType.admin) {
          await LogAdmin.start(plugin)
        }
      }
    })

    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)

    const daoRegistryIface = new Interface(DAORegistry.abi)
    const pspIface = new Interface(PluginSetupProcessor.abi)

    const daoRegisteredLogs = Web3Utils.findLogsByName(receipt!, 'DAORegistered', DAORegistry.abi)
    for (const log of daoRegisteredLogs) {
      const event = Web3Utils.parseLog(log.txLog, daoRegistryIface)!
      const info = Web3Utils.parseInfoLog(log.txLog, 'DAORegistered', network)
      await DaoRegistryHandler.daoRegistered(event, info)
    }

    const installationPreparedLogs = Web3Utils.findLogsByName(
      receipt!,
      'InstallationPrepared',
      PluginSetupProcessor.abi,
    )
    for (const log of installationPreparedLogs) {
      const event = Web3Utils.parseLog(log.txLog, pspIface)!
      const info = Web3Utils.parseInfoLog(log.txLog, 'InstallationPrepared', network)
      await PluginSetupProcessorHandler.installationPrepared(event, info)
    }

    const installationAppliedLogs = Web3Utils.findLogsByName(receipt!, 'InstallationApplied', PluginSetupProcessor.abi)
    for (const log of installationAppliedLogs) {
      const event = Web3Utils.parseLog(log.txLog, pspIface)!
      const info = Web3Utils.parseInfoLog(log.txLog, 'InstallationApplied', network)
      await PluginSetupProcessorHandler.installationApplied(event, info)
    }

    const result = await TransactionController.getTransactionIndexingStatus(
      txHash,
      ITransactionIndexCheckType.DAO_CREATE,
      network,
    )

    expect(result.isProcessed).to.be.true
  })
})
