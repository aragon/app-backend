import ConfigIndexerHelper from '@helpers/configIndexer'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { LogPolicy } from '@plugins/logPolicy'
import { Models } from '@src/models'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogPolicy', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start LogPolicy and sync all contracts when source and model exist', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const sourceAddress = '0xSourceAddress'
      const modelAddress = '0xModelAddress'

      const mockSetting = {
        policy: {
          source: { address: sourceAddress },
          model: { address: modelAddress },
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)

      const syncSourceModelStub = sandbox.stub(LogPolicy, '_syncSourceModelContract').resolves()
      const syncPluginStub = sandbox.stub(LogPolicy, '_syncPluginContract').resolves()

      const verboseStub = sandbox.stub(logger, 'verbose')
      const infoStub = sandbox.stub(logger, 'info')

      await LogPolicy.start(pluginAddress, network)

      expect(syncSourceModelStub.calledTwice).to.be.true
      expect(syncSourceModelStub.calledWith(sourceAddress, network)).to.be.true
      expect(syncSourceModelStub.calledWith(modelAddress, network)).to.be.true
      expect(syncPluginStub.calledOnce).to.be.true
      expect(syncPluginStub.calledWith(pluginAddress, network)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
      expect(infoStub.calledOnce).to.be.true
    })

    it('should start LogPolicy without source sync when source is missing', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const modelAddress = '0xModelAddress'

      const mockSetting = {
        policy: {
          source: null,
          model: { address: modelAddress },
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)

      const syncSourceModelStub = sandbox.stub(LogPolicy, '_syncSourceModelContract').resolves()
      const syncPluginStub = sandbox.stub(LogPolicy, '_syncPluginContract').resolves()

      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      await LogPolicy.start(pluginAddress, network)

      expect(syncSourceModelStub.calledOnce).to.be.true
      expect(syncSourceModelStub.calledWith(modelAddress, network)).to.be.true
      expect(syncPluginStub.calledOnce).to.be.true
    })

    it('should start LogPolicy without model sync when model is missing', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const sourceAddress = '0xSourceAddress'

      const mockSetting = {
        policy: {
          source: { address: sourceAddress },
          model: null,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)

      const syncSourceModelStub = sandbox.stub(LogPolicy, '_syncSourceModelContract').resolves()
      const syncPluginStub = sandbox.stub(LogPolicy, '_syncPluginContract').resolves()

      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      await LogPolicy.start(pluginAddress, network)

      expect(syncSourceModelStub.calledOnce).to.be.true
      expect(syncSourceModelStub.calledWith(sourceAddress, network)).to.be.true
      expect(syncPluginStub.calledOnce).to.be.true
    })

    it('should start LogPolicy with only plugin sync when no setting found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia

      sandbox.stub(Models.Setting, 'findActive').resolves(null)

      const syncSourceModelStub = sandbox.stub(LogPolicy, '_syncSourceModelContract').resolves()
      const syncPluginStub = sandbox.stub(LogPolicy, '_syncPluginContract').resolves()

      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      await LogPolicy.start(pluginAddress, network)

      expect(syncSourceModelStub.called).to.be.false
      expect(syncPluginStub.calledOnce).to.be.true
    })
  })

  describe('_syncSourceModelContract', () => {
    it('should sync source/model contract events successfully', async () => {
      const address = '0xSourceAddress'
      const network = NetworksEnum.ethereumSepolia

      const mockLogPolicy = {
        blockNumber: 1000,
      }

      sandbox.stub(Models.LogPolicy, 'findByAddress').resolves(mockLogPolicy as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'policyContract').returns({} as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogPolicy._syncSourceModelContract(address, network)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should warn and return early if LogPolicy record not found', async () => {
      const address = '0xSourceAddress'
      const network = NetworksEnum.ethereumSepolia

      sandbox.stub(Models.LogPolicy, 'findByAddress').resolves(null)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const warnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'verbose')

      await LogPolicy._syncSourceModelContract(address, network)

      expect(warnStub.calledOnce).to.be.true
      expect(crawlStub.called).to.be.false
    })

    it('should warn and return early if LogPolicy record has no blockNumber', async () => {
      const address = '0xSourceAddress'
      const network = NetworksEnum.ethereumSepolia

      const mockLogPolicy = {
        blockNumber: null,
      }

      sandbox.stub(Models.LogPolicy, 'findByAddress').resolves(mockLogPolicy as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const warnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'verbose')

      await LogPolicy._syncSourceModelContract(address, network)

      expect(warnStub.calledOnce).to.be.true
      expect(crawlStub.called).to.be.false
    })

    it('should call onError handler when crawler encounters error', async () => {
      const address = '0xSourceAddress'
      const network = NetworksEnum.ethereumSepolia

      const mockLogPolicy = {
        blockNumber: 1000,
      }

      sandbox.stub(Models.LogPolicy, 'findByAddress').resolves(mockLogPolicy as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'policyContract').returns({} as any)

      const error = new Error('Test error')
      const log = { logIndex: 1, transactionHash: '0xhash' }

      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: BlockchainLogCrawler) {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, log)
        }
      } as any)
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogPolicy, '_processError').resolves()
      sandbox.stub(logger, 'verbose')

      await LogPolicy._syncSourceModelContract(address, network)

      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, address, network, log)).to.be.true
    })
  })

  describe('_syncPluginContract', () => {
    it('should sync plugin contract events successfully', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 500,
        transactionHash: '0xTxHash',
      } as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'policyPlugin').returns({} as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogPolicy._syncPluginContract(pluginAddress, network)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should warn and return early if contract creation block not found', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: null,
      } as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const warnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'verbose')

      await LogPolicy._syncPluginContract(pluginAddress, network)

      expect(warnStub.calledOnce).to.be.true
      expect(crawlStub.called).to.be.false
    })

    it('should call onError handler when crawler encounters error', async () => {
      const pluginAddress = '0xPluginAddress'
      const network = NetworksEnum.ethereumSepolia

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 500,
      } as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'policyPlugin').returns({} as any)

      const error = new Error('Test error')
      const log = { logIndex: 1, transactionHash: '0xhash' }

      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: BlockchainLogCrawler) {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, log)
        }
      } as any)
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogPolicy, '_processError').resolves()
      sandbox.stub(logger, 'verbose')

      await LogPolicy._syncPluginContract(pluginAddress, network)

      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginAddress, network, log)).to.be.true
    })
  })

  describe('_processError', () => {
    it('should log error with all context', async () => {
      const error = new Error('Test error')
      const address = '0xAddress'
      const network = NetworksEnum.ethereumSepolia
      const log = { logIndex: 1, transactionHash: '0xhash' }

      const errorStub = sandbox.stub(logger, 'error')

      await LogPolicy._processError(error, address, network, log)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogPolicy' as any)).to.be.true
    })
  })
})
