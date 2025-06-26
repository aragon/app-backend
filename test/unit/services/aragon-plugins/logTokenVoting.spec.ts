import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum, ITokenType } from '@types'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import config from '@config'

describe('AragonPlugins: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    config.SKIP_SYNC = false
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the LogDao using standard flow when token is not custom', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const isOptimizedFlowNeededStub = sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(false)

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any
      const plugin = {
        address: '0x123',
        tokenAddress: token.address,
        network: token.network,
      } as any

      await LogTokenVoting.start(plugin, token)

      expect(isOptimizedFlowNeededStub.calledOnce).to.be.true
      expect(crawlStub.calledTwice).to.be.true // Both plugin and token crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
    })

    it('should use optimized flow when needed for custom tokens', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const isOptimizedFlowNeededStub = sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(true)
      const syncHoldersStub = sandbox.stub(TokenHolderSync, 'syncAllTokenHolders').resolves()
      const syncDelegationStub = sandbox.stub(TokenHolderSync, 'syncDelegationEvents').resolves()
      const syncTransfersStub = sandbox.stub(TokenHolderSync, 'syncTransfersEvents').resolves()
      const convertToStandardSyncStub = sandbox.stub(TokenHolderSync, 'convertToStandardSync').resolves()

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        type: ITokenType.ERC20,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200, // Later than token.blockNumber, making it a custom token
      } as any

      await LogTokenVoting.start(plugin, token)

      expect(isOptimizedFlowNeededStub.calledOnce).to.be.true
      expect(syncHoldersStub.calledOnce).to.be.true
      expect(syncDelegationStub.calledOnce).to.be.true
      expect(syncTransfersStub.calledOnce).to.be.true
      expect(crawlStub.calledOnce).to.be.true // Only the plugin crawler
      expect(convertToStandardSyncStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should complete the optimized flow by converting to standard sync', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const isOptimizedFlowNeededStub = sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(true)
      const syncHoldersStub = sandbox.stub(TokenHolderSync, 'syncAllTokenHolders').resolves()
      const syncDelegationStub = sandbox.stub(TokenHolderSync, 'syncDelegationEvents').resolves()
      const syncTransfersStub = sandbox.stub(TokenHolderSync, 'syncTransfersEvents').resolves()
      const convertToStandardSyncStub = sandbox.stub(TokenHolderSync, 'convertToStandardSync').resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        type: ITokenType.ERC20,
      } as any
      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        interfaceType: 'tokenVoting',
      } as any

      await LogTokenVoting.start(plugin, token)

      expect(isOptimizedFlowNeededStub.calledOnce).to.be.true
      expect(syncHoldersStub.calledOnce).to.be.true
      expect(syncDelegationStub.calledOnce).to.be.true
      expect(syncTransfersStub.calledOnce).to.be.true
      expect(convertToStandardSyncStub.calledOnce).to.be.true
      expect(convertToStandardSyncStub.calledWith(plugin, token)).to.be.true

      // Verify end log contains timing information
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should handle errors during crawling for the plugin crawler', async () => {
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

      sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(false)
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

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash1' })).to.be.true
    })

    it('should handle errors during crawling for the token crawler', async () => {
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

      sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(false)
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

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 2, transactionHash: '0xhash2' })).to.be.true
    })

    it('should handle errors in optimized flow', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 50, // Earlier than plugin.blockNumber, making it a custom token
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(true)
      sandbox.stub(TokenHolderSync, 'syncAllTokenHolders').resolves()
      sandbox.stub(TokenHolderSync, 'syncDelegationEvents').resolves()
      sandbox.stub(TokenHolderSync, 'syncTransfersEvents').resolves()
      sandbox.stub(TokenHolderSync, 'convertToStandardSync').resolves()

      sandbox.stub(logger, 'verbose')
      const error = new Error('Test error from optimized flow')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 3, transactionHash: '0xhash3' })
        }
      })

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 3, transactionHash: '0xhash3' })).to.be.true
    })

    it('should start with veGovernance crawlers when votingEscrow addresses are provided', async () => {
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

      await LogTokenVoting.start(plugin, token)

      expect(crawlStub.callCount).to.equal(2) // plugin, veGov crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
    })

    it('should handle errors from veGovernance crawler', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: 'tokenVoting',
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
      const error = new Error('Test error from exit queue crawler')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onCall(0).resolves() // plugin crawler
      crawlStub.onCall(1).callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 4, transactionHash: '0xhash4' })
        }
      })

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(crawlStub.callCount).to.equal(2)
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 4, transactionHash: '0xhash4' })).to.be.true
    })

    it('should start with historical flag passed to all crawlers', async () => {
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

      await LogTokenVoting.start(plugin, token, true) // Pass isHistorical = true

      expect(crawlStub.callCount).to.equal(2) // plugin, escrowAdapter, escrow, and exit queue crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ blockNumber: 1 } as any)
      await LogTokenVoting.processError(
        'error',
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

  describe('erc20Governance', () => {
    it('should handle erc20Governance path directly', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const isOptimizedFlowNeededStub = sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(false)

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

      expect(isOptimizedFlowNeededStub.calledOnce).to.be.true
      expect(crawlStub.calledTwice).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should skip sync for large tokens when SKIP_SYNC is enabled', async () => {
      config.SKIP_SYNC = true

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        save: sandbox.stub().resolves(),
      } as any

      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
      } as any

      sandbox.stub(TokenHolderSync, 'isOptimizedFlowNeeded').resolves(true)
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogTokenVoting.start(plugin, token)

      expect(verboseStub.calledWith('Skip sync large token' as any)).to.be.true
      expect(token.skipSync).to.be.true
      expect(token.save.calledOnce).to.be.true
    })
  })

  describe('veGovernance', () => {
    it('should handle veGovernance path directly', async () => {
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

      await LogTokenVoting.veGovernance(plugin, token)

      expect(crawlStub.callCount).to.equal(2)
      expect(verboseStub.calledWith('Start LogTokenVoting veGovernance' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting veGovernance' as any)).to.be.true
    })
  })

  it('should process error with complete details', async () => {
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
    expect(errorStub.firstCall.args[0]).to.equal('Error LogTokenVoting')
  })
})
