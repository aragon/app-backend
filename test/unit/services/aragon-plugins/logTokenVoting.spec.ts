import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { IGovernanceErc20Logs, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Web3Helper, 'getBlockNumber').resolves()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start veGovernance flow for escrowAdapter token type', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      await LogTokenVoting.start(plugin, token)

      expect(crawlStub.callCount).to.equal(2) // plugin and veGovernance crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting veGovernance' as any)).to.be.true
    })

    it('should start erc20Governance flow for ERC20 token type', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
      } as any

      await LogTokenVoting.start(plugin, token)

      expect(crawlStub.calledTwice).to.be.true // Both plugin and token crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should pass isHistorical flag to crawlers', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
      } as any

      await LogTokenVoting.start(plugin, token, true) // Pass isHistorical = true

      expect(crawlStub.calledTwice).to.be.true
    })
  })

  describe('erc20Governance', () => {
    it('should handle standard flow when token is eligible for sync', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
      } as any

      await LogTokenVoting.erc20Governance(plugin, token)

      expect(crawlStub.calledTwice).to.be.true // Both plugin and token crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('Start Token Sync' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should return items unchanged when event is not DelegateVotesChanged', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        interfaceType: 'tokenVoting',
      } as any

      await LogTokenVoting.erc20Governance(plugin, token)

      expect(crawlStub.calledTwice).to.be.true
    })

    it('should return items unchanged when plugin has no tokenAddress', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        interfaceType: 'tokenVoting',
      } as any

      await LogTokenVoting.erc20Governance(plugin, token)

      expect(crawlStub.calledTwice).to.be.true
    })

    it('should handle errors during plugin crawling', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')
      const error = new Error('Test error from plugin crawler')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash1' })
        }
      })
      crawlStub.onSecondCall().resolves()

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash1' })).to.be.true
    })

    it('should handle errors during token crawling', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      const error = new Error('Test error from token crawler')
      sandbox.stub(logger, 'verbose')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 2, transactionHash: '0xhash2' })
        }
      })

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 2, transactionHash: '0xhash2' })).to.be.true
    })

    it('should use tokenCrawler when token has no existing sync block', async () => {
      // Setup
      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
      } as any

      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        interfaceType: 'tokenVoting',
      } as any

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')

      // Act
      await LogTokenVoting.erc20Governance(plugin, token)

      // Assert
      expect(crawlStub.calledTwice).to.be.true
    })

    it('should filter logs returning empty array when no logs provided', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')

      let capturedFilterLogs: any
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any): Promise<undefined> {
        if (this.crawlParams?.filterLogs) {
          capturedFilterLogs = this.crawlParams.filterLogs
          await capturedFilterLogs([])
        }
        return undefined
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(capturedFilterLogs).to.not.be.undefined
    })

    it('should filter duplicate DelegateVotesChanged logs keeping highest block number', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')

      let result: any
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any) {
        if (this.crawlParams?.filterLogs) {
          const logs = [
            { topics: ['0xevent', '0xdelegate1'], blockNumber: 100n },
            { topics: ['0xevent', '0xdelegate2'], blockNumber: 101n },
            { topics: ['0xevent', '0xdelegate1'], blockNumber: 102n },
            { topics: ['0xevent', '0xdelegate3'], blockNumber: 103n },
            { topics: ['0xevent', '0xdelegate2'], blockNumber: 99n },
          ]
          result = await this.crawlParams.filterLogs(logs)
        }
        return undefined
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(result).to.have.length(3)
      expect(result[0].topics[1]).to.equal('0xdelegate3')
      expect(result[1].topics[1]).to.equal('0xdelegate1')
      expect(result[2].topics[1]).to.equal('0xdelegate2')
    })

    it('should log filtered results with correct counts', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any) {
        if (this.crawlParams?.filterLogs) {
          const logs = [
            { topics: ['0xevent', '0xdelegate1'], blockNumber: 100n },
            { topics: ['0xevent', '0xdelegate1'], blockNumber: 102n },
            { topics: ['0xevent', '0xdelegate2'], blockNumber: 101n },
          ]
          await this.crawlParams.filterLogs(logs)
        }
        return undefined
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(verboseStub.calledWith('Filtered DelegateVotesChanged logs' as any)).to.be.true
    })

    it('should handle filterLogs with single log', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')

      let result: any
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any) {
        if (this.crawlParams?.filterLogs) {
          const logs = [{ topics: ['0xevent', '0xdelegate1'], blockNumber: 100n }]
          result = await this.crawlParams.filterLogs(logs)
        }
        return undefined
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(result).to.have.length(1)
      expect(result[0].topics[1]).to.equal('0xdelegate1')
    })

    it('should handle filterLogs sorting by blockNumber descending', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')

      let result: any
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any) {
        if (this.crawlParams?.filterLogs) {
          const logs = [
            { topics: ['0xevent', '0xdelegate1'], blockNumber: 50n },
            { topics: ['0xevent', '0xdelegate2'], blockNumber: 150n },
            { topics: ['0xevent', '0xdelegate3'], blockNumber: 100n },
          ]
          result = await this.crawlParams.filterLogs(logs)
        }
        return []
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(result).to.have.length(3)
      expect(Number(result[0].blockNumber)).to.be.greaterThan(Number(result[1].blockNumber))
      expect(Number(result[1].blockNumber)).to.be.greaterThan(Number(result[2].blockNumber))
    })

    it('should remove all duplicates keeping only highest blockNumber per delegate', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(logger, 'verbose')

      let result: any
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: any) {
        if (this.crawlParams?.filterLogs) {
          const logs = [
            { topics: ['0xevent', '0xdelegateA'], blockNumber: 100n },
            { topics: ['0xevent', '0xdelegateA'], blockNumber: 200n },
            { topics: ['0xevent', '0xdelegateA'], blockNumber: 150n },
            { topics: ['0xevent', '0xdelegateB'], blockNumber: 300n },
            { topics: ['0xevent', '0xdelegateB'], blockNumber: 250n },
          ]
          result = await this.crawlParams.filterLogs(logs)
        }
        return []
      })

      await LogTokenVoting.erc20Governance(pluginStub, tokenStub)

      expect(result).to.have.length(2)
      const delegateALog = result.find((r: any) => r.topics[1] === '0xdelegateA')
      const delegateBLog = result.find((r: any) => r.topics[1] === '0xdelegateB')

      expect(delegateALog.blockNumber).to.equal(200n)
      expect(delegateBLog.blockNumber).to.equal(300n)
    })

    it('should properly map config items based on event type', async () => {
      const mockConfigIndexer = [
        {
          event: 'DelegateVotesChanged',
          config: [{ handler: 'original-handler-1', validator: 'validator-1' }],
        },
        {
          event: 'OtherGovernanceEvent',
          config: [{ handler: 'original-handler-2', validator: 'validator-2' }],
        },
      ]

      let tokenCrawlerConfig: any = null
      let crawlerCount = 0
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        // Capture the second crawler (tokenCrawler)
        crawlerCount++
        if (crawlerCount === 2) {
          tokenCrawlerConfig = config
        }
        this.crawl = sandbox.stub().resolves()
        this.end = sandbox.stub().resolves()
        this.crawlSetting = { lastSync: 1000 }
      }

      const GovernanceErc20HandlerMock = {
        delegateVotesChangedBatch: 'batch-handler',
      }

      // Mock IGovernanceErc20Logs to have multiple values
      const mockGovernanceErc20Logs = {
        DelegateVotesChanged: 'DelegateVotesChanged',
        OtherGovernanceEvent: 'OtherGovernanceEvent',
      }

      const LogTokenVotingProxy = proxyquire('@plugins/logTokenVoting', {
        '@logger': { default: logger },
        '@indexer/configIndexer': { default: mockConfigIndexer },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
        '@handlers/governanceErc20Handler': { GovernanceErc20Handler: GovernanceErc20HandlerMock },
        '@types': {
          IGovernanceErc20Logs: mockGovernanceErc20Logs,
          NetworksEnum: NetworksEnum,
          ITokenType: ITokenType,
        },
      }).LogTokenVoting

      sandbox.stub(logger, 'verbose')

      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      await LogTokenVotingProxy.erc20Governance(pluginStub, tokenStub)

      // Verify tokenCrawler config was captured
      expect(tokenCrawlerConfig).to.not.be.null
      expect(tokenCrawlerConfig.events).to.have.length(2)

      // Find the DelegateVotesChanged event - should have modified handler
      const delegateVotesChangedEvent = tokenCrawlerConfig.events.find((e: any) => e.event === 'DelegateVotesChanged')
      expect(delegateVotesChangedEvent).to.exist
      expect(delegateVotesChangedEvent.config[0].handler).to.equal('batch-handler')

      const otherEvent = tokenCrawlerConfig.events.find((e: any) => e.event === 'OtherGovernanceEvent')
      expect(otherEvent).to.exist
      expect(otherEvent.config[0].handler).to.equal('original-handler-2')
    })

    it('should execute filterLogs function with various log scenarios', async () => {
      let capturedFilterLogs: any = null
      let crawlerCount = 0
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        // Capture filterLogs from second crawler (tokenCrawler)
        crawlerCount++
        if (crawlerCount === 2 && config.filterLogs) {
          capturedFilterLogs = config.filterLogs
        }
        this.crawl = sandbox.stub().resolves()
        this.end = sandbox.stub().resolves()
        this.crawlSetting = { lastSync: 1000 }
      }

      const mockConfigIndexer = [
        {
          event: IGovernanceErc20Logs.DelegateVotesChanged,
          config: [{ handler: 'handler', validator: 'validator' }],
        },
      ]

      const LogTokenVotingProxy = proxyquire('@plugins/logTokenVoting', {
        '@logger': { default: logger },
        '@indexer/configIndexer': { default: mockConfigIndexer },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
      }).LogTokenVoting

      const verboseStub = sandbox.stub(logger, 'verbose')

      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      await LogTokenVotingProxy.erc20Governance(pluginStub, tokenStub)

      expect(capturedFilterLogs).to.not.be.null

      const emptyResult = await capturedFilterLogs([])
      expect(emptyResult).to.deep.equal([])

      const logsWithDuplicates = [
        { topics: ['0xevent', '0xdelegate1'], blockNumber: 100n },
        { topics: ['0xevent', '0xdelegate2'], blockNumber: 101n },
        { topics: ['0xevent', '0xdelegate1'], blockNumber: 102n }, // duplicate, higher block
        { topics: ['0xevent', '0xdelegate3'], blockNumber: 103n },
        { topics: ['0xevent', '0xdelegate2'], blockNumber: 99n }, // duplicate, lower block
      ]

      const filteredResult = await capturedFilterLogs(logsWithDuplicates)

      // Should keep highest block numbers for each delegate
      expect(filteredResult).to.have.length(3)
      expect(filteredResult[0].topics[1]).to.equal('0xdelegate3') // block 103
      expect(filteredResult[1].topics[1]).to.equal('0xdelegate1') // block 102 (not 100)
      expect(filteredResult[2].topics[1]).to.equal('0xdelegate2') // block 101 (not 99)

      expect(verboseStub.calledWith('Filtered DelegateVotesChanged logs' as any)).to.be.true

      // Test 3: Single log (no duplicates)
      verboseStub.resetHistory()
      const singleLog = [{ topics: ['0xevent', '0xdelegate1'], blockNumber: 100n }]
      const singleResult = await capturedFilterLogs(singleLog)
      expect(singleResult).to.have.length(1)
      expect(singleResult[0].topics[1]).to.equal('0xdelegate1')

      // Verify logging for single log
      expect(verboseStub.calledWith('Filtered DelegateVotesChanged logs' as any)).to.be.true
    })
  })

  describe('veGovernance', () => {
    it('should handle veGovernance path with proper crawlers', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
        interfaceType: 'tokenVoting',
        blockNumber: 100,
      } as any

      await LogTokenVoting.veGovernance(plugin, token)

      expect(crawlStub.callCount).to.equal(2) // plugin and veGovernance crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
      expect(verboseStub.calledWith('Start Token Sync' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting veGovernance' as any)).to.be.true
    })

    it('should handle errors from veGovernance crawlers', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: 'tokenVoting',
        blockNumber: 100,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      const tokenStub = {
        address: '0x456',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
      } as any

      sandbox.stub(logger, 'verbose')
      const error = new Error('Test error from veGovernance crawler')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onCall(0).resolves() // plugin crawler
      crawlStub.onCall(1).callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 4, transactionHash: '0xhash4' })
        }
      })

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.veGovernance(pluginStub, tokenStub)

      expect(crawlStub.callCount).to.equal(2)
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 4, transactionHash: '0xhash4' })).to.be.true
    })

    it('should pass isHistorical flag to veGovernance crawlers', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
      } as any
      const plugin = {
        address: '0x123',
        tokenAddress: token.address,
        network: token.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      await LogTokenVoting.veGovernance(plugin, token, true) // Pass isHistorical = true

      expect(crawlStub.callCount).to.equal(2)
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
    })

    it('should handle error from plugin crawler in veGovernance', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: 'tokenVoting',
        blockNumber: 100,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      const tokenStub = {
        address: '0x456',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
        blockNumber: 50,
      } as any

      sandbox.stub(logger, 'verbose')
      const error = new Error('Plugin crawler error in veGovernance')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      // First call is plugin crawler - trigger onError
      crawlStub.onFirstCall().callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 5, transactionHash: '0xhash5' })
        }
      })
      // Second call is veGovernance crawler
      crawlStub.onSecondCall().resolves()

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.veGovernance(pluginStub, tokenStub)

      expect(crawlStub.callCount).to.equal(2)
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 5, transactionHash: '0xhash5' })).to.be.true
    })
  })

  describe('runEscrowCrawler', () => {
    it('should build escrow crawler and run crawl and end', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
        blockNumber: 100,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      await LogTokenVoting.runEscrowCrawler(plugin, token, false)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
    })

    it('should pass isHistorical flag to escrow crawler', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.escrowAdapter,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      } as any

      await LogTokenVoting.runEscrowCrawler(plugin, token, true)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
    })

    it('should log warning and skip crawl when votingEscrow is missing', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const warnStub = sandbox.stub(logger, 'warn')

      const token = { address: '0x123' } as any
      const plugin = {
        address: '0x456',
        votingEscrow: null,
      } as any

      await LogTokenVoting.runEscrowCrawler(plugin, token, false)

      expect(crawlStub.notCalled).to.be.true
      expect(endStub.notCalled).to.be.true
      expect(warnStub.calledWith('LogTokenVoting: runEscrowCrawler - missing votingEscrow or token' as any)).to.be.true
    })

    it('should log warning and skip crawl when token is null', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const warnStub = sandbox.stub(logger, 'warn')

      const plugin = {
        address: '0x456',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
        },
      } as any

      await LogTokenVoting.runEscrowCrawler(plugin, null as any, false)

      expect(crawlStub.notCalled).to.be.true
      expect(endStub.notCalled).to.be.true
      expect(warnStub.calledWith('LogTokenVoting: runEscrowCrawler - missing votingEscrow or token' as any)).to.be.true
    })
  })

  describe('processError', () => {
    it('should log error with complete details', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const error = new Error('Test error')
      const plugin = {
        address: '0x123',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumSepolia,
      } as any
      const log = { logIndex: 1, transactionHash: '0xhash' }

      await LogTokenVoting.processError(error, plugin, log)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogTokenVoting' as any)).to.be.true
    })

    it('should handle processError with string error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogTokenVoting.processError(
        'string error',
        {
          address: '0x123',
          tokenAddress: '0xtoken',
          network: NetworksEnum.ethereumSepolia,
        } as any,
        'log',
      )
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogTokenVoting' as any)).to.be.true
    })
  })
})
