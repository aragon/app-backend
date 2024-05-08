import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler';

describe.only('Indexer: metadataLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it.only('should skip unsupported networks', async () => {
    const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
    const stubLogger = sandbox.stub(logger, 'verbose')
    const crawlerStub = { crawl: sandbox.stub().resolves() }
    await MetadataLogs.start()

    expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
    expect(crawlerStub.crawl.notCalled).to.be.true
    expect(networkFindStub.calledOnce).to.be.true
  })

  it.only('should process supported networks and run crawlers', async () => {
    const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
    const crawlerStub = { crawl: sandbox.stub().resolves() }
    const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
    sandbox.stub(MetadataLogs, 'createCrawler').returns(crawlerStub as any);
    const networkName = 'testnet'

    await MetadataLogs.start()

    console.log(networkFindStub.args)
    // expect(networkFindStub.calledWith(networkName)).to.be.true
    // expect(crawlerStub.crawl.calledOnce).to.be.true
    // expect(saveSyncStub.calledOnce).to.be.true
  })

  describe('extractMetadataUri', function () {
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

  describe('decodeTransaction', function () {
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

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sinon.stub(logger, 'error')

    await MetadataLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error MetadataLogs' as any))
  })
})
