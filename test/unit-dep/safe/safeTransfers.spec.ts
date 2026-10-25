import { Models } from '@dbModels'
import { DaoTransferHandler } from '@handlers/daoTransferHanlder'
import ConfigIndexerHelper from '@helpers/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('Registered Safe transfers', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    for (const level of ['info', 'verbose', 'debug', 'warn', 'error'] as const) sandbox.stub(logger, level)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => sandbox.restore())

  it('stores an ERC20 sent to a registered Sepolia Safe', async function () {
    this.timeout(120000)
    const network = NetworksEnum.ethereumSepolia
    const safeAddress = '0x1F01e6fe406295c9fe42189A2ef999636a04132a'
    const tokenAddress = '0x9A68b7C1bed8e5eA110975A68F3d152941C1812F'
    const transactionHash = '0xed12c508274c6d8af8e15ba3ce31ee061a92062e905ccb14cad7913c46eaf0dc'
    await Models.SafeAccount.track(network, safeAddress)
    await Models.SafeAccount.updateOne({ id: `${network}-${safeAddress}` }, { $set: { blockNumber: 8418135 } })
    const crawl = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves([])

    await DaoTransactions.start({ daoAddress: safeAddress, network })

    const crawler = (crawl.thisValues as BlockchainLogCrawler[]).find(
      item => item['crawlParams'].logService === ConfigIndexerHelper.builders.tokenDeposit(network, safeAddress),
    )!
    expect(crawler).to.exist
    const receipt = await Web3Helper.getTransactionReceipt(transactionHash, network)
    const log = receipt!.logs.find(
      item => item.index === 709 && item.address.toLowerCase() === tokenAddress.toLowerCase(),
    )!
    expect(log).to.exist
    const formatted = crawler['logProcessingEngine'].formatLog(log)
    expect(formatted.handler).to.equal(DaoTransferHandler.incomingErc20Transfer)
    await formatted.handler!(formatted.event, formatted.info)

    const rows = await Models.Transaction.find({ network, daoAddress: safeAddress, transactionHash }).lean()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]).to.include({
      tokenAddress,
      fromAddress: utils.zeroAddress,
      toAddress: safeAddress,
      type: ITransactionType.erc20,
      side: ITransactionSide.deposit,
      value: '10000000.0',
      logIndex: 709,
    })
    expect(await Models.Dao.countDocuments({ network, address: safeAddress })).to.equal(0)
  })
})
