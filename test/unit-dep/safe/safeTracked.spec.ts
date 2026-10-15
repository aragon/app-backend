import SafeController from '@api/controllers/safe'
import config from '@config'
import { Models } from '@dbModels'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import SafeTxServiceModule from '@modules/safeTxService'
import { LibUtils } from '@test/lib/unit-dep/lib'
import SafeFixture from '@test/lib/unit-dep/safe'
import {
  EnumQueueName,
  type IExposableError,
  IPluginInterfaceType,
  IPluginStatus,
  type IQueueSafeSync,
  type ISafeQueueResponse,
  ISafeSource,
  ISafeTransactionState,
  ITransactionType,
  ProposalActionType,
} from '@types'
import { expect } from 'chai'
import { getAddress, Interface, ZeroAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonSpy } from 'sinon'

const executedQuery = {
  network: SafeFixture.network,
  safeAddress: SafeFixture.safeAddress,
  transactionHash: { $in: SafeFixture.executedTxHashes },
}

describe('Safe tracking', function () {
  this.retries(2)
  let sandbox: SinonSandbox
  let owners: SinonSpy
  let sent: Array<{ queue: EnumQueueName; payload: any }>

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    owners = SafeFixture.watchOwners(sandbox)
    sent = SafeFixture.stubSafeQueues(sandbox)
  })

  afterEach(() => sandbox.restore())

  const replayAndRefresh = async () => {
    await SafeFixture.replayRegistration()

    let refresh: IQueueSafeSync | undefined
    let refreshes = 0
    for (const message of sent) {
      if (message.queue !== EnumQueueName.safeRefresh) continue
      refresh = message.payload.params as IQueueSafeSync
      refreshes += 1
    }
    expect(refreshes).to.equal(1)
    if (!refresh) throw new Error('Safe refresh was not sent')
    expect(refresh).to.include({
      network: SafeFixture.network,
      address: SafeFixture.safeAddress,
      historyPages: config.SAFE_API.BACKFILL_HISTORY_PAGES,
    })
    await SafeFixture.refresh(sandbox, refresh.network, refresh.address, refresh.historyPages, 3)
    await SafeFixture.keepKnownTransactions(SafeFixture.network, SafeFixture.safeAddress, SafeFixture.executedTxHashes)
  }

  it('makes the Safe a process of its DAO once Execute is granted', async function () {
    this.timeout(300_000)
    const { network, safeAddress, daoAddress } = SafeFixture

    try {
      await SafeController.getTransactions(network, safeAddress, { limit: 20, offset: 0 })
      expect.fail('expected an untracked Safe')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(404)
    }
    expect(await Models.SafeTransaction.countDocuments({ network, safeAddress })).to.equal(0)
    expect(await Models.SafeAccount.countDocuments({ network, safeAddress })).to.equal(0)

    await SafeFixture.replayRegistration()

    const dao = await Models.Dao.findOne({ network, address: daoAddress })
    expect(dao?.blockNumber).to.equal(11799744)

    const plugins = await Models.Plugin.find({ network, address: safeAddress, daoAddress })
    expect(plugins).to.have.length(1)
    expect(plugins[0].interfaceType).to.equal(IPluginInterfaceType.safe)
    expect(plugins[0].status).to.equal(IPluginStatus.installed)
    expect(plugins[0].isProcess).to.equal(true)
    expect(plugins[0].isBody).to.equal(false)
    expect(plugins[0].isSubPlugin).to.equal(false)

    await SafeFixture.assertOwners(owners)
    const slug = await Models.PluginSlug.findPluginSlug(safeAddress, daoAddress, network)
    expect(slug).to.exist
    expect(slug).to.include({ network, pluginAddress: safeAddress, daoAddress })
    expect(slug?.slug).to.be.a('string').and.not.equal('')

    let refreshes = 0
    for (const message of sent) {
      if (message.queue !== EnumQueueName.safeRefresh) continue
      refreshes += 1
      expect(message.payload.params).to.include({
        network,
        address: safeAddress,
        historyPages: config.SAFE_API.BACKFILL_HISTORY_PAGES,
      })
    }
    expect(refreshes).to.equal(1)
  })

  it('stores the Safe transactions once the refresh runs', async function () {
    this.timeout(300_000)
    const { network, safeAddress } = SafeFixture
    const get = sandbox.spy(SafeTxServiceModule, 'get')
    await replayAndRefresh()

    const rows = await Models.SafeTransaction.find(executedQuery).lean()
    expect(rows).to.have.length(4)
    for (let nonce = 0; nonce < SafeFixture.executedTxHashes.length; nonce += 1) {
      let found = 0
      for (const row of rows) {
        if (row.nonce !== nonce.toString()) continue
        found += 1
        expect(row.state).to.equal(ISafeTransactionState.executed)
        expect(row.safeTxHash).to.match(/^0x[0-9a-fA-F]{64}$/)
        expect(row.transactionHash).to.match(/^0x[0-9a-fA-F]{64}$/)
        expect(row.transactionHash).to.equal(SafeFixture.executedTxHashes[nonce])
      }
      expect(found).to.equal(1)
    }

    const account = await Models.SafeAccount.findOne({ network, safeAddress })
    expect(account?.queueFetchedAt).to.be.instanceOf(Date)
    expect(account?.historyFetchedAt).to.be.instanceOf(Date)
    let complete: boolean | undefined
    for (const call of get.getCalls()) {
      if (call.args[2]?.executed !== false) continue
      const page = (await call.returnValue) as ISafeQueueResponse
      complete = page.next == null && page.count === page.results.length
    }
    expect(complete).to.be.a('boolean')
    expect(account?.queueComplete).to.equal(complete)
    const historyFetchedAt = account!.historyFetchedAt!.getTime()

    let decodes = 0
    for (const message of sent) {
      if (message.queue !== EnumQueueName.safeTransactionActions) continue
      for (const row of rows) {
        if (message.payload.params.id === row.id) decodes += 1
      }
    }
    expect(decodes).to.equal(4)
    for (const row of rows) {
      let found = 0
      for (const message of sent) {
        if (message.queue === EnumQueueName.safeTransactionActions && message.payload.params.id === row.id) found += 1
      }
      expect(found).to.equal(1)
    }

    const readStart = Date.now()
    const all = await SafeController.getTransactions(network, safeAddress, { limit: 20, offset: 0 })
    const readEnd = Date.now()
    const count = await Models.SafeTransaction.countDocuments({
      network,
      safeAddress,
      state: { $in: [ISafeTransactionState.live, ISafeTransactionState.executed] },
    })
    expect(all.count).to.equal(count)
    expect(all.results).to.have.length(Math.min(20, count))
    expect(all.next).to.equal(count > 20 ? '20' : null)
    expect(all.previous).to.equal(null)
    expect(all.meta.source).to.equal(ISafeSource.store)
    expect(all.meta.partial).to.equal(!complete)
    expect(all.meta.fetchedAt).to.equal(account!.queueFetchedAt!.toISOString())
    expect(all.meta.stale).to.be.a('boolean')
    const staleAt = account!.queueFetchedAt!.getTime() + config.SAFE_API.QUEUE_STALE_WINDOW
    if (!complete || readStart > staleAt) expect(all.meta.stale).to.equal(true)
    if (complete && readEnd <= staleAt) expect(all.meta.stale).to.equal(false)
    for (const row of all.results) {
      expect(row.safeTxHash).to.match(/^0x[0-9a-fA-F]{64}$/)
      if (row.isExecuted) expect(row.transactionHash).to.match(/^0x[0-9a-fA-F]{64}$/)
      else expect(row).not.to.have.property('transactionHash')
      expect(row.nonce).to.be.a('string')
      expect(row.to).to.equal(getAddress(row.to))
    }
    for (const stored of rows) {
      let found = 0
      for (const row of all.results) {
        if (row.safeTxHash !== stored.safeTxHash) continue
        found += 1
        for (const field of [
          'safeTxHash',
          'nonce',
          'state',
          'from',
          'to',
          'value',
          'data',
          'operation',
          'safeTxGas',
          'baseGas',
          'gasPrice',
          'gasToken',
          'refundReceiver',
          'confirmations',
          'confirmationsRequired',
          'isSuccessful',
          'submissionDate',
          'executionDate',
          'transactionHash',
        ] as const) {
          expect(row[field]).to.deep.equal(stored[field])
        }
        expect(row.isExecuted).to.equal(true)
        expect(row.signatures).to.equal(null)
      }
      expect(found).to.equal(1)
    }

    const executed = await SafeController.getTransactions(network, safeAddress, {
      limit: 20,
      offset: 0,
      state: ISafeTransactionState.executed,
    })
    expect(executed.results).to.have.length(4)
    expect(executed.count).to.equal(4)
    for (const row of executed.results) expect(row).to.have.property('state', ISafeTransactionState.executed)

    const live = await SafeController.getTransactions(network, safeAddress, {
      limit: 20,
      offset: 0,
      state: ISafeTransactionState.live,
    })
    for (const row of live.results) {
      expect(row).to.have.property('state', ISafeTransactionState.live)
      expect(row.isExecuted).to.equal(false)
    }

    const byTo = await SafeController.getTransactions(network, safeAddress, {
      limit: 20,
      offset: 0,
      state: ISafeTransactionState.executed,
      to: SafeFixture.owners[1],
    })
    expect(byTo.count).to.equal(1)
    expect(byTo.results).to.have.length(1)
    expect(byTo.results[0].transactionHash).to.equal(SafeFixture.executedTxHashes[1])
    expect(byTo.results[0].to).not.to.equal(SafeFixture.owners[1])

    const seen = new Set<string>()
    for (let offset = 0; offset < 4; offset += 2) {
      const page = await SafeController.getTransactions(network, safeAddress, {
        limit: 2,
        offset,
        state: ISafeTransactionState.executed,
      })
      expect(page.results).to.have.length(2)
      expect(page.count).to.equal(4)
      expect(page.next).to.equal(offset === 0 ? '2' : null)
      expect(page.previous).to.equal(offset === 0 ? null : '0')
      for (const row of page.results) seen.add(row.safeTxHash)
    }
    expect(seen.size).to.equal(4)
    for (const row of rows) expect(seen.has(row.safeTxHash)).to.equal(true)

    const after = await Models.SafeAccount.findOne({ network, safeAddress })
    expect(after?.historyFetchedAt?.getTime()).to.equal(historyFetchedAt)
  })

  it('decodes every stored Safe transaction into its actions', async function () {
    this.timeout(300_000)
    const { network, safeAddress } = SafeFixture
    expect(await ProxyToken.saveAndGetToken(ZeroAddress, network)).to.exist
    await replayAndRefresh()

    const rows = await Models.SafeTransaction.find(executedQuery).lean()
    expect(rows).to.have.length(4)
    let decodes = 0
    for (const message of sent) {
      if (message.queue !== EnumQueueName.safeTransactionActions) continue
      for (const row of rows) {
        if (message.payload.params.id !== row.id) continue
        await SafeTransactionsModule.decode(row.id)
        decodes += 1
      }
    }
    expect(decodes).to.equal(4)

    const decoded = await Models.SafeTransaction.find(executedQuery).lean()
    expect(decoded).to.have.length(4)
    for (const row of decoded) expect(row.decoding).to.equal(false)

    let native
    let multiSend
    let daoExecute
    let addOwner
    for (const row of decoded) {
      if (row.nonce === '0') native = row
      if (row.nonce === '1') multiSend = row
      if (row.nonce === '2') daoExecute = row
      if (row.nonce === '3') addOwner = row
    }
    expect(native?.rawActions).to.have.length(1)
    expect(native?.actions).to.have.length(1)
    expect(native?.actions[0].type).to.equal(ProposalActionType.TransferNative)
    expect(native?.actions[0].to).to.equal(SafeFixture.owners[0])
    expect(native?.actions[0].amount).to.equal('1000000000000000')

    expect(multiSend?.operation).to.equal(1)
    expect(multiSend?.rawActions).to.have.length(2)
    expect(multiSend?.actions).to.have.length(2)
    for (let index = 0; index < 2; index += 1) {
      expect(multiSend?.actions[index].type).to.equal(ProposalActionType.TransferNative)
      expect(multiSend?.actions[index].to).to.equal(SafeFixture.owners[index])
      expect(multiSend?.actions[index].amount).to.equal('500000000000000')
    }

    expect(daoExecute?.actions).to.have.length(1)
    if (!daoExecute?.data) throw new Error('DAO execute transaction was not stored')
    expect(daoExecute.actions[0].type).to.equal(ProposalActionType.Execute)
    expect(daoExecute.actions[0].to).to.equal(SafeFixture.daoAddress)
    expect(daoExecute.actions[0].inputData?.function).to.equal('execute')
    const execute = new Interface(['function execute(bytes32,(address to,uint256 value,bytes data)[],uint256)'])
    const params = execute.decodeFunctionData('execute', daoExecute.data)
    expect(daoExecute.actions[0].inputData.parameters).to.have.length(3)
    for (let index = 0; index < params.length; index += 1) {
      const expected = JSON.parse(
        JSON.stringify(params[index], (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
      )
      expect(daoExecute.actions[0].inputData.parameters[index].value).to.deep.equal(expected)
    }

    expect(addOwner?.actions).to.have.length(1)
    expect(addOwner?.actions[0].type).to.equal(ProposalActionType.Unknown)
    expect(addOwner?.actions[0].inputData?.function).to.equal('addOwnerWithThreshold')
    expect(addOwner?.actions[0].inputData?.parameters).to.have.length(2)
    expect(addOwner?.actions[0].inputData?.parameters[0].value).to.equal(SafeFixture.owners[1])
    expect(addOwner?.actions[0].inputData?.parameters[1].value).to.equal('2')

    const route = await SafeController.getTransactionActions(network, safeAddress, daoExecute.safeTxHash)
    expect(route.decoding).to.equal(false)
    expect(route.actions).to.deep.equal(daoExecute.actions)
  })

  it('refreshing and decoding again keeps the stored transactions', async function () {
    this.timeout(300_000)
    const { network, safeAddress } = SafeFixture
    expect(await ProxyToken.saveAndGetToken(ZeroAddress, network)).to.exist
    await replayAndRefresh()
    const decode = sandbox.spy(DaoExecutionHandler, 'decodeExecutionActions')
    const rows = await Models.SafeTransaction.find(executedQuery).sort({ id: 1 }).lean()
    expect(rows).to.have.length(4)
    for (const row of rows) await SafeTransactionsModule.decode(row.id)
    expect(decode.callCount).to.equal(4)
    const decoded = await Models.SafeTransaction.find(executedQuery).sort({ id: 1 }).lean()
    expect(decoded).to.have.length(4)
    for (let index = 0; index < rows.length; index += 1) {
      expect(decoded[index].id).to.equal(rows[index].id)
      expect(decoded[index].decoding).to.equal(false)
      expect(decoded[index].actions.length).to.be.greaterThan(0)
      await SafeTransactionsModule.decode(rows[index].id)
    }
    expect(decode.callCount).to.equal(4)
    expect(await Models.SafeTransaction.find(executedQuery).sort({ id: 1 }).lean()).to.deep.equal(decoded)

    const messages = sent.length
    await SafeServiceModule.syncStore(network, safeAddress, config.SAFE_API.BACKFILL_HISTORY_PAGES)
    const refreshed = await Models.SafeTransaction.find(executedQuery).sort({ id: 1 }).lean()
    expect(refreshed).to.have.length(4)
    for (let index = 0; index < decoded.length; index += 1) {
      expect(refreshed[index].id).to.equal(decoded[index].id)
      expect(refreshed[index]._id.toString()).to.equal(decoded[index]._id.toString())
      expect(refreshed[index].safeTxHash).to.equal(decoded[index].safeTxHash)
      expect(refreshed[index].state).to.equal(decoded[index].state)
      expect(refreshed[index].rawActions).to.deep.equal(decoded[index].rawActions)
      expect(refreshed[index].actions).to.deep.equal(decoded[index].actions)
      expect(refreshed[index].decoding).to.equal(false)
    }
    for (let index = messages; index < sent.length; index += 1) {
      if (sent[index].queue !== EnumQueueName.safeTransactionActions) continue
      for (const row of decoded) expect(sent[index].payload.params.id).not.to.equal(row.id)
    }
    expect(decode.callCount).to.equal(4)
  })

  it('settles each stored transaction from its real execution', async function () {
    this.timeout(300_000)
    const { network, safeAddress, daoAddress } = SafeFixture
    await replayAndRefresh()

    const imported = await Models.SafeTransaction.find(executedQuery)
    expect(imported).to.have.length(4)
    for (const row of imported) expect(row.executionBlockNumber ?? null).to.equal(null)

    await LibUtils.handleEventsFromTxHashes(SafeFixture.executedTxHashes, network)

    const settled = await Models.SafeTransaction.find(executedQuery).lean()
    expect(settled).to.have.length(4)
    for (let nonce = 0; nonce < SafeFixture.executedTxHashes.length; nonce += 1) {
      let found = 0
      for (const row of settled) {
        if (row.nonce !== nonce.toString()) continue
        found += 1
        expect(row.state).to.equal(ISafeTransactionState.executed)
        expect(row.isSuccessful).to.equal(true)
        expect(row.transactionHash).to.equal(SafeFixture.executedTxHashes[nonce])
        expect(row.executionBlockNumber).to.equal(SafeFixture.executedBlocks[nonce])
        const timestamp = await Web3Helper.getBlockTimestamp(SafeFixture.executedBlocks[nonce], network)
        expect(timestamp).to.be.greaterThan(0)
        expect(row.executionDate).to.equal(new Date(timestamp * 1000).toISOString())
      }
      expect(found).to.equal(1)
    }

    const daoExecution = await Models.Transaction.findOne({
      network,
      daoAddress,
      transactionHash: SafeFixture.executedTxHashes[2],
      type: ITransactionType.execution,
    })
    expect(daoExecution).to.exist

    let refreshes = 0
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refreshes += 1
    }
    expect(refreshes).to.equal(1)

    await LibUtils.handleEventsFromTxHashes(SafeFixture.executedTxHashes, network)

    const again = await Models.SafeTransaction.find(executedQuery).lean()
    expect(again).to.have.length(4)
    for (const before of settled) {
      let found = 0
      for (const after of again) {
        if (after.id !== before.id) continue
        found += 1
        expect(after.state).to.equal(before.state)
        expect(after.isSuccessful).to.equal(before.isSuccessful)
        expect(after.transactionHash).to.equal(before.transactionHash)
        expect(after.executionBlockNumber).to.equal(before.executionBlockNumber)
        expect(after.executionDate).to.equal(before.executionDate)
      }
      expect(found).to.equal(1)
    }

    refreshes = 0
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refreshes += 1
    }
    expect(refreshes).to.equal(1)
  })
})
