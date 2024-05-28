import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorMembers } from '@services/indexer/handlers/aggregator/member'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import dayjs from '@helpers/dayjs'

describe('Indexer:Aggregator:Member', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should start the AggregatorMembers', async () => {
    const findByTypeStub = sandbox.stub(Models.Aggregator, 'findByType')
    const stubLogger = sandbox.stub(logger, 'verbose')
    const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')
    const saveAggregationSyncStub = sandbox.stub(UtilsIndexer, 'saveAggregationSync')

    await AggregatorMembers.start()

    expect(stubLogger.calledWith('End AggregatorMembers' as any)).to.be.true
    expect(findByTypeStub.calledOnce).to.be.true
    expect(crawlerStub.calledOnce).to.be.true
    expect(saveAggregationSyncStub.calledOnce).to.be.true
  })

  it('should call onDocument', async () => {
    const document = {
      transactionHash: '0x0',
      blockNumber: 3,
      address: '0x123',
      daos: [
        {
          network: NetworksEnum.mainnet,
          pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
        },
      ],
    }

    const stubLogger = sandbox.spy(Logger, 'verbose')

    await AggregatorMembers.onDocument(document)

    expect(stubLogger.calledOnce).to.be.true

    const member = await Models.Member.findExistingLog(document.address)
    expect(member.transactionHash).to.equal(document.transactionHash)
    expect(member.blockNumber).to.equal(document.blockNumber)
    expect(member.address).to.equal(document.address)
    expect(member.ens).to.be.null
    expect(member.daos.length).to.eq(1)
    expect(member.daos[0].network).to.eq(NetworksEnum.mainnet)
    expect(member.daos[0].pluginAddress).to.eq(document.daos[0].pluginAddress)
    expect(member.daos[0].fromBlockNumber).to.eq(document.daos[0].fromBlockNumber)
    expect(member.daos[0].toBlockNumber).to.eq(document.daos[0].toBlockNumber)
    expect(member.daos[0].fromTxHash).to.eq(document.daos[0].fromTxHash)
    expect(member.daos[0].toTxHash).to.eq(document.daos[0].toTxHash)
    expect(member.daos[0].delegateFromAddress).to.eq(document.daos[0].delegateFromAddress)
    expect(member.daos[0].delegateToAddress).to.eq(document.daos[0].delegateToAddress)
    expect(member.daos[0].votingPower).to.eq(document.daos[0].votingPower)
  })

  it('should use default date when none is provided', () => {
    const defaultDate = dayjs.utc('1970-01-01T00:00:00Z').toDate()
    const pipeline = AggregatorMembers.query(defaultDate)
    expect(pipeline[0]['$match']?.createdAt.$gte).to.deep.equal(defaultDate)
  })
})
