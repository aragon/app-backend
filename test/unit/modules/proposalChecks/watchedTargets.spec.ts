import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import DbTx from '@modules/dbTx'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState from '@modules/proposalChecks/permissions'
import Revisions from '@modules/proposalChecks/revisions'
import WatchedTargets from '@modules/proposalChecks/watchedTargets'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { DECATS, FARTDAO } from '@test/mock/proposalChecks/incidents'
import { IAssessmentRequestStatus, IEventLogPluginType, type IRawAction } from '@types'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'
import sinon from 'sinon'

const PLUGIN = '0x1111111111111111111111111111111111111111'
const COND = '0x2222222222222222222222222222222222222222'
const network = ProposalList[0].network

const requestFor = async (proposal: any, blockNumber: number, rawActions: IRawAction[]) =>
  DbTx.executeTxFn(
    async ({ session }: { session: ClientSession }) => {
      const event = { blockNumber, blockHash: null, transactionHash: `0xtx${blockNumber}`, logIndex: 0 }
      const { request } = await Models.ProposalAssessment.requestForRevision(
        {
          proposal: { ...proposal.toObject(), rawActions, allowFailureMap: '0' },
          event,
          causeId: Revisions.causeIdForEvent('created', event),
          evidenceBlock: { number: blockNumber, hash: null, time: proposal.blockTimestamp },
        },
        session,
      )
      await DbTx.safeCommit(session)
      return request
    },
    { stopRetry: true, throwOnStop: true },
  )

describe('Model: ProposalWatchedTarget', () => {
  it('registers targets once per address, merging kinds and proposals, and drops a target nobody depends on', async () => {
    await Models.ProposalWatchedTarget.register(
      network,
      [
        { address: DECATS.daoAddress, kind: 'dao' },
        { address: PLUGIN, kind: 'plugin' },
      ],
      'p-1',
      100,
    )
    await Models.ProposalWatchedTarget.register(
      network,
      [{ address: DECATS.daoAddress.toLowerCase(), kind: 'actionTarget' }],
      'p-2',
      200,
    )

    const dao = await Models.ProposalWatchedTarget.findByAddress(network, DECATS.daoAddress)
    expect(dao!.kinds.sort()).to.deep.eq(['actionTarget', 'dao'])
    expect(dao!.proposalIds).to.deep.eq(['p-1', 'p-2'])
    expect(dao!.registeredAtBlock).to.eq(100)
    expect(await Models.ProposalWatchedTarget.countDocuments({})).to.eq(2)

    await Models.ProposalWatchedTarget.release('p-1')
    expect((await Models.ProposalWatchedTarget.findByAddress(network, DECATS.daoAddress))!.proposalIds).to.deep.eq([
      'p-2',
    ])
    expect(await Models.ProposalWatchedTarget.findByAddress(network, PLUGIN)).to.eq(null)
  })
})

