import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import logger from '@logger'
import { IAragonContract, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import Web3Utils from '@helpers/web3'
import IPFSModule from '@modules/ipfs'
import Web3Helper from '@helpers/web3'
import { Interface } from 'ethers'

describe('Indexer: metadataLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      await MetadataLogs.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(crawlerStub.crawl.notCalled).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })

    it('should process supported networks and run crawlers', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      sandbox.stub(MetadataLogs, 'createCrawler').returns(crawlerStub as any)
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await MetadataLogs.start()

      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(crawlerStub.crawl.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(loggerVerboseStub.callCount).to.eq(Object.values(Network.NETWORKS).length + 1)
      expect(loggerVerboseStub.calledWith('Start MetadataLogs' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('Finish MetadataLogs' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await MetadataLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error MetadataLogs' as any))
  })

  describe('processMetadata', () => {
    it('DAOFactory: should process DAOFactory', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const fakeDecodedTx = {
        data: '0x123',
        contract: IAragonContract.DAOFactory,
        args: [
          {
            subdomain: 'fake-subdomain',
            daoURI: 'fake-daoURI',
            trustedForwarder: 'fake-trustedForwarder',
          },
        ],
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeUri = 'fake-uri'

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(MetadataLogs, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseDaoMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processMetadata(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(stubParseLog.calledWith({ data: txLog.data, topics: txLog.topics })).to.be.true

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(fakeUri)

      expect(stubParseDaoMetadata.calledOnce).to.be.true
      expect(stubParseDaoMetadata.calledWith(fakeMetadata)).to.be.true

      expect(stubLogger.calledWith('Stored DAO metadata' as any)).to.be.true

      const daoMetadataDB = await Models.LogDaoMetadata.findTxHash(txLog.transactionHash)
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.fetchedMetadata).to.eq(true)
      expect(daoMetadataDB.daoAddress).to.eq(txLog.address)
      expect(daoMetadataDB.trustedForwarder).to.eq(fakeDecodedTx.args[0].trustedForwarder)
      expect(daoMetadataDB.daoURI).to.eq(fakeDecodedTx.args[0].daoURI)
      expect(daoMetadataDB.ens).to.eq(fakeDecodedTx.args[0].subdomain)
      expect(daoMetadataDB.metadataUri).to.eq(fakeUri)
      expect(daoMetadataDB.name).to.eq(fakeMetadata.name)
      expect(daoMetadataDB.description).to.eq(fakeMetadata.description)
      expect(daoMetadataDB.avatar).to.eq(null)
      expect(daoMetadataDB.links.length).to.eq(0)
    })
  })

  describe('decodeTransaction', () => {
    it('should decode transaction data correctly', function () {
      const fakeData = '0xabcdabcd' // Example data, adjust according to your contract ABI
      const fakeTransaction = { data: fakeData }
      const mockInterface = {
        getFunction: sandbox.stub().returns({ test: 1 }),
        decodeFunctionData: sandbox.stub().returns(['arg1', 'arg2']),
      }

      MetadataLogs.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataLogs.decodeTransaction(fakeTransaction)
      expect(result).to.deep.include({
        contract: 'ExampleContract',
        args: ['arg1', 'arg2'],
      })
    })

    it('should return null if function is not found', function () {
      const fakeTransaction = { data: '0x12345678' }

      const mockInterface = {
        getFunction: sandbox.stub().returns(false),
        decodeFunctionData: sandbox.stub().returns(['arg1', 'arg2']),
      }
      MetadataLogs.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataLogs.decodeTransaction(fakeTransaction)
      expect(result).to.be.null
    })
  })

  describe('extractMetadataUri', () => {
    it('should correctly convert hex string to UTF-8 string', function () {
      const metadataHex = '0x68656c6c6f'
      const result = MetadataLogs.extractMetadataUri(metadataHex)
      expect(result).to.equal('hello')
    })

    it('should handle empty hex strings', function () {
      const result = MetadataLogs.extractMetadataUri('0x')
      expect(result).to.equal('')
    })
  })
})
