import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MetadataHandler } from '@handlers/metadataHandler'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import Web3Helper from '@helpers/web3'
import Logger from '@logger'
import DbOperations from '@models/utils/dbOperations'

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

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://fake-uri')
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

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const verboseStub = sandbox.stub(Logger, 'verbose')

      await MetadataHandler.metadataSet(fakeEvent as any, logInfo)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
      expect(verboseStub.args[0][0]).to.be.eq('Created new document - Dao Metadata Set')
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

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://fake-uri')
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
  })
})
