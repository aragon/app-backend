import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorDelegate } from '@services/aragon-indexer/aggregator/delegate'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { ITokenType, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

describe('Indexer:Aggregator:Delegate', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorDelegate', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorDelegate.start()

      expect(stubLogger.calledWith('End AggregatorDelegate' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorDelegate', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorDelegate.start()

      expect(stubLogger.calledWith('End AggregatorDelegate' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should call onDocument', async () => {
    const document = {
      transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875b',
      blockNumber: 48130742,
      network: NetworksEnum.polygonMainnet,
      tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
      fromDelegate: '0x0000000000000000000000000000000000000000',
      toDelegate: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4',
      pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e4',
      daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AED',
      amount: '101192000000000000',
      token: {
        type: ITokenType.GovernanceERC20,
        address: '0x5B08305497fb3a087Fc582D45fcb648c98177c43',
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x5b08305497fb3a087fc582d45fcb648c98177c43.png',
        name: 'Sepolia Avalanche',
        decimals: 18,
        symbol: 'SAVL',
      },
    }

    const stubLogger = sandbox.stub(Logger, 'verbose')
    const stubBlock = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

    await AggregatorDelegate.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true
    expect(stubBlock.calledOnceWith(document.blockNumber, document.network)).to.be.true

    const delegate = await Models.Delegate.findExistingLog({
      network: document.network,
      transactionHash: document.transactionHash,
    } as any)
    expect(delegate.id).to.exist
    expect(delegate.network).to.eq(document.network)
    expect(delegate.blockTimestamp).to.eq(100)
    expect(delegate.blockNumber).to.eq(document.blockNumber)
    expect(delegate.transactionHash).to.eq(document.transactionHash)
    expect(delegate.fromDelegate).to.eq(document.fromDelegate)
    expect(delegate.toDelegate).to.eq(document.toDelegate)
    expect(delegate.tokenAddress).to.eq(document.tokenAddress)
    expect(delegate.daoAddress).to.eq(document.daoAddress)
    expect(delegate.token.address).to.eq(document.token.address)
    expect(delegate.token.symbol).to.eq(document.token.symbol)
    expect(delegate.token.name).to.eq(document.token.name)
  })

  it('should update an existing aggregate delegate log', async () => {
    const rawDoc: any = {
      transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875b',
      blockNumber: 48130742,
      network: NetworksEnum.polygonMainnet,
      tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
      fromDelegate: '0x0000000000000000000000000000000000000000',
      toDelegate: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4',
      pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e4',
      daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AED',
      amount: '101192000000000000',
      token: {
        type: ITokenType.GovernanceERC20,
        address: '0x5B08305497fb3a087Fc582D45fcb648c98177c43',
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x5b08305497fb3a087fc582d45fcb648c98177c43.png',
        name: 'Sepolia Avalanche',
        decimals: 18,
        symbol: 'SAVL',
      },
    }
    const dbDoc = await Models.Delegate.create(rawDoc)
    const loggerSpy = sandbox.stub(Logger, 'verbose')
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

    rawDoc.tokenAddress = '0x0'
    await AggregatorDelegate.onDocument(rawDoc)

    const updatedDoc = await dbDoc.reload()

    expect(updatedDoc.tokenAddress).to.equal('0x0')
    expect(loggerSpy.calledOnceWith('Update Aggregate Delegate' as any)).to.be.true
  })

  it('should query', () => {
    const pipeline = AggregatorDelegate.query()
    expect(pipeline.length).to.eq(6)
  })
})
