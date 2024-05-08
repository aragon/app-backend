import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network';
import Web3Utils from '@helpers/web3';
import IPFSModule from '@modules/ipfs'

describe.only('Indexer: metadataLogs', () => {
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
      sandbox.stub(MetadataLogs, 'createCrawler').returns(crawlerStub as any);
      const networkName = 'testnet'

      await MetadataLogs.start()

      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(crawlerStub.crawl.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sinon.stub(logger, 'error')

    await MetadataLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error MetadataLogs' as any))
  })

  describe('processMetadata', () => {
    it.only('should handle successful metadata processing', async () => {

      const fakeMetadata = {
        name: 'test'
      }

      const fakeTx = { data: '0x123' }
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any);
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns({ data: '0x123' } as any);
      const stubExtractMetadata = sandbox.stub(MetadataLogs, 'extractMetadataUri').resolves('fake-uri');
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata);
      const networkName = NetworksEnum.mainnet;
      const networkDb = sandbox.stub()

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1
      }

      await MetadataLogs.processMetadata(txLog, networkName, networkDb as any);

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      // expect(stubExtractMetadata.calledWith(fakeTx)).to.be.true

      //
      // // Stubbing methods
      // sandbox.stub(Web3Utils, 'getTransaction').resolves({ data: '0x123' });
      // sandbox.stub(MetadataLogs, 'decodeTransaction').returns({
      //   contract: IAragonContract.DAOFactory,
      //   args: { metadata: 'data' }
      // });
      // sandbox.stub(IPFSModule, 'fetchMetadata').resolves('Metadata content');
      // sandbox.stub(Models.LogDaoMetadata, 'findTxHash').resolves(null);
      // sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn) => await fn({ session: {} }));
      //
      // await MetadataLogs.processMetadata(txLog, networkName, networkDb);
      //
      // expect(DbTx.executeTxFn.calledOnce).to.be.true;
      // You can add more expectations here to verify that methods are called with correct parameters
    });
  })

  describe('decodeTransaction', () => {
    it('should decode transaction data correctly', function () {
      const fakeData = '0xabcdabcd' // Example data, adjust according to your contract ABI
      const fakeTransaction = { data: fakeData }
      const mockInterface = {
        getFunction: sinon.stub().returns({ test: 1 }),
        decodeFunctionData: sinon.stub().returns(['arg1', 'arg2']),
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
        getFunction: sinon.stub().returns(false),
        decodeFunctionData: sinon.stub().returns(['arg1', 'arg2']),
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
