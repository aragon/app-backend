import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MetadataHandler } from '@handlers/metadataHandler'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import Logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { PluginSlug } from '@helpers/pluginSlug'
import Web3Utils from '@helpers/web3Utils'

describe('Indexer: MetadataHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('metadataSet', () => {
    it('should store DAO metadata', async () => {
      const verboseStub = sandbox.stub(Logger, 'verbose')
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      } as any)

      const decodeHelper = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
      expect(verboseStub.args[0][0]).to.be.eq('Created new document - Dao Metadata Set')
    })

    it('should store DAO metadata with hash', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      } as any)

      const decodeHelper = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const verboseStub = sandbox.stub(Logger, 'verbose')

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
      expect(verboseStub.args[0][0]).to.be.eq('Created new document - Dao Metadata Set')
    })

    it('should store DAO metadata - dao not exists', async () => {
      const verboseStub = sandbox.stub(Logger, 'verbose')
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      const pluginFindStub = sandbox.stub(Models.Plugin, 'findByAddress').callsFake(async (..._args) => {
        pluginFindStub.restore() // Restore the original method after the first call
        return Promise.resolve({
          address: '0x123',
          interfaceType: IPluginInterfaceType.spp,
          network: NetworksEnum.ethereumMainnet,
        } as any)
      })

      const decodeHelper = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
      expect(verboseStub.args[0][0]).to.be.eq('Created new document - Plugin Metadata Set')
    })

    it('should _updateDaoMetadata if logDb successfully created', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      } as any)

      const decodeHelper = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const verboseStub = sandbox.stub(Logger, 'verbose')
      const createDocumentStub = sandbox.spy(DbOperations, 'createDocument')
      const updateDaoMetadataStub = sandbox.stub(MetadataHandler, '_updateDaoMetadata').resolves()

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
      expect(verboseStub.args[0][0]).to.be.eq('Created new document - Dao Metadata Set')
      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateDaoMetadataStub.calledOnce).to.be.true
    })

    it('should return if the dao and plugin didnot exist', async () => {
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      const findExistingStub = sandbox.stub(Models.LogMetadata, 'findExistingLog')

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(findExistingStub.calledOnce).to.be.false
    })

    it('should return if already exist', async () => {
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const extractMetadataUriStub = sandbox.stub(Web3Utils, 'extractMetadataUri').returns('ipfs://fake-uri')
      const findExistingStub = sandbox.stub(Models.LogMetadata, 'findExistingLog').resolves(true)

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)
      expect(findExistingStub.calledOnce).to.be.true
      expect(extractMetadataUriStub.calledOnce).to.be.false
    })

    it('should _updateDaoMetadata if logDb successfully created', async () => {
      const fakeLogDB = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x123',
        fetchedMetadata: true,
        metadataUri: 'ipfs://fake-uri',
        name: 'test',
        description: 'fake-description',
        avatar: 'fake-avatar',
        links: 'fake-links',
      }

      const findExistingLogStub = sandbox.stub(Models.Dao, 'findExistingLog').resolves({
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
        update: sandbox.stub(),
      } as any)

      const stubUpdate = sandbox.stub(DbOperations, 'updateDocument')

      await MetadataHandler._updateDaoMetadata(fakeLogDB as any)

      expect(stubUpdate.calledOnce).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
    })

    it('should throw error', async () => {
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const findExistingStub = sandbox.stub(Models.LogMetadata, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Utils, 'extractMetadataUri').rejects(new Error('fake-error'))

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)
      expect(findExistingStub.calledOnce).to.be.true
      expect(findExistingStub.calledOnceWith('Error create metadataSet')).to.be.false
    })
  })

  describe('_handleDaoMetadata', () => {
    it('should create log metadata and update DAO metadata', async () => {
      const fakeDao = {
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      }
      const logMetadata: any = {
        metadataType: 'dao',
        daoAddress: fakeDao.address,
      }

      const logDbStub = sandbox.stub(DbOperations, 'createDocument').resolves({ id: 'log-id' } as any)
      const updateDaoMetadataStub = sandbox.stub(MetadataHandler, '_updateDaoMetadata').resolves()

      await MetadataHandler._handleDaoMetadata(fakeDao as any, logMetadata, { transactionHash: '0xabc' } as any)

      expect(logDbStub.calledOnce).to.be.true
      expect(updateDaoMetadataStub.calledOnce).to.be.true
      expect(logDbStub.args[0][1]).to.deep.include(logMetadata)
    })
  })

  describe('_handlePluginMetadata', () => {
    it('should create log metadata, update plugin metadata, and update stage names for spp plugin', async () => {
      const fakePlugin = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.spp,
        status: IPluginStatus.installed,
        isSupported: true,
      }
      const logMetadata: any = {
        metadataType: 'plugin',
        pluginAddress: fakePlugin.address,
        stageNames: ['stage1', 'stage2'],
      }
      const ipfsMetadata = {
        processKey: 'process-key',
        stageNames: ['stage1', 'stage2'],
      }

      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves({ id: 'log-id' } as any)
      const updatePluginMetadataStub = sandbox.stub(MetadataHandler, '_updatePluginMetadata').resolves()
      const updateStageNamesStub = sandbox.stub(PluginSettingHandler, 'updateStageNamesOnSppSettings').resolves()
      const updateSlugStub = sandbox.stub(PluginSlug, 'updateSlug').resolves()

      await MetadataHandler._handlePluginMetadata(fakePlugin as any, logMetadata, ipfsMetadata, {
        transactionHash: '0xabc',
      } as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateSlugStub.calledOnce).to.be.true
      expect(updatePluginMetadataStub.calledOnce).to.be.true
      expect(updateStageNamesStub.calledOnce).to.be.true
      expect(updateStageNamesStub.calledWith(fakePlugin, logMetadata.stageNames)).to.be.true
    })

    it('should create log metadata and update plugin metadata for non-spp plugin', async () => {
      const fakePlugin = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
      }
      const logMetadata: any = {
        metadataType: 'plugin',
        pluginAddress: fakePlugin.address,
      }

      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves({ id: 'log-id' } as any)
      const updatePluginMetadataStub = sandbox.stub(MetadataHandler, '_updatePluginMetadata').resolves()
      const updateStageNamesStub = sandbox.stub(PluginSettingHandler, 'updateStageNamesOnSppSettings')
      const updateSlugStub = sandbox.stub(PluginSlug, 'updateSlug').resolves()

      await MetadataHandler._handlePluginMetadata(fakePlugin as any, logMetadata, null, {
        transactionHash: '0xabc',
      } as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateSlugStub.calledOnce).to.be.true
      expect(updatePluginMetadataStub.calledOnce).to.be.true
      expect(updateStageNamesStub.notCalled).to.be.true
    })
  })

  describe('_updatePluginMetadata', () => {
    it('should update plugin metadata if plugin and metadata exist', async () => {
      const fakeMetadataLog = {
        pluginAddress: '0x789',
        network: NetworksEnum.ethereumMainnet,
        fetchedMetadata: true,
        metadataUri: 'ipfs://fake-uri',
        name: 'Plugin Name',
        description: 'Plugin Description',
        processKey: 'process-key',
      }

      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: '0x789',
        update: sandbox.stub(),
      } as any)

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await MetadataHandler._updatePluginMetadata(fakeMetadataLog as any)

      expect(pluginStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.args[0][1]).to.include({
        metadataIpfs: fakeMetadataLog.metadataUri,
        name: fakeMetadataLog.name,
        description: fakeMetadataLog.description,
        processKey: fakeMetadataLog.processKey,
      })
    })

    it('should not update plugin metadata if plugin does not exist', async () => {
      const fakeMetadataLog = {
        pluginAddress: '0x789',
        network: NetworksEnum.ethereumMainnet,
        fetchedMetadata: true,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await MetadataHandler._updatePluginMetadata(fakeMetadataLog as any)

      expect(updateDocumentStub.notCalled).to.be.true
    })
  })

  describe('_updateDaoMetadata', () => {
    it('should update DAO metadata if DAO exists and metadata fetched', async () => {
      const fakeMetadataLog = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
        fetchedMetadata: true,
        metadataUri: 'ipfs://dao-uri',
        name: 'DAO Name',
        description: 'DAO Description',
        avatar: 'avatar-link',
        links: 'dao-links',
      }

      const daoStub = sandbox.stub(Models.Dao, 'findExistingLog').resolves({
        address: '0x123',
        update: sandbox.stub(),
      } as any)

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await MetadataHandler._updateDaoMetadata(fakeMetadataLog as any)

      expect(daoStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.args[0][1]).to.include({
        metadataIpfs: fakeMetadataLog.metadataUri,
        name: fakeMetadataLog.name,
        description: fakeMetadataLog.description,
        avatar: fakeMetadataLog.avatar,
        links: fakeMetadataLog.links,
      })
    })

    it('should not update DAO metadata if DAO does not exist', async () => {
      const fakeMetadataLog = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
        fetchedMetadata: true,
      }

      sandbox.stub(Models.Dao, 'findExistingLog').resolves(null)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await MetadataHandler._updateDaoMetadata(fakeMetadataLog as any)

      expect(updateDocumentStub.notCalled).to.be.true
    })
  })
})
