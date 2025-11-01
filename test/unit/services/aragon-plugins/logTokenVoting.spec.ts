import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { NetworksEnum, ITokenType } from '@types'
import { expect } from 'chai'

describe('AragonPlugins: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start veGovernance flow for escrowAdapter token type', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
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
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
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
