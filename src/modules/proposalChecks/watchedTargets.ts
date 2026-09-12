import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import DbTx from '@modules/dbTx'
import { type IAssessmentContext, IEventLogPluginType, type IWatchedTarget, type NetworksEnum } from '@types'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:watchedTargets' })

/** One indexed change on a watched target, in chain order. */
interface IReplayHit {
  source: 'permission' | 'setup'
  blockNumber: number
  transactionHash: string
  logIndex: number
}

/**
 * The addresses an assessment depended on. After a result is stored they are registered as
 * watched for the proposal, with the chain head as the cursor from which live event routing
 * takes over. Whatever the index already holds for them between the evidence block and that
 * head is replayed here: a hit means the assessment is already behind, so the same revision is
 * requested again with the change as its cause and its block as the new evidence block.
 */
const WatchedTargets = {
  /** The DAO, its plugins at the block, every contract the actions call, and every condition on its permissions. */
  collect(ctx: Readonly<IAssessmentContext>): IWatchedTarget[] {
    const targets: IWatchedTarget[] = [{ address: ctx.request.daoAddress, kind: 'dao' }]
    for (const plugin of ctx.plugins) targets.push({ address: plugin.address, kind: 'plugin' })
    for (const action of ctx.actions) targets.push({ address: action.target, kind: 'actionTarget' })
    for (const grant of Object.values(ctx.permissions.grants)) {
      if (grant.condition) targets.push({ address: grant.condition, kind: 'condition' })
    }
    return targets
  },

  async register(request: ProposalAssessment, ctx: Readonly<IAssessmentContext>): Promise<void> {
    const targets = WatchedTargets.collect(ctx)
    try {
      const head = await Web3Helper.getBlockNumber('latest', request.network)
      if (head < 0) throw new Error('chain head not available')
      await Models.ProposalWatchedTarget.register(request.network, targets, request.proposalId, head)
      const hit = await WatchedTargets.replay(request.network, targets, request.captured.evidenceBlock.number, head)
      if (hit) await WatchedTargets.refresh(request.proposalId, request.network, hit)
    } catch (error) {
      logger.warn('proposal checks: watched targets could not be registered', llo({ id: request.id, error }))
    }
  },

  /** The earliest indexed change touching the targets after the evidence block and up to the head, if any. */
  async replay(
    network: NetworksEnum,
    targets: IWatchedTarget[],
    evidenceBlock: number,
    head: number,
  ): Promise<IReplayHit | null> {
    if (head <= evidenceBlock) return null
    const addresses = [...new Set(targets.map(t => t.address))]
    const lower = addresses.map(a => a.toLowerCase())
    const anyCase = [...new Set([...addresses, ...lower])]
    const range = { $gt: evidenceBlock, $lte: head }
    const permission = await Models.DaoPermission.findOne(
      {
        network,
        blockNumber: range,
        $or: [
          { daoAddress: { $in: anyCase } },
          { whereAddress: { $in: anyCase } },
          { whoAddress: { $in: anyCase } },
          { conditionAddress: { $in: anyCase } },
        ],
      },
      { blockNumber: 1, transactionHash: 1, logIndex: 1 },
      { sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 } },
    )
    const setup = await Models.LogPluginSetupProcessor.findOne(
      {
        network,
        blockNumber: range,
        event: {
          $in: [
            IEventLogPluginType.InstallationApplied,
            IEventLogPluginType.UpdateApplied,
            IEventLogPluginType.UninstallationApplied,
          ],
        },
        $or: [{ daoAddress: { $in: anyCase } }, { pluginAddress: { $in: anyCase } }],
      },
      { blockNumber: 1, transactionHash: 1, logIndex: 1 },
      { sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 } },
    )
    const hits: IReplayHit[] = []
    if (permission)
      hits.push({
        source: 'permission',
        blockNumber: permission.blockNumber,
        transactionHash: permission.transactionHash,
        logIndex: permission.logIndex,
      })
    if (setup)
      hits.push({
        source: 'setup',
        blockNumber: setup.blockNumber,
        transactionHash: setup.transactionHash,
        logIndex: setup.logIndex,
      })
    if (!hits.length) return null
    return hits.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)[0]
  },

  /** Requests the current revision again with the change as cause; a cause already requested is left alone. */
  async refresh(proposalId: string, network: NetworksEnum, hit: IReplayHit): Promise<boolean> {
    const time = (await Web3Helper.getBlockTimestamp(hit.blockNumber, network)) || 0
    const outcome: boolean = await DbTx.executeTxFn(
      async ({ session }: { session: ClientSession }) => {
        const created = await Models.ProposalAssessment.requestRefresh(
          {
            proposalId,
            causeId: `refresh:${hit.source}:${hit.transactionHash}:${hit.logIndex}`,
            evidenceBlock: { number: hit.blockNumber, hash: null, time },
          },
          session,
        )
        await DbTx.safeCommit(session)
        return !!created?.created
      },
      { stopRetry: true, throwOnStop: true },
    )
    if (outcome) logger.verbose('proposal checks: refresh requested after a watched change', llo({ proposalId, hit }))
    return outcome
  },
}

export default WatchedTargets
