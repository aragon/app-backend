import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginRepoRegistryHandler } from '@services/aragon-indexer/handlers/pluginRepoRegistryHandler'
import { Models } from '@dbModels'

describe('Indexer: PluginRepoRegistryHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('pluginRepoRegistered', () => {
    it('should pluginRepoRegistered', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const fakeEvent = {
        args: {
          pluginRepo: '0x456',
          subdomain: 'test',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.PluginRepo, 'findExistingLog')
      const loggerStub = sandbox.stub(logger, 'verbose')

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(
        findTxHashSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          pluginRepo: fakeEvent.args.pluginRepo,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const savedPluginRepoLog = await Models.PluginRepo.findExistingLog({
        transactionHash: logInfo.transactionHash,
        pluginRepo: fakeEvent.args.pluginRepo,
      })
      expect(!!savedPluginRepoLog).to.be.true

      expect(savedPluginRepoLog.network).to.eq(logInfo.network)
      expect(savedPluginRepoLog.pluginRepo).to.eq(fakeEvent.args.pluginRepo)
      expect(savedPluginRepoLog.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedPluginRepoLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedPluginRepoLog.transactionHash).to.eq(logInfo.transactionHash)
    })

    it('pluginRepoRegistered throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.PluginRepo, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error PluginRepoRegister' as any)).to.be.true
    })
  })
})
