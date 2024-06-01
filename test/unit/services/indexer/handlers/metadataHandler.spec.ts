import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MetadataHandler } from '@services/indexer/handlers/metadataHandler'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import Web3Helper from '@helpers/web3'
import Logger from '@logger'

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
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.mainnet,
      } as any)

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
    })

    it('should store DAO metadata with hash', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const txLog = {
        hash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.mainnet,
      } as any)

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://fake-uri')
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith('ipfs://fake-uri')).to.be.true
    })

    it('should fail store DAO metadata', async () => {
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const txLog = {
        hash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubLogger = sandbox.stub(Logger, 'error')
      const stubFindLog = sandbox.stub(Models.LogDaoMetadata, 'findExistingLog').rejects(new Error('fake-error'))

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindLog.calledWith(txLog.hash, txLog.address)).to.be.true
    })
  })
})
