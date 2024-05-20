import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogPluginType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSetupProcessorHandler } from '@services/indexer/handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'

describe('Indexer: PluginSetupProcessorHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('installationApplied', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        metadata: 'fake-metadata',
        dao: '0x456',
        preparedSetupId: '0x453',
        appliedSetupId: '0x452',
        plugin: '0x450',
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.InstallationApplied)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New InstallationApplied' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.InstallationApplied,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationApplied)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
  })

  it('installationPrepared', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        preparedSetupData: {
          helpers: ['0x27366cae2b9c6c3055e9e3c78936a69006be5400'],
          permissions: [
            {
              operation: 1,
              where: 'some-where',
              who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
              condition: 'some-conditions',
              permissionId: 'xxx',
            },
          ],
        },
        dao: '0x456',
        sender: '0x450',
        preparedSetupId: '0x453',
        pluginSetupRepo: '0x452',
        plugin: '0x450',
        versionTag: {
          release: '1',
          build: '1',
        },
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.InstallationPrepared)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New InstallationPrepared' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.InstallationPrepared,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationPrepared)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
    expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
    expect(daoMetadataDB.tokenAddress).to.eq('0x27366cae2b9c6c3055e9e3c78936a69006be5400')
  })

  it('uninstallationApplied', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        metadata: 'fake-metadata',
        dao: '0x456',
        preparedSetupId: '0x453',
        plugin: '0x450',
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UninstallationApplied)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New UninstallationApplied' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.UninstallationApplied,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationApplied)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
  })

  it('uninstallationPrepared', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        preparedSetupData: {
          permissions: [
            {
              operation: 1,
              where: 'some-where',
              who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
              condition: 'some-conditions',
              permissionId: 'xxx',
            },
          ],
        },
        dao: '0x456',
        sender: '0x450',
        preparedSetupId: '0x453',
        pluginSetupRepo: '0x452',
        plugin: '0x450',
        versionTag: {
          release: '1',
          build: '1',
        },
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UninstallationPrepared)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New UninstallationPrepared' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.UninstallationPrepared,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationPrepared)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
    expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
  })

  it('updateApplied', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        metadata: 'fake-metadata',
        dao: '0x456',
        preparedSetupId: '0x453',
        appliedSetupId: '0x451',
        plugin: '0x450',
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UpdateApplied)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New UpdateApplied' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.UpdateApplied,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdateApplied)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
  })

  it('updatePrepared', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        preparedSetupData: {
          permissions: [
            {
              operation: 1,
              where: 'some-where',
              who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
              condition: 'some-conditions',
              permissionId: 'xxx',
            },
          ],
        },
        dao: '0x456',
        sender: '0x450',
        preparedSetupId: '0x453',
        pluginSetupRepo: '0x452',
        setupPayload: {
          plugin: '0x450',
        },
        versionTag: {
          release: '1',
          build: '1',
        },
      },
    }

    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

    await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UpdatePrepared)).to.be.true
    expect(loggerStub.calledTwice).to.be.true
    expect(loggerStub.calledWith('New UpdatePrepared' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
      txLog.transactionHash,
      IEventLogPluginType.UpdatePrepared,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdatePrepared)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
    expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.setupPayload.plugin)
    expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
    expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
  })
})
