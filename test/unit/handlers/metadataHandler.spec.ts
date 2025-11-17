import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ILogInfo, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MetadataHandler } from '@handlers/metadataHandler'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import Logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { PluginSlug } from '@helpers/pluginSlug'
import Web3Utils from '@helpers/web3Utils'
import { DaoList } from '@test/mock/fakeDao'

describe.only('Indexer: MetadataHandler', () => {
  let sandbox: SinonSandbox
  let logInfo: ILogInfo

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    logInfo = {
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 1,
      transactionIndex: 1,
      logIndex: 1,
      transactionHash: '0xabc',
      address: '0x123',
      eventName: 'MetadataSet',
    }
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

      const pluginFindStub = sandbox.stub(Models.Plugin, 'findByAddress').callsFake(async (...args) => {
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

      await MetadataHandler._updateDaoMetadata(fakeLogDB as any, logInfo)

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

      await MetadataHandler._handleDaoMetadata(
        fakeDao as any,
        logMetadata,
        {
          name: 'DAO Name',
          description: 'DAO Description',
          avatar: 'avatar-link',
        },
        logInfo,
      )

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

      await MetadataHandler._updateDaoMetadata(fakeMetadataLog as any, logInfo)

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

      await MetadataHandler._updateDaoMetadata(fakeMetadataLog as any, logInfo)

      expect(updateDocumentStub.notCalled).to.be.true
    })
  })

  describe('MetadataHandler - Parent-Child DAO Relationships', () => {
    let fakeChildDao: any
    let fakeParentDao: any
    const network = NetworksEnum.ethereumSepolia

    let fakeParentMetadataLog: any
    let fakeChildMetadataLog: any
    let loggerVerboseStub: sinon.SinonStub

    beforeEach(async () => {
      fakeChildDao = {
        ...DaoList[0],
        address: '0xChildDaoAddress',
        network,
        parentDao: null,
        subDaos: [],
      }

      fakeParentDao = {
        ...DaoList[1],
        address: '0xParentDaoAddress',
        network,
        parentDao: null,
        subDaos: [],
      }

      fakeParentMetadataLog = {
        daoAddress: fakeParentDao.address,
        transactionHash: '0xparenttxHash',
        network,
        blockNumber: 123,
        fetchedMetadata: true,
        metadataUri: 'ipfs://dao-uri',
        name: 'DAO Name',
        transactionIndex: 2,
        logIndex: 2,
        description: 'DAO Description',
        avatar: 'avatar-link',
        subDaos: [fakeChildDao.address],
      }

      fakeChildMetadataLog = {
        daoAddress: fakeChildDao.address,
        transactionHash: '0xchildtxHash',
        network,
        blockNumber: 123,
        transactionIndex: 1,
        logIndex: 1,
        fetchedMetadata: true,
        metadataUri: 'ipfs://dao-uri',
        name: 'DAO Name',
        description: 'DAO Description',
        avatar: 'avatar-link',
        parentDao: fakeParentDao.address,
      }

      loggerVerboseStub = sandbox.stub(Logger, 'verbose')
    })

    describe('setting a new parent', () => {
      it('should set valid parent with bidirectional agreement', async () => {
        const childDao = await Models.Dao.create(fakeChildDao)
        const parentDao = await Models.Dao.create(fakeParentDao)
        await Models.LogMetadata.create(fakeParentMetadataLog)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedParent = await parentDao.reload()

        expect(updatedChild.parentDao).to.equal(parentDao.address)
        expect(updatedParent.subDaos).to.include(childDao.address)
      })

      it('should not set parent when parent does not acknowledge child', async () => {
        fakeParentMetadataLog.subDaos = []

        const childDao = await Models.Dao.create(fakeChildDao)
        await Models.Dao.create(fakeParentDao)
        await Models.LogMetadata.create(fakeParentMetadataLog)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        expect(updatedChild.parentDao).to.be.null
      })

      it('should not set parent when parent metadata does not exist', async () => {
        const childDao = await Models.Dao.create(fakeChildDao)
        await Models.Dao.create(fakeParentDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        expect(updatedChild.parentDao).to.be.null
      })
    })

    describe('changing parent', () => {
      it('should change from old parent to new valid parent', async () => {
        const oldParentAddress = '0xOldParentAddress'
        const oldParentDao = await Models.Dao.create({
          ...DaoList[2],
          address: oldParentAddress,
          network,
          subDaos: [fakeChildDao.address],
        })

        fakeChildDao.parentDao = oldParentAddress
        fakeParentMetadataLog.transactionHash = '0xnewparenttx'

        const newParentDao = await Models.Dao.create(fakeParentDao)
        const childDao = await Models.Dao.create(fakeChildDao)
        await Models.LogMetadata.create(fakeParentMetadataLog)

        fakeChildMetadataLog.transactionHash = '0xchildnew'
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedOldParent = await oldParentDao.reload()
        const updatedNewParent = await newParentDao.reload()

        expect(updatedChild.parentDao).to.equal(newParentDao.address)
        expect(updatedOldParent.subDaos).to.not.include(childDao.address)
        expect(updatedNewParent.subDaos).to.include(childDao.address)
      })

      it('should be idempotent when same parent is updated', async () => {
        fakeParentDao.subDaos = [fakeChildDao.address]
        fakeChildDao.parentDao = fakeParentDao.address
        fakeParentMetadataLog.transactionHash = '0xparent2'
        fakeChildMetadataLog.transactionHash = '0xchildsame'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const childDao = await Models.Dao.create(fakeChildDao)
        await Models.LogMetadata.create(fakeParentMetadataLog)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedParent = await parentDao.reload()

        expect(updatedChild.parentDao).to.equal(parentDao.address)
        expect(updatedParent.subDaos).to.deep.equal([childDao.address])
      })
    })

    describe('removing parent', () => {
      it('should remove parent relationship', async () => {
        fakeParentDao.subDaos = [fakeChildDao.address]
        fakeChildDao.parentDao = fakeParentDao.address
        fakeChildMetadataLog.parentDao = null
        fakeChildMetadataLog.transactionHash = '0xchildremove'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const childDao = await Models.Dao.create(fakeChildDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedParent = await parentDao.reload()

        expect(updatedChild.parentDao).to.be.null
        expect(updatedParent.subDaos).to.not.include(childDao.address)
      })
    })

    describe('adding subDAOs', () => {
      it('should add valid subDAOs with bidirectional agreement', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
        })
        const child2Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1',
          daoAddress: child1Address,
          parentDao: fakeParentDao.address,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild2',
          daoAddress: child2Address,
          parentDao: fakeParentDao.address,
        })

        fakeParentMetadataLog.transactionHash = '0xparentadd'
        fakeParentMetadataLog.subDaos = [child1Address, child2Address]
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()
        const updatedChild2 = await child2Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(2)
        expect(updatedParent.subDaos).to.include(child1Address)
        expect(updatedParent.subDaos).to.include(child2Address)
        expect(updatedChild1.parentDao).to.equal(fakeParentDao.address)
        expect(updatedChild2.parentDao).to.equal(fakeParentDao.address)
      })

      it('should only add children that acknowledge parent', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
        })
        const child2Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1valid',
          daoAddress: child1Address,
          parentDao: fakeParentDao.address,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild2invalid',
          daoAddress: child2Address,
          parentDao: null,
        })

        fakeParentMetadataLog.transactionHash = '0xparentpartial'
        fakeParentMetadataLog.subDaos = [child1Address, child2Address]
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()
        const updatedChild2 = await child2Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(1)
        expect(updatedParent.subDaos).to.include(child1Address)
        expect(updatedParent.subDaos).to.not.include(child2Address)
        expect(updatedChild1.parentDao).to.equal(fakeParentDao.address)
        expect(updatedChild2.parentDao).to.be.null
      })
    })

    describe('updating subDAOs', () => {
      it('should update subDaos by adding and removing children', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'
        const child3Address = '0xChild3Address'

        fakeParentDao.subDaos = [child1Address, child2Address]

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
          parentDao: fakeParentDao.address,
        })
        const child2Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
          parentDao: fakeParentDao.address,
        })
        const child3Dao = await Models.Dao.create({
          ...DaoList[4],
          address: child3Address,
          network,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild2keep',
          daoAddress: child2Address,
          parentDao: fakeParentDao.address,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild3new',
          daoAddress: child3Address,
          parentDao: fakeParentDao.address,
        })

        fakeParentMetadataLog.transactionHash = '0xparentupdate'
        fakeParentMetadataLog.subDaos = [child2Address, child3Address]
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild2 = await child2Dao.reload()
        const updatedChild3 = await child3Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(2)
        expect(updatedParent.subDaos).to.not.include(child1Address)
        expect(updatedParent.subDaos).to.include(child2Address)
        expect(updatedParent.subDaos).to.include(child3Address)
        expect(updatedChild2.parentDao).to.equal(fakeParentDao.address)
        expect(updatedChild3.parentDao).to.equal(fakeParentDao.address)
      })
    })

    describe('removing subDAOs', () => {
      it('should clear all subDaos when children no longer reference parent', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'

        fakeParentDao.subDaos = [child1Address, child2Address]

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
          parentDao: fakeParentDao.address,
        })
        const child2Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
          parentDao: fakeParentDao.address,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1clear',
          daoAddress: child1Address,
          parentDao: null,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild2clear',
          daoAddress: child2Address,
          parentDao: null,
        })

        fakeParentMetadataLog.transactionHash = '0xparentclear'
        fakeParentMetadataLog.subDaos = []
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()
        const updatedChild2 = await child2Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(0)
        expect(updatedChild1.parentDao).to.be.null
        expect(updatedChild2.parentDao).to.be.null
      })

      it('should not clear child parentDao when child metadata still references parent', async () => {
        const child1Address = '0xChild1Address'

        fakeParentDao.subDaos = [child1Address]

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
          parentDao: fakeParentDao.address,
        })

        fakeChildMetadataLog.transactionHash = '0xchild1still'
        fakeChildMetadataLog.daoAddress = child1Address
        await Models.LogMetadata.create(fakeChildMetadataLog)

        fakeParentMetadataLog.transactionHash = '0xparentempty'
        fakeParentMetadataLog.subDaos = []
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(0)
        expect(updatedChild1.parentDao).to.equal(fakeParentDao.address)
      })
    })

    describe('complex scenarios', () => {
      it('should handle DAO as both parent and child simultaneously', async () => {
        const grandParentAddress = '0xGrandParentAddress'

        const grandParentDao = await Models.Dao.create({
          ...DaoList[4],
          address: grandParentAddress,
          network,
        })
        const middleDao = await Models.Dao.create(fakeParentDao)
        const childDao = await Models.Dao.create(fakeChildDao)

        await Models.LogMetadata.create({
          ...fakeParentMetadataLog,
          transactionHash: '0xgrandparent',
          daoAddress: grandParentAddress,
          subDaos: [fakeParentDao.address],
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild',
          parentDao: fakeParentDao.address,
        })

        const middleMetadata = await Models.LogMetadata.create({
          ...fakeParentMetadataLog,
          transactionHash: '0xmiddle',
          daoAddress: fakeParentDao.address,
          parentDao: grandParentAddress,
          subDaos: [fakeChildDao.address],
        })

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(middleDao)

        await MetadataHandler._updateDaoMetadata(middleMetadata, logInfo)

        const updatedMiddle = await middleDao.reload()
        const updatedGrandParent = await grandParentDao.reload()
        const updatedChild = await childDao.reload()

        expect(updatedMiddle.parentDao).to.equal(grandParentAddress)
        expect(updatedMiddle.subDaos).to.include(fakeChildDao.address)
        expect(updatedGrandParent.subDaos).to.include(fakeParentDao.address)
        expect(updatedChild.parentDao).to.equal(fakeParentDao.address)
      })
    })

    describe('edge cases', () => {
      it('should handle duplicate addresses in subDaos array', async () => {
        fakeParentMetadataLog.transactionHash = '0xparentdup'
        fakeParentMetadataLog.subDaos = [fakeChildDao.address, fakeChildDao.address, fakeChildDao.address]
        fakeChildMetadataLog.transactionHash = '0xchilddup'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const childDao = await Models.Dao.create(fakeChildDao)
        await Models.LogMetadata.create(fakeChildMetadataLog)
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild = await childDao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(1)
        expect(updatedParent.subDaos[0]).to.equal(fakeChildDao.address)
        expect(updatedChild.parentDao).to.equal(fakeParentDao.address)
      })

      it('should reject self-reference as parent', async () => {
        fakeChildMetadataLog.parentDao = fakeChildDao.address
        fakeChildMetadataLog.transactionHash = '0xselfparent'

        const childDao = await Models.Dao.create(fakeChildDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        expect(updatedChild.parentDao).to.be.null
      })

      it('should reject self-reference in subDaos', async () => {
        fakeParentMetadataLog.subDaos = [fakeParentDao.address]
        fakeParentMetadataLog.transactionHash = '0xselfchild'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        expect(updatedParent.subDaos).to.have.lengthOf(0)
      })

      it('should handle empty subDaos array same as null', async () => {
        fakeParentDao.subDaos = [fakeChildDao.address]
        fakeParentMetadataLog.subDaos = []
        fakeParentMetadataLog.transactionHash = '0xemptyarray'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        expect(updatedParent.subDaos).to.have.lengthOf(0)
      })

      it('should remove old parent when new parent is invalid', async () => {
        const oldParentAddress = '0xOldParentAddress'
        const invalidParentAddress = '0xInvalidParentAddress'

        const oldParentDao = await Models.Dao.create({
          ...DaoList[2],
          address: oldParentAddress,
          network,
          subDaos: [fakeChildDao.address],
        })

        fakeChildDao.parentDao = oldParentAddress
        fakeChildMetadataLog.parentDao = invalidParentAddress
        fakeChildMetadataLog.transactionHash = '0xinvalidparent'

        const childDao = await Models.Dao.create(fakeChildDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedOldParent = await oldParentDao.reload()

        expect(updatedChild.parentDao).to.be.null
        expect(updatedOldParent.subDaos).to.not.include(fakeChildDao.address)
      })

      it('should clear subDaos when all new ones are invalid', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'

        fakeParentDao.subDaos = [child1Address, child2Address]

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
          parentDao: fakeParentDao.address,
        })
        const child2Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
          parentDao: fakeParentDao.address,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1noacknowledge',
          daoAddress: child1Address,
          parentDao: null,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild2noacknowledge',
          daoAddress: child2Address,
          parentDao: null,
        })

        fakeParentMetadataLog.transactionHash = '0xparentallinvalid'
        fakeParentMetadataLog.subDaos = [child1Address, child2Address]
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        expect(updatedParent.subDaos).to.have.lengthOf(0)
      })

      it('should handle child DAO not existing in database', async () => {
        const nonExistentChildAddress = '0xNonExistentChild'

        fakeParentMetadataLog.subDaos = [nonExistentChildAddress]
        fakeParentMetadataLog.transactionHash = '0xnonexistentchild'

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xnonexistentchildmeta',
          daoAddress: nonExistentChildAddress,
          parentDao: fakeParentDao.address,
        })

        const parentDao = await Models.Dao.create(fakeParentDao)
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        expect(updatedParent.subDaos).to.include(nonExistentChildAddress)
      })

      it('should handle parent DAO not existing in database when setting parent', async () => {
        const nonExistentParentAddress = '0xNonExistentParent'

        fakeChildMetadataLog.parentDao = nonExistentParentAddress
        fakeChildMetadataLog.transactionHash = '0xnonexistentparent'

        await Models.LogMetadata.create({
          ...fakeParentMetadataLog,
          transactionHash: '0xnonexistentparentmeta',
          daoAddress: nonExistentParentAddress,
          subDaos: [fakeChildDao.address],
        })

        const childDao = await Models.Dao.create(fakeChildDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        expect(updatedChild.parentDao).to.equal(nonExistentParentAddress)
      })

      it('should handle child metadata not existing', async () => {
        const child1Address = '0xChild1Address'
        const child2Address = '0xChild2Address'

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[2],
          address: child1Address,
          network,
        })
        await Models.Dao.create({
          ...DaoList[3],
          address: child2Address,
          network,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1hasmeta',
          daoAddress: child1Address,
          parentDao: fakeParentDao.address,
        })

        fakeParentMetadataLog.transactionHash = '0xparentmissingchildmeta'
        fakeParentMetadataLog.subDaos = [child1Address, child2Address]
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()

        expect(updatedParent.subDaos).to.have.lengthOf(1)
        expect(updatedParent.subDaos).to.include(child1Address)
        expect(updatedParent.subDaos).to.not.include(child2Address)
        expect(updatedChild1.parentDao).to.equal(fakeParentDao.address)
      })

      it('should handle changing to new parent but new parent does not acknowledge', async () => {
        const oldParentAddress = '0xOldParentAddress'
        const newParentAddress = '0xNewParentAddress'

        const oldParentDao = await Models.Dao.create({
          ...DaoList[2],
          address: oldParentAddress,
          network,
          subDaos: [fakeChildDao.address],
        })

        await Models.Dao.create({
          ...DaoList[3],
          address: newParentAddress,
          network,
        })

        fakeChildDao.parentDao = oldParentAddress
        fakeChildMetadataLog.parentDao = newParentAddress
        fakeChildMetadataLog.transactionHash = '0xnewparentnoacknowledge'

        await Models.LogMetadata.create({
          ...fakeParentMetadataLog,
          transactionHash: '0xnewparentmeta',
          daoAddress: newParentAddress,
          subDaos: [],
        })

        const childDao = await Models.Dao.create(fakeChildDao)
        const childMetadata = await Models.LogMetadata.create(fakeChildMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(childDao)

        await MetadataHandler._updateDaoMetadata(childMetadata, logInfo)

        const updatedChild = await childDao.reload()
        const updatedOldParent = await oldParentDao.reload()

        expect(updatedChild.parentDao).to.be.null
        expect(updatedOldParent.subDaos).to.not.include(fakeChildDao.address)
      })

      it('should handle remove parent and add subDaos in same update', async () => {
        const oldParentAddress = '0xOldParentAddress'
        const child1Address = '0xChild1Address'

        await Models.Dao.create({
          ...DaoList[2],
          address: oldParentAddress,
          network,
          subDaos: [fakeParentDao.address],
        })

        fakeParentDao.parentDao = oldParentAddress

        const parentDao = await Models.Dao.create(fakeParentDao)
        const child1Dao = await Models.Dao.create({
          ...DaoList[3],
          address: child1Address,
          network,
        })

        await Models.LogMetadata.create({
          ...fakeChildMetadataLog,
          transactionHash: '0xchild1forfutureparent',
          daoAddress: child1Address,
          parentDao: fakeParentDao.address,
        })

        fakeParentMetadataLog.parentDao = null
        fakeParentMetadataLog.subDaos = [child1Address]
        fakeParentMetadataLog.transactionHash = '0xremoveparentaddchild'
        const parentMetadata = await Models.LogMetadata.create(fakeParentMetadataLog)

        sandbox.stub(Models.Dao, 'findExistingLog').resolves(parentDao)

        await MetadataHandler._updateDaoMetadata(parentMetadata, logInfo)

        const updatedParent = await parentDao.reload()
        const updatedChild1 = await child1Dao.reload()

        expect(updatedParent.parentDao).to.be.null
        expect(updatedParent.subDaos).to.have.lengthOf(1)
        expect(updatedParent.subDaos).to.include(child1Address)
        expect(updatedChild1.parentDao).to.equal(fakeParentDao.address)
      })
    })
  })
})
