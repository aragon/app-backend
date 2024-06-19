import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { NetworksEnum } from '@types'
import Logger from '@logger'

describe('Indexer:Aggregator:Member', () => {
  let sandbox: SinonSandbox

  const rawDaoDoc = {
    network: NetworksEnum.ethereumMainnet,
    pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    fromBlockNumber: 1,
    toBlockNumber: 2,
    daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
    toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
    delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    votingPower: '100',
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorMembers', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorMembers.start()

      expect(stubLogger.calledWith('End AggregatorMembers' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorMembers', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorMembers.start()

      expect(stubLogger.calledWith('End AggregatorMembers' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should call onDocument', async () => {
    const document = {
      address: '0x123',
      daos: [rawDaoDoc],
    }

    const stubLogger = sandbox.stub(Logger, 'verbose')

    await AggregatorMembers.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true

    const member = await Models.Member.findExistingLog({ address: document.address })
    expect(member.address).to.equal(document.address)
    expect(member.ens).to.be.null
    expect(member.daos.length).to.eq(1)
    expect(member.daos[0].network).to.eq(NetworksEnum.ethereumMainnet)
    expect(member.daos[0].pluginAddress).to.eq(document.daos[0].pluginAddress)
    expect(member.daos[0].fromBlockNumber).to.eq(document.daos[0].fromBlockNumber)
    expect(member.daos[0].toBlockNumber).to.eq(document.daos[0].toBlockNumber)
    expect(member.daos[0].fromTxHash).to.eq(document.daos[0].fromTxHash)
    expect(member.daos[0].toTxHash).to.eq(document.daos[0].toTxHash)
    expect(member.daos[0].delegateFromAddress).to.eq(document.daos[0].delegateFromAddress)
    expect(member.daos[0].delegateToAddress).to.eq(document.daos[0].delegateToAddress)
    expect(member.daos[0].votingPower).to.eq(document.daos[0].votingPower)
  })

  it('should update an existing aggregate member log', async () => {
    const rawDoc = {
      address: '0x12345',
      daos: [rawDaoDoc],
    }
    const dbDoc = await Models.Member.create(rawDoc)
    const loggerSpy = sandbox.stub(Logger, 'verbose')

    rawDoc.daos[0].delegateFromAddress = '0x011'
    await AggregatorMembers.onDocument(rawDoc as any)

    const updatedDoc = await dbDoc.reload()

    expect(updatedDoc.daos[0].delegateFromAddress).to.equal('0x011')
    expect(loggerSpy.calledOnceWith('Update Aggregate Member' as any)).to.be.true
  })

  it('should use default date when none is provided', () => {
    const pipeline = AggregatorMembers.query()
    expect(pipeline[0]['$match']?.event.$in.length).to.eq(3)
  })
})