describe('proposalChecks/watchedTargets', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('collects the DAO, its plugins, every action target and every permission condition', () => {
    const base = fakeAssessmentContext()
    const ctx = {
      ...base,
      actions: AssessmentContextBuilder._flatten(
        [DECATS.rawActions[0], FARTDAO.rawActions[1]],
        base.request.daoAddress,
      ),
      plugins: [{ address: PLUGIN, interfaceType: 'tokenVoting', isSubPlugin: false }],
      permissions: {
        available: true,
        grants: {
          [PermissionState.key(base.request.daoAddress, PLUGIN, 'x')]: {
            where: base.request.daoAddress,
            who: PLUGIN,
            permissionId: 'x',
            condition: COND,
          },
          [PermissionState.key(base.request.daoAddress, PLUGIN, 'y')]: {
            where: base.request.daoAddress,
            who: PLUGIN,
            permissionId: 'y',
            condition: null,
          },
        },
      },
    }

    expect(WatchedTargets.collect(ctx)).to.deep.eq([
      { address: base.request.daoAddress, kind: 'dao' },
      { address: PLUGIN, kind: 'plugin' },
      { address: DECATS.rawActions[0].to, kind: 'actionTarget' },
      { address: FARTDAO.rawActions[1].to, kind: 'actionTarget' },
      { address: COND, kind: 'condition' },
    ])
  })

  it('finds the earliest indexed change on a target between the evidence block and the head, and nothing outside it', async () => {
    const dao = DECATS.daoAddress
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress: dao,
      blockNumber: 150,
      logIndex: 5,
    })
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress: dao,
      blockNumber: 120,
      logIndex: 9,
      transactionHash: '0x01',
    })
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress: dao,
      blockNumber: 100,
      logIndex: 1,
      transactionHash: '0x02',
    })
    await Models.LogPluginSetupProcessor.create({
      event: IEventLogPluginType.UpdateApplied,
      transactionHash: '0x03',
      transactionIndex: 0,
      logIndex: 2,
      blockNumber: 110,
      network,
      daoAddress: dao,
      pluginAddress: PLUGIN,
    } as any)

    const hit = await WatchedTargets.replay(network, [{ address: dao, kind: 'dao' }], 100, 200)
    const none = await WatchedTargets.replay(network, [{ address: PLUGIN, kind: 'plugin' }], 150, 200)
    const early = await WatchedTargets.replay(network, [{ address: dao, kind: 'dao' }], 200, 200)

    expect(hit).to.deep.eq({ source: 'setup', blockNumber: 110, transactionHash: '0x03', logIndex: 2 })
    expect(none).to.eq(null)
    expect(early).to.eq(null)
  })

  it('registers the targets at the chain head and requests the current revision again when the index already holds a later change', async () => {
    const proposal = await Models.Proposal.create({
      ...ProposalList[0],
      daoAddress: DECATS.daoAddress,
      id: undefined,
    } as any)
    const request = await requestFor(proposal, 100, DECATS.rawActions)
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress: DECATS.daoAddress,
      blockNumber: 130,
      logIndex: 4,
      transactionHash: '0x' + '9'.repeat(64),
    })
    sandbox.stub(Web3Helper, 'getBlockNumber').resolves(180)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1_700_000_000)
    const base = fakeAssessmentContext()
    const ctx = {
      ...base,
      request: { ...base.request, daoAddress: DECATS.daoAddress },
      actions: AssessmentContextBuilder._flatten(DECATS.rawActions, DECATS.daoAddress),
    }

    await WatchedTargets.register(request, ctx)

    const watched = await Models.ProposalWatchedTarget.findByAddress(network, DECATS.daoAddress)
    expect(watched!.proposalIds).to.deep.eq([proposal.id])
    expect(watched!.registeredAtBlock).to.eq(180)
    const requests = await Models.ProposalAssessment.find({ proposalId: proposal.id }).sort({ generation: 1 })
    expect(requests.map(r => [r.generation, r.causeId.split(':')[0], r.captured.evidenceBlock.number])).to.deep.eq([
      [1, 'created', 100],
      [2, 'refresh', 130],
    ])
    expect(requests[1].revisionId).to.eq(requests[0].revisionId)
    expect(requests[1].status).to.eq(IAssessmentRequestStatus.Pending)
    expect(requests[1].captured.rawActions).to.deep.eq(requests[0].captured.rawActions)

    await WatchedTargets.register(request, ctx)
    expect(await Models.ProposalAssessment.countDocuments({ proposalId: proposal.id })).to.eq(2)
  })

  it('logs and moves on when the head cannot be read, leaving the result in place', async () => {
    const request = fakeProposalAssessment() as any
    sandbox.stub(Web3Helper, 'getBlockNumber').resolves(-1)

    await WatchedTargets.register(request, fakeAssessmentContext())

    expect(await Models.ProposalWatchedTarget.countDocuments({})).to.eq(0)
  })
})
