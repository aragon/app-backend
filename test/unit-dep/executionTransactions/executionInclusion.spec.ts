import TransactionController from '@api/controllers/transaction'
import { Models } from '@dbModels'
import utils from '@helpers/utils'
import { stubRabbitmqSend } from '@test/lib/stubs/rabbitmq'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: Execution Transactions Inclusion', () => {
  let sandbox: SinonSandbox

  // Dao 2.0 — Ethereum Sepolia. Synced from 10637071 to 11030000, with proposal executions in range.
  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x4648e36587B6c3DbF04Addf77e0121A33ce67c80'
  const fromBlock = 10637071
  const blockLimit = 11030000

  const listBySide = (side?: ITransactionSide) =>
    TransactionController.getTransactionsWithPagination(
      { page: 1, limit: 100 },
      { daoAddress, network, ...(side && { side }) },
    )

  // Route the aragon-dao consumer queues so one sync produces the whole pipeline:
  // Executed -> daoTransactions, deposits -> daoAssets, proposals -> action decoder,
  // execution rows -> delayed classification/decode worker (immediate in tests).
  const processQueues = { daoTransactions: true, daoAssets: true, proposalActions: true, executionActions: true }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    stubRabbitmqSend(sandbox, processQueues)
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('drives the full pipeline from a single sync and serves every filter through the controller', async function () {
    this.timeout(600000)

    const libUtil = new LibUtils({
      daoAddress,
      network,
      config: { sandbox, blockLimit, processQueues },
    })

    // Single sync drives everything via the enqueued queue messages.
    await libUtil.syncCompleteDao(fromBlock)

    await LibUtils.handleEventsFromTxHashes(
      [
        '0x970241e611dc0687d86fda51a1daf2e828c2b6a71629ed6eb3a9e01b7c809058',
        '0x9435f4e715dc43f8793e566e710aa461f517baf5b549b5bf2a59201c8bf850ed',
      ],
      network,
    )

    // The delayed executionActions worker resolves `source` after the (respected) broker delay —
    // wait until every execution row (including the replayed ones above) is finalized before asserting.
    const settleTimeout = Date.now() + 30_000
    while (Date.now() < settleTimeout) {
      const pending = await Models.Transaction.countDocuments({
        daoAddress,
        network,
        type: ITransactionType.execution,
        source: null,
      })
      if (pending === 0) break
      await utils.wait(1000)
    }

    // Controller filters: all / execution / deposit / withdraw.
    const all = await listBySide()
    const executions = await listBySide(ITransactionSide.execution)
    const deposits = await listBySide(ITransactionSide.deposit)
    const withdraws = await listBySide(ITransactionSide.withdraw)

    // "All" is the sum of the side partitions (this DAO only has these three sides).
    expect(all.data.length).to.equal(executions.data.length + deposits.data.length + withdraws.data.length)

    // Execution rows are present and correctly shaped through the API.
    expect(executions.data.length, 'expected execution rows').to.be.greaterThan(0)
    for (const execution of executions.data as any[]) {
      expect(execution.side).to.equal(ITransactionSide.execution)
      expect(execution.type).to.equal(ITransactionType.execution)
      expect(execution.value).to.equal('0')
      expect(execution.actionCount).to.be.a('number')
      expect(execution.source).to.be.a('string')
      // the heavy action payload is never served on the list (read-through detail endpoint only)
      expect(execution.rawActions).to.be.undefined
      expect(execution.actions).to.be.undefined
    }

    // Detail endpoint: everything the (deep-linkable) execution dialog needs, in one call.
    // The list exposes each execution row's unique id, which the dialog uses to fetch it.
    for (const row of executions.data as any[]) {
      expect(row.id, 'execution list rows expose their id').to.be.a('string')
      const detail = await TransactionController.getExecutionActions({ id: row.id, network })

      expect(detail.transactionHash).to.equal(row.transactionHash)
      expect(detail.executedBy).to.be.a('string').and.match(/^0x/)
      expect(detail.source).to.equal(row.source)
      expect(detail.actionCount).to.equal(row.actionCount)
      expect(detail.blockTimestamp).to.be.a('number').and.be.greaterThan(0)

      // these executions are proposal-linked: actions are read through from the decoded proposal
      expect(detail.decoding).to.equal(false)
      expect(detail.rawActions.length).to.equal(row.actionCount)
      expect(detail.actions.length).to.equal(row.actionCount)
    }
  })
})
