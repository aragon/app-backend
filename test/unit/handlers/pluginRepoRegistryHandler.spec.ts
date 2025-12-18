import { Models } from '@dbModels'
import { PluginRepoRegistryHandler } from '@handlers/pluginRepoRegistryHandler'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
        transactionIndex: 1,
        logIndex: 1,
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
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1123213)

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(
        findTxHashSpy.calledWith({
          network: logInfo.network,
          logIndex: logInfo.logIndex,
          transactionIndex: logInfo.transactionIndex,
          transactionHash: logInfo.transactionHash,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const savedPluginRepoLog = await Models.PluginRepo.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
      })
      expect(!!savedPluginRepoLog).to.be.true

      expect(getBlockTimestampStub.calledOnce).to.eq(true)
      expect(savedPluginRepoLog.network).to.eq(logInfo.network)
      expect(savedPluginRepoLog.pluginRepo).to.eq(fakeEvent.args.pluginRepo)
      expect(savedPluginRepoLog.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedPluginRepoLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedPluginRepoLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(savedPluginRepoLog.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(savedPluginRepoLog.logIndex).to.eq(logInfo.logIndex)
    })

    it('should skip if log already exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
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
      sandbox.stub(Models.PluginRepo, 'findExistingLog').resolves(true)
      const stubCreate = sandbox.stub(Models.PluginRepo, 'create')

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      expect(stubCreate.notCalled).to.be.true
    })

    it('should handle when getBlockTimestamp returns null', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x789',
        address: '0x456',
        eventName: 'test',
      }

      const fakeEvent = {
        args: {
          pluginRepo: '0x789',
          subdomain: 'test2',
        },
      }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(0)

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      const savedPluginRepoLog = await Models.PluginRepo.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
      })

      expect(savedPluginRepoLog).to.exist
      expect(savedPluginRepoLog.blockTimestamp).to.be.undefined
    })

    it('should throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
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

      sandbox.stub(Models.PluginRepo, 'findExistingLog').rejects(new Error('fake-error'))
      const loggerStub = sandbox.stub(logger, 'error')

      await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, logInfo)

      expect(loggerStub.calledOnce).to.be.true
    })
  })
})
