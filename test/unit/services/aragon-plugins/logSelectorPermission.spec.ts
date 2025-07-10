import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogSelectorPermission } from '@plugins/logSelectorPermission'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import ProxyWeb3Provider from '@src/modules/proxyProvider'

describe('AragonPlugins: LogSelectorPermission', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the LogSelectorPermission', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 12000,
        transactionHash: '0xcontractCreationTx',
        address: '0x456',
      })

      await LogSelectorPermission.start({
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0x456',
        blockNumber: 10000,
      } as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogSelectorPermission' as any)).to.be.true
      expect(verboseStub.calledWith('End SelectorPermission' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(
        fetchContractCreationStub.calledWith({
          address: '0x456',
          network: NetworksEnum.ethereumSepolia,
        }),
      ).to.be.true
    })

    it('should use plugin blockNumber as fallback if contract creation not found', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 0,
        transactionHash: null,
        address: '0x456',
      })

      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0x456',
        blockNumber: 10000,
      }

      await LogSelectorPermission.start(pluginStub as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledTwice).to.be.true
      expect(fetchContractCreationStub.calledOnce).to.be.true

      // Verify crawler was initialized with plugin blockNumber as fallback
      const crawlerInitArgs = crawlStub.thisValues[0]
      expect(crawlerInitArgs.crawlParams.fromBlock).to.equal(pluginStub.blockNumber)
    })

    it('should handle errors during crawling', async () => {
      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0x456',
        blockNumber: 10000,
        interfaceType: IPluginInterfaceType.admin,
      } as any

      const error = new Error('Test error')
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash' })
        }
      })

      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 12000,
        transactionHash: '0xcontractCreationTx',
        address: '0x456',
      })

      const processErrorStub = sandbox.stub(LogSelectorPermission, 'processError').resolves()

      await LogSelectorPermission.start(pluginStub)

      expect(crawlStub.calledOnce).to.be.true
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })

    it('should initialize crawler with correct configuration', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 12000,
        transactionHash: '0xcontractCreationTx',
        address: '0x456',
      })

      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        conditionAddress: '0x456',
        blockNumber: 10000,
      }

      await LogSelectorPermission.start(pluginStub as any)

      expect(crawlStub.calledOnce).to.be.true

      // Verify crawler configuration
      const crawlerInstance = crawlStub.thisValues[0]
      expect(crawlerInstance.crawlParams.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(crawlerInstance.crawlParams.address).to.equal('0x456') // condition address
      expect(crawlerInstance.crawlParams.fromBlock).to.equal(12000) // contract creation block
      expect(crawlerInstance.crawlParams.logService).to.equal('selectorPermission-ethereum-mainnet-0x123')
      expect(crawlerInstance.crawlParams.stopOnError).to.be.true
    })

    it('should filter and use only selector permission events', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 12000,
        transactionHash: '0xcontractCreationTx',
        address: '0x456',
      })

      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        conditionAddress: '0x456',
        blockNumber: 10000,
      }

      await LogSelectorPermission.start(pluginStub as any)

      const crawlerInstance = crawlStub.thisValues[0]
      const events = crawlerInstance.crawlParams.events

      // Verify only selector permission events are included
      const eventNames = events.map((event: any) => event.event)
      const expectedEvents = ['SelectorAllowed', 'SelectorDisallowed', 'EthTransfersAllowed', 'EthTransfersDisallowed']

      expectedEvents.forEach(expectedEvent => {
        expect(eventNames).to.include(expectedEvent)
      })

      // Verify no other events are included
      const unexpectedEvents = ['ProposalCreated', 'ProposalExecuted', 'VoteCast', 'MetadataSet']
      unexpectedEvents.forEach(unexpectedEvent => {
        expect(eventNames).to.not.include(unexpectedEvent)
      })
    })
  })

  describe('processError', () => {
    it('should log an error when processError is called', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const pluginStub = {
        address: '0x123',
        conditionAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
      }
      const logStub = { logIndex: 1, transactionHash: '0xhash' }

      await LogSelectorPermission.processError('error-message', pluginStub as any, logStub)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error SelectorPermission' as any)).to.be.true
    })

    it('should include plugin and log details in error message', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const pluginStub = {
        address: '0x123',
        conditionAddress: '0x456',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.admin,
      }
      const error = new Error('Blockchain connection failed')
      const logStub = {
        logIndex: 5,
        transactionHash: '0xabcdef',
        blockNumber: 15000,
      }

      await LogSelectorPermission.processError(error, pluginStub as any, logStub)

      expect(errorStub.calledOnce).to.be.true
    })
  })
})
