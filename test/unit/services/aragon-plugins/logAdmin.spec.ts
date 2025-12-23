import { DAO } from '@artifacts/dao'
import { PermissionHandler } from '@handlers/permissionHandler'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogAdmin } from '@plugins/logAdmin'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogAdmin', () => {
  let sandbox: SinonSandbox
  let verboseStub: sinon.SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    verboseStub = sandbox.stub(logger, 'verbose')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the LogAdmin', async () => {
      sandbox.stub(LogAdmin, '_syncAdminMember').resolves()
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      await LogAdmin.start({
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
      } as any)

      expect(verboseStub.calledWith('Start LogAdmin' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
      expect(crawlStub.calledOnce).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const plugin = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any

      const error = new Error('Test error')
      sandbox.stub(LogAdmin, '_syncAdminMember').resolves()
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, 'log')
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogAdmin, 'processError').resolves()

      await LogAdmin.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, plugin, 'log')).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogAdmin.processError('error', { address: '0x123', network: NetworksEnum.ethereumSepolia } as any, 'log')
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogAdmin' as any)).to.be.true
    })
  })

  describe('_syncAdminMember', async () => {
    const topcis = [
      new Interface(DAO.abi).getEvent('Granted')?.topicHash,
      new Interface(DAO.abi).getEvent('Revoked')?.topicHash,
    ]

    it('should sync admin member on grant', async () => {
      const plugin = {
        transactionHash: '0x123',
        address: '0x123',
        interfaceType: IPluginInterfaceType.admin,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [
          {
            topics: [topcis[0]],
          },
        ],
      } as any)

      const parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Granted',
        args: {
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
          event: 'Granted',
          where: '0xdao',
          who: '0xplugin',
        },
      } as any)

      const txInfoLog = {
        transactionHash: '0x123',
        address: '0xplugin',
        transactionIndex: 1,
        network: NetworksEnum.ethereumSepolia,
      }

      const parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns(txInfoLog as any)

      const handleAdminSupportedStub = sandbox.stub(PermissionHandler, 'handleForAdminPlugin').resolves()
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()

      await LogAdmin._syncAdminMember(plugin)

      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledWith(plugin.transactionHash, plugin.network)).to.be.true
      expect(parseLogStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledOnce).to.be.true
      expect(handleAdminSupportedStub.calledOnce).to.be.true
      expect(handleAdminSupportedStub.args[0][0]).to.be.eq('0xplugin')
      expect(handleAdminSupportedStub.args[0][1]).to.be.eq('0xdao')
      expect(handleAdminSupportedStub.args[0][2]).to.be.eq(plugin.network)
      expect(handleAdminSupportedStub.args[0][3]).to.be.eq('0xplugin')
      expect(isSupportedStub.calledOnce).to.be.true
    })
  })
})
