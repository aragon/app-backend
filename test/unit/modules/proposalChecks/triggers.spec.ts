import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import DbTx from '@modules/dbTx'
import Revisions from '@modules/proposalChecks/revisions'
import ProposalCheckTriggers from '@modules/proposalChecks/triggers'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { ProposalList } from '@test/mock/fakeProposal'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { IEventLogPluginType } from '@types'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'
import sinon from 'sinon'

const network = ProposalList[0].network
const PLUGIN = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'

const proposalWithRequest = async (index: string, evidenceBlock: number) => {
  const proposal = await Models.Proposal.create({
    ...ProposalList[0],
    proposalIndex: index,
    daoAddress: DECATS.daoAddress,
    id: undefined,
  } as any)
  await DbTx.executeTxFn(
    async ({ session }: { session: ClientSession }) => {
      const event = { blockNumber: evidenceBlock, blockHash: null, transactionHash: `0xtx${index}`, logIndex: 0 }
      await Models.ProposalAssessment.requestForRevision(
        {
          proposal: { ...proposal.toObject(), rawActions: DECATS.rawActions, allowFailureMap: '0' },
          event,
          causeId: Revisions.causeIdForEvent('created', event),
          evidenceBlock: { number: evidenceBlock, hash: null, time: 1 },
        },
        session,
      )
      await DbTx.safeCommit(session)
    },
    { stopRetry: true, throwOnStop: true },
  )
  return proposal
}
const causes = async (proposalId: string) =>
  (await Models.ProposalAssessment.find({ proposalId }).sort({ generation: 1 })).map(
    r => `${r.causeId.split(':').slice(0, 2).join(':')}@${r.captured.evidenceBlock.number}`,
  )

describe('proposalChecks/triggers', () => {
  const sandbox = sinon.createSandbox()
  beforeEach(() => {
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1_700_000_000)
  })
  afterEach(() => sandbox.restore())

  it('routes a newly indexed permission change to every open proposal watching the address, once, and moves the cursor', async () => {
    const a = await proposalWithRequest('1', 100)
    const b = await proposalWithRequest('2', 100)
    await Models.ProposalWatchedTarget.register(network, [{ address: DECATS.daoAddress, kind: 'dao' }], a.id, 150)
    await Models.ProposalWatchedTarget.register(network, [{ address: DECATS.daoAddress, kind: 'dao' }], b.id, 150)
    await Models.ProposalWatchedTarget.register(network, [{ address: OTHER, kind: 'actionTarget' }], b.id, 150)
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[0],
      network,
      daoAddress: DECATS.daoAddress,
      blockNumber: 160,
      logIndex: 3,
      transactionHash: '0x' + 'a'.repeat(64),
    })
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[1],
      network,
      blockNumber: 170,
      logIndex: 4,
      transactionHash: '0x' + 'b'.repeat(64),
    })

    const first = await ProposalCheckTriggers.run()
    const second = await ProposalCheckTriggers.run()

    expect(first).to.deep.eq({ routed: 2, refreshed: 2 })
    expect(second).to.deep.eq({ routed: 0, refreshed: 0 })
    expect(await causes(a.id)).to.deep.eq(['created:0xtx1@100', 'refresh:permission@160'])
    expect(await causes(b.id)).to.deep.eq(['created:0xtx2@100', 'refresh:permission@160'])
    expect(await Models.ProposalCheckCursor.read('permission')).to.be.a('string')
  })

  it('routes an applied plugin setup by DAO or plugin address, and skips a change already inside the latest evidence', async () => {
    const fresh = await proposalWithRequest('1', 100)
    const stale = await proposalWithRequest('2', 300)
    await Models.ProposalWatchedTarget.register(network, [{ address: PLUGIN, kind: 'plugin' }], fresh.id, 150)
    await Models.ProposalWatchedTarget.register(network, [{ address: PLUGIN, kind: 'plugin' }], stale.id, 350)
    await Models.LogPluginSetupProcessor.create({
      event: IEventLogPluginType.UpdateApplied,
      transactionHash: '0x' + 'c'.repeat(64),
      transactionIndex: 0,
      logIndex: 1,
      blockNumber: 200,
      network,
      daoAddress: OTHER,
      pluginAddress: PLUGIN,
    } as any)
    await Models.LogPluginSetupProcessor.create({
      event: IEventLogPluginType.InstallationPrepared,
      transactionHash: '0x' + 'd'.repeat(64),
      transactionIndex: 0,
      logIndex: 2,
      blockNumber: 210,
      network,
      daoAddress: OTHER,
      pluginAddress: PLUGIN,
    } as any)

    const result = await ProposalCheckTriggers.run()

    expect(result).to.deep.eq({ routed: 1, refreshed: 1 })
    expect(await causes(fresh.id)).to.deep.eq(['created:0xtx1@100', 'refresh:setup@200'])
    expect(await causes(stale.id)).to.deep.eq(['created:0xtx2@300'])
  })

  it('touches nothing when no watched address is involved', async () => {
    const proposal = await proposalWithRequest('1', 100)
    await Models.ProposalWatchedTarget.register(network, [{ address: OTHER, kind: 'actionTarget' }], proposal.id, 150)
    await Models.DaoPermission.create({
      ...FakeDaoPermissions[1],
      network,
      blockNumber: 170,
      logIndex: 4,
      transactionHash: '0x' + 'e'.repeat(64),
    })

    const result = await ProposalCheckTriggers.run()

    expect(result).to.deep.eq({ routed: 1, refreshed: 0 })
    expect(await causes(proposal.id)).to.deep.eq(['created:0xtx1@100'])
  })
})
