import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum, ITokenType } from '@types'
import { expect } from 'chai'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import config from '@config'

describe('AragonPlugins: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    config.IGNORE_TRANSFER = false
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
      const isTokenNotEligibleStub = sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(false)

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

      expect(isTokenNotEligibleStub.calledOnce).to.be.true
      expect(crawlStub.calledTwice).to.be.true // Both plugin and token crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should pass isHistorical flag to crawlers', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(false)

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
      const isTokenNotEligibleStub = sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(false)

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

      expect(isTokenNotEligibleStub.calledOnce).to.be.true
      expect(crawlStub.calledTwice).to.be.true // Both plugin and token crawlers
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('Start Token Sync' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })

    it('should skip sync for large tokens when IGNORE_TRANSFER is enabled', async () => {
      config.IGNORE_TRANSFER = true

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
        interfaceType: 'tokenVoting',
      } as any

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(true)
      const syncDelegationEventsStub = sandbox.stub(TokenHolderSync, 'syncDelegationEvents').resolves()
      const convertToStandardSyncStub = sandbox.stub(TokenHolderSync, 'convertToStandardSync').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogTokenVoting.erc20Governance(plugin, token)

      expect(verboseStub.calledWith('Skip sync large token' as any)).to.be.true
      expect(token.ignoreTransfer).to.be.true
      expect(token.save.calledOnce).to.be.true
      expect(crawlStub.calledOnce).to.be.true
      expect(syncDelegationEventsStub.calledOnce).to.be.true
      expect(convertToStandardSyncStub.calledOnce).to.be.true
    })

    it('should use delegation-only sync when token is not eligible but IGNORE_TRANSFER is false', async () => {
      config.IGNORE_TRANSFER = false

      const token = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        blockNumber: 100,
        save: sandbox.stub().resolves(),
      } as any

      const plugin = {
        address: '0x456',
        tokenAddress: token.address,
        network: token.network,
        blockNumber: 200,
        interfaceType: 'tokenVoting',
      } as any

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(true)
      const syncDelegationStub = sandbox.stub(TokenHolderSync, 'syncDelegationEvents').resolves()
      const convertToStandardStub = sandbox.stub(TokenHolderSync, 'convertToStandardSync').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogTokenVoting.erc20Governance(plugin, token)

      expect(token.ignoreTransfer).to.be.not.eq(true)
      expect(token.save.calledOnce).to.be.false

      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('Start Sync Only Delegates Events' as any)).to.be.true
      expect(syncDelegationStub.calledOnce).to.be.true
      expect(convertToStandardStub.calledOnce).to.be.true
      expect(crawlStub.calledOnce).to.be.true // Only plugin crawler
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
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

      sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(false)
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

      sandbox.stub(TokenHolderSync, 'isTokenNotEligibleForSync').resolves(false)
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
