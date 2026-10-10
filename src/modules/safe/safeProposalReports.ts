/**
 * Correlate queued Safe transactions to the Aragon proposals they report to.
 *
 * A Safe acting as an SPP body votes by queueing `reportProposalResult(uint256,uint16,uint8,bool)`
 * against the SPP plugin. The calldata carries the contract proposal id; the app builds its URL from
 * the backend `incrementalId`. The mapping between the two is already indexed
 * (`{ pluginAddress, proposalIndex, network }`), so one query per queue page resolves every row -
 * the alternative is the app issuing one unfiltered proposal-list read per queued row, every poll.
 *
 * Reported here as a record, not a verdict: `resultType` is what the call *would* write if executed.
 * The transaction may never execute, or land after the stage advanced.
 *
 * A MultiSend can carry several reports, so the field is an array. Unmatched reports are dropped:
 * a report to a plugin this backend does not index is not a link the app can render.
 */

import { Models } from '@dbModels'
import logger from '@logger'
import MultiSendModule from '@modules/safe/multiSend'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { type HexAddress, type IAragonProposalReport, type ISafeMultisigTransaction, type NetworksEnum } from '@types'
import { AbiCoder, getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-proposal-reports' })

/** `reportProposalResult(uint256,uint16,uint8,bool)` */
const REPORT_SELECTOR = '0x52303962'
/** Distinct proposals looked up for one transaction. The route is public, so one batch must not widen the query without limit. */
const MAX_LOOKUPS_PER_TRANSACTION = 50

const coder = AbiCoder.defaultAbiCoder()

/** One decoded report, before it is matched against an indexed proposal. */
interface IRawReport {
  pluginAddress: string
  proposalIndex: string
  stageId: number
  resultType: number
}

const keyOf = (report: { pluginAddress: string; proposalIndex: string }) =>
  `${report.pluginAddress}-${report.proposalIndex}`

const SafeProposalReportsModule = {
  /**
   * Attach `aragonReports` to every queue entry whose calldata decodes into proposal reports. One
   * proposal query for the whole page, and no query at all when nothing in it is a report.
   *
   * The field distinguishes three states: absent (not a recognised report), empty (a report whose
   * proposal is not indexed), populated (resolved). Every decoded entry stays in calldata order,
   * duplicates included; only the lookup is capped.
   */
  async attach(
    network: NetworksEnum,
    safeAddress: HexAddress,
    transactions: ISafeMultisigTransaction[],
  ): Promise<ISafeMultisigTransaction[]> {
    const perTransaction = transactions.map(transaction => SafeProposalReportsModule._reportsOf(transaction))
    if (perTransaction.every(decoded => decoded.length === 0)) return transactions

    const lookups = new Map<string, { pluginAddress: string; proposalIndex: string }>()
    for (const decoded of perTransaction) {
      const keys = new Set<string>()
      for (const report of decoded) {
        const key = keyOf(report)
        if (keys.size >= MAX_LOOKUPS_PER_TRANSACTION && !keys.has(key)) continue
        keys.add(key)
        lookups.set(key, { pluginAddress: report.pluginAddress, proposalIndex: report.proposalIndex })
      }
    }

    try {
      // Calldata names any plugin it likes. Only a plugin this Safe is a body of can be a real report.
      const bodyPlugins = await SafeBodyMembersModule.bodyPluginsOf(safeAddress, network)
      const proposals = await Models.Proposal.findReported(network, [...bodyPlugins], [...lookups.values()])
      const matches = new Map<string, { daoAddress: string; incrementalId: number }>(
        proposals.map(proposal => [keyOf(proposal), proposal]),
      )

      return transactions.map((transaction, index) => {
        const decoded = perTransaction[index]
        if (decoded.length === 0) return transaction

        const aragonReports: IAragonProposalReport[] = []
        for (const report of decoded) {
          const match = matches.get(keyOf(report))
          if (!match) continue

          aragonReports.push({
            // Resolved per entry, not per row: a Safe that is a body in two processes under
            // different DAOs produces one row whose entries carry different `daoId` values.
            daoId: `${network}-${getAddress(match.daoAddress)}`,
            bodyId: report.pluginAddress,
            proposalId: match.incrementalId,
            stageId: report.stageId,
            resultType: report.resultType,
          })
        }

        return { ...transaction, aragonReports }
      })
    } catch (error) {
      logger.warn('Safe: proposal report correlation failed', llo({ network, safeAddress, error }))
      return transactions.map((transaction, index) =>
        perTransaction[index].length === 0 ? transaction : { ...transaction, aragonReports: [] },
      )
    }
  },

  /** Every report a transaction would make: itself, or each inner call of a MultiSend. */
  _reportsOf(transaction: ISafeMultisigTransaction): IRawReport[] {
    const { to, data } = transaction
    if (data == null) return []

    const selector = data.slice(0, 10).toLowerCase()
    if (selector === REPORT_SELECTOR) {
      const report = SafeProposalReportsModule._decode(to, data)

      return report ? [report] : []
    }

    // A malformed tail is ignored: the valid prefix calls are still true reports.
    if (selector === MultiSendModule.SELECTOR) {
      return MultiSendModule.split(data)
        .calls.filter(call => call.data.slice(0, 10).toLowerCase() === REPORT_SELECTOR)
        .map(call => SafeProposalReportsModule._decode(call.to, call.data))
        .filter((report): report is IRawReport => report != null)
    }

    return []
  },

  _decode(to: string, data: string): IRawReport | null {
    try {
      const [proposalId, stageId, resultType] = coder.decode(
        ['uint256', 'uint16', 'uint8', 'bool'],
        `0x${data.slice(REPORT_SELECTOR.length)}`,
      )

      return {
        pluginAddress: getAddress(to),
        proposalIndex: proposalId.toString(),
        stageId: Number(stageId),
        resultType: Number(resultType),
      }
    } catch {
      return null
    }
  },
}

export default SafeProposalReportsModule
