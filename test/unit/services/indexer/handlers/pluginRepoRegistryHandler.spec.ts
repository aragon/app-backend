import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginRepoRegistryHandler } from '@services/indexer/handlers/pluginRepoRegistryHandler'
import { Models } from '@dbModels'

describe('Indexer: PluginRepoRegistryHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('pluginRepoRegistered', async () => {
    const network = NetworksEnum.mainnet

    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }

    const fakeEvent = {
      args: {
        pluginRepo: '0x456',
        subdomain: 'test',
      },
    }

    const findTxHashSpy = sandbox.spy(Models.LogPluginRepo, 'findTxHash')
    const loggerStub = sandbox.stub(logger, 'verbose')

    await PluginRepoRegistryHandler.pluginRepoRegistered(fakeEvent as any, txLog as any, network)

    expect(findTxHashSpy.calledOnce).to.be.true
    expect(findTxHashSpy.calledWith(txLog.transactionHash)).to.be.true
    expect(loggerStub.calledWith('New PluginRepoLog' as any)).to.be.true

    const savedPluginRepoLog = await Models.LogPluginRepo.findTxHash(txLog.transactionHash)
    expect(!!savedPluginRepoLog).to.be.true

    expect(savedPluginRepoLog.network).to.eq(network)
    expect(savedPluginRepoLog.pluginRepo).to.eq(fakeEvent.args.pluginRepo)
    expect(savedPluginRepoLog.subdomain).to.eq(fakeEvent.args.subdomain)
    expect(savedPluginRepoLog.blockNumber).to.eq(txLog.blockNumber)
    expect(savedPluginRepoLog.transactionHash).to.eq(txLog.transactionHash)
  })
})
