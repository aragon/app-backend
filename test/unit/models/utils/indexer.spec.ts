import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { UtilsIndexer } from '@models/utils/indexer'
import DbTx from '@modules/dbTx'

describe('Model/Utils: indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('saveSync', async () => {
    const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
    const networkDbStub = { update: sandbox.stub().resolves() }
    const crawlerStub = { crawlResult: { nbError: 0, latestBlockNumber: 1234 } }

    const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
      await txFn({ session: sessionStub })
    })

    await UtilsIndexer.saveSync(crawlerStub as any, networkDbStub as any, 'lastBlockMetadataLog')

    expect(executeTxFnStub.calledOnce).to.be.true
    expect(networkDbStub.update.calledOnce).to.be.true
    expect(
      networkDbStub.update.calledWith({
        lastBlockMetadataLog: 1234,
      }),
    ).to.be.true
    expect(sessionStub.commitTransaction.calledOnce).to.be.true
    expect(sessionStub.endSession.calledOnce).to.be.true
  })

  it('should not update saveSync', async function () {
    const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
    const crawlerStub = { crawlResult: { nbError: 0, latestBlockNumber: 0 } }
    const networkDbStub = { update: sandbox.stub().resolves() }

    const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
      await txFn({ session: sessionStub })
    })

    await UtilsIndexer.saveSync(crawlerStub as any, networkDbStub as any, 'lastBlockMetadataLog')

    expect(executeTxFnStub.calledOnce).to.be.false
    expect(networkDbStub.update.called).to.be.false
    expect(sessionStub.commitTransaction.called).to.be.false
    expect(sessionStub.endSession.called).to.be.false
  })
})
