import SafeController from '@api/controllers/safe'
import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import SafeFixture from '@test/lib/unit-dep/safe'
import {
  EnumQueueName,
  type HexAddress,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  type IQueueSafeSync,
  IReportResultType,
  type ISafeMultisigTransaction,
  ISafeTransactionState,
  ISettingStatus,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const { network, body } = SafeFixture
const daoY = '0x2222222222222222222222222222222222222222' as HexAddress
const sppY = '0x3333333333333333333333333333333333333333' as HexAddress

describe('Safe proposal reports', function () {
  this.retries(2)
  let sandbox: SinonSandbox
  let sent: Array<{ queue: EnumQueueName; payload: any }>

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sent = SafeFixture.stubSafeQueues(sandbox)
  })

  afterEach(() => sandbox.restore())

  const seedBody = async (daoAddress: HexAddress, sppAddress: HexAddress) => {
    await Models.Dao.create({
      network,
      address: daoAddress,
      creatorAddress: SafeFixture.owners[0],
      transactionHash: body.installTx,
      blockNumber: body.installBlock,
    })
    await Models.Plugin.create({
      network,
      address: sppAddress,
      daoAddress,
      transactionHash: body.installTx,
      blockNumber: body.installBlock,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
      uninstalled: { status: false },
    })
    await Models.Setting.create({
      network,
      daoAddress,
      pluginAddress: sppAddress,
      transactionHash: body.installTx,
      blockNumber: body.installBlock,
      status: ISettingStatus.active,
      stages: [0, 1].map(stageIndex => ({
        stageIndex,
        plugins: [{ address: body.safeAddress, brandId: VotingBodyBrandIdentity.SAFE }],
      })),
    })
  }

  const seedProposal = async (daoAddress: HexAddress, sppAddress: HexAddress, incrementalId: 1 | 3) => {
    await Models.Proposal.create({
      id: `${body.installTx}-${sppAddress}-${incrementalId}`,
      transactionHash: body.installTx,
      blockNumber: body.installBlock,
      network,
      pluginAddress: sppAddress,
      daoAddress,
      proposalIndex: body.proposalIndexes[incrementalId],
      incrementalId,
      creatorAddress: SafeFixture.owners[0],
      startDate: 0,
      endDate: 0,
    })
  }

  const refresh = async () => {
    const ref: ILogInfo = {
      network,
      address: body.daoAddress,
      blockNumber: body.installBlock,
      transactionHash: body.installTx,
      transactionIndex: 0,
      logIndex: 0,
      eventName: 'SettingUpdated',
    }
    const result = await SafeDaoAssociationsModule.reconcileDao(body.daoAddress, network, ref)
    expect(result.failed).to.equal(0)
    const row = await Models.Plugin.findSafeRow({ network, address: body.safeAddress, daoAddress: body.daoAddress })
    expect(row?.isBody).to.equal(true)

    let queued: IQueueSafeSync | undefined
    let count = 0
    for (const message of sent) {
      if (message.queue !== EnumQueueName.safeRefresh) continue
      queued = message.payload.params as IQueueSafeSync
      count += 1
    }
    expect(count).to.equal(1)
    if (!queued) throw new Error('Safe refresh was not sent')
    expect(queued).to.include({
      network,
      address: body.safeAddress,
      historyPages: config.SAFE_API.BACKFILL_HISTORY_PAGES,
    })
    await SafeFixture.refresh(sandbox, queued.network, queued.address, queued.historyPages, 8)
  }

  const transactions = async () => {
    const rows: ISafeMultisigTransaction[] = []
    let offset = 0
    let more = true
    while (more) {
      const page = await SafeController.getTransactions(network, body.safeAddress, {
        limit: 100,
        offset,
        state: ISafeTransactionState.executed,
      })
      for (const row of page.results) if (BigInt(row.nonce) <= 8n) rows.push(row)
      offset += page.results.length
      more = page.next != null
      if (more && !page.results.length) throw new Error('Stored Safe pagination stopped early')
    }
    for (const safeTxHash of Object.values(body.reports)) {
      let found = 0
      for (const row of rows) if (row.safeTxHash === safeTxHash) found += 1
      expect(found).to.equal(1)
    }
    return rows
  }

  const report = (proposalId: number, stageId: number, resultType: IReportResultType) => ({
    daoId: `${network}-${body.daoAddress}`,
    bodyId: body.sppAddress,
    proposalId,
    stageId,
    resultType,
  })

  it('links the stored report transactions to their proposals', async function () {
    this.timeout(300_000)
    await seedBody(body.daoAddress, body.sppAddress)
    await seedProposal(body.daoAddress, body.sppAddress, 1)
    await seedProposal(body.daoAddress, body.sppAddress, 3)
    await refresh()

    const rows = await transactions()
    expect(rows.find(row => row.safeTxHash === body.reports[2])?.aragonReports).to.deep.equal([
      report(1, 0, IReportResultType.Veto),
    ])
    expect(rows.find(row => row.safeTxHash === body.reports[4])?.aragonReports).to.deep.equal([
      report(1, 1, IReportResultType.Approval),
    ])
    expect(rows.find(row => row.safeTxHash === body.reports[8])?.aragonReports).to.deep.equal([
      report(3, 0, IReportResultType.Veto),
    ])
    for (const row of rows) {
      if (Number(row.nonce) > 8) continue
      if (['2', '4', '6', '8'].includes(row.nonce)) continue
      expect(row).not.to.have.property('aragonReports')
    }
    expect(rows.find(row => row.nonce === '6')?.aragonReports).to.deep.equal([])
  })

  it('does not link reports to a DAO whose SPP the Safe is not a body of', async function () {
    this.timeout(300_000)
    await seedBody(body.daoAddress, body.sppAddress)
    await seedBody(daoY, sppY)
    await seedProposal(body.daoAddress, body.sppAddress, 1)
    await seedProposal(daoY, sppY, 1)
    await refresh()

    const rows = await transactions()
    expect(rows.find(row => row.safeTxHash === body.reports[2])?.aragonReports).to.deep.equal([
      report(1, 0, IReportResultType.Veto),
    ])
    expect(rows.find(row => row.safeTxHash === body.reports[4])?.aragonReports).to.deep.equal([
      report(1, 1, IReportResultType.Approval),
    ])
    for (const row of rows) {
      for (const linked of row.aragonReports ?? []) {
        expect(linked.daoId).to.equal(`${network}-${body.daoAddress}`)
        expect(linked.bodyId).to.equal(body.sppAddress)
      }
    }
  })

  it('leaves a report empty when its proposal is not indexed', async function () {
    this.timeout(300_000)
    await seedBody(body.daoAddress, body.sppAddress)
    await seedProposal(body.daoAddress, body.sppAddress, 1)
    await refresh()

    const rows = await transactions()
    expect(rows.find(row => row.safeTxHash === body.reports[2])?.aragonReports).to.deep.equal([
      report(1, 0, IReportResultType.Veto),
    ])
    expect(rows.find(row => row.safeTxHash === body.reports[4])?.aragonReports).to.deep.equal([
      report(1, 1, IReportResultType.Approval),
    ])
    expect(rows.find(row => row.safeTxHash === body.reports[8])?.aragonReports).to.deep.equal([])
  })
})
