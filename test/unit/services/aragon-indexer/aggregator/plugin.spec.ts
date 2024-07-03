import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorPlugin } from '@services/aragon-indexer/aggregator/plugin'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { IPluginAction, NetworksEnum } from '@types'
import Logger from '@logger'
import ProxyContractHelper from '@helpers/proxyContract'

describe('Indexer:Aggregator:Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorPlugin', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorPlugin.start()

      expect(stubLogger.calledWith('End AggregatorPlugin' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorPlugin', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorPlugin.start()

      expect(stubLogger.calledWith('End AggregatorPlugin' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', async () => {
    it('should call onDocument', async () => {
      const document: any = {
        transactionHash: '0x0',
        blockNumber: 3,
        network: NetworksEnum.ethereumMainnet,
        action: IPluginAction.install,
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5333',
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        tokenAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        pluginSetupRepoAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1968',
        build: '1',
        release: '1',
        subdomain: 'dao.eth',
        sender: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1900',
      }

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const getImplementationAddressStub = sandbox
        .stub(ProxyContractHelper, 'getImplementationAddress')
        .resolves('0x123')

      await AggregatorPlugin.onDocument(document as any)

      expect(stubLogger.calledWith('New Aggregate Plugin' as any)).to.be.true

      const member = await Models.Plugin.findExistingLog({
        transactionHash: document.transactionHash,
        action: document.action,
        network: document.network,
      })
      expect(member.transactionHash).to.equal(document.transactionHash)
      expect(member.blockNumber).to.equal(document.blockNumber)
      expect(member.network).to.equal(document.network)
      expect(member.action).to.equal(document.action)
      expect(member.address).to.equal(document.address)
      expect(member.implementationAddress).to.equal('0x123')
      expect(member.daoAddress).to.equal(document.daoAddress)
      expect(member.tokenAddress).to.equal(document.tokenAddress)
      expect(member.pluginSetupRepoAddress).to.equal(document.pluginSetupRepoAddress)
      expect(member.build).to.equal(document.build)
      expect(member.release).to.equal(document.release)
      expect(member.subdomain).to.equal(document.subdomain)
      expect(member.sender).to.equal(document.sender)
    })

    it('should call update', async () => {
      const document: any = {
        transactionHash: '0x0',
        blockNumber: 3,
        network: NetworksEnum.ethereumMainnet,
        action: IPluginAction.install,
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5333',
        implementationAddress: '0x123',
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        tokenAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        pluginSetupRepoAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1968',
        build: '1',
        release: '1',
        subdomain: 'dao.eth',
        sender: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1900',
      }

      await Models.Plugin.create(document)

      const stubLogger = sandbox.stub(Logger, 'verbose')

      document.build = '3'
      await AggregatorPlugin.onDocument(document as any)

      expect(stubLogger.calledWith('Update Aggregate Plugin' as any)).to.be.true

      const member = await Models.Plugin.findExistingLog({
        transactionHash: document.transactionHash,
        action: document.action,
        network: document.network,
      })
      expect(member.transactionHash).to.equal(document.transactionHash)
      expect(member.blockNumber).to.equal(document.blockNumber)
      expect(member.network).to.equal(document.network)
      expect(member.action).to.equal(document.action)
      expect(member.address).to.equal(document.address)
      expect(member.implementationAddress).to.equal(document.implementationAddress)
      expect(member.daoAddress).to.equal(document.daoAddress)
      expect(member.tokenAddress).to.equal(document.tokenAddress)
      expect(member.pluginSetupRepoAddress).to.equal(document.pluginSetupRepoAddress)
      expect(member.build).to.equal(document.build)
      expect(member.release).to.equal(document.release)
      expect(member.subdomain).to.equal(document.subdomain)
      expect(member.sender).to.equal(document.sender)
    })
  })

  it('should use default date when none is provided', () => {
    const pipeline = AggregatorPlugin.query([])
    expect(pipeline.length).to.equal(11)
  })
})
