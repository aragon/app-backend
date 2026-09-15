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
import { type IAragonProposalReport, type ISafeMultisigTransaction, ISettingStatus, type NetworksEnum } from '@types'
import { AbiCoder, getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-proposal-reports' })

/** `reportProposalResult(uint256,uint16,uint8,bool)` */
const REPORT_SELECTOR = '0x52303962'
/** `multiSend(bytes)` */
const MULTISEND_SELECTOR = '0x8d80ff0a'

const coder = AbiCoder.defaultAbiCoder()

/** One decoded report, before it is matched against an indexed proposal. */
interface IRawReport {
  pluginAddress: string
  proposalIndex: string
  stageId: string
  resultType: number
}

function decodeReport(to: string, data: string): IRawReport | null {
  try {
    const [proposalId, stageId, resultType] = coder.decode(
      ['uint256', 'uint16', 'uint8', 'bool'],
      `0x${data.slice(REPORT_SELECTOR.length)}`,
    )

    return {
      pluginAddress: getAddress(to),
      proposalIndex: proposalId.toString(),
      stageId: stageId.toString(),
      resultType: Number(resultType),
    }
  } catch {
    return null
  }
}

/**
 * Walk the packed `multiSend` payload: `operation(1) to(20) value(32) dataLength(32) data(n)` per
 * inner call, concatenated with no padding. A malformed tail ends the walk rather than failing the
 * row - the calls already read are still true.
 */
function unwrapMultiSend(data: string): Array<{ to: string; data: string }> {
  const calls: Array<{ to: string; data: string }> = []

  let packed: string
  try {
    ;[packed] = coder.decode(['bytes'], `0x${data.slice(MULTISEND_SELECTOR.length)}`)
  } catch {
    return calls
  }

  const body = packed.slice(2)
  let cursor = 0
  while (cursor + 170 <= body.length) {
    const to = `0x${body.slice(cursor + 2, cursor + 42)}`
    const length = Number(BigInt(`0x${body.slice(cursor + 106, cursor + 170)}`)) * 2
    const start = cursor + 170
    if (!Number.isSafeInteger(length) || start + length > body.length) break

    calls.push({ to, data: `0x${body.slice(start, start + length)}` })
    cursor = start + length
  }

  return calls
}

/** Every report a transaction would make: itself, or each inner call of a MultiSend. */
function extractReports(transaction: ISafeMultisigTransaction): IRawReport[] {
  const { to, data } = transaction
  if (data == null) return []

  if (data.startsWith(REPORT_SELECTOR)) {
    const report = decodeReport(to, data)

    return report ? [report] : []
  }

  if (data.startsWith(MULTISEND_SELECTOR)) {
    return unwrapMultiSend(data)
      .filter(call => call.data.startsWith(REPORT_SELECTOR))
      .map(call => decodeReport(call.to, call.data))
      .filter((report): report is IRawReport => report != null)
  }

  return []
}

/**
 * Every SPP plugin, of those reported to, that lists this Safe as a stage body or an external
 * proposer. Addresses lowercased for comparison.
 *
 * This is the authorization half. Both halves of the correlation key come from calldata the queuer
 * chose, so without it a single rogue Safe owner could queue a report naming any indexed plugin and
 * have us render a deep link into an unrelated DAO. The resolution is already persisted by
 * `pluginSettingHandler.attachExternalBodyConditions`, so this costs one indexed read, not an RPC.
 *
 * It narrows the blast radius, it does not close it: a Safe that genuinely is a body of a process
 * can still name any proposal under that same plugin. The field states what the calldata says, and
 * is never provenance.
 */
async function readAuthorizedPlugins(
  network: NetworksEnum,
  safeAddress: string,
  pluginAddresses: string[],
): Promise<Set<string>> {
  const settings = (await Models.Setting.find({
    network,
    status: ISettingStatus.active,
    pluginAddress: { $in: pluginAddresses },
  })
    .select('pluginAddress stages.plugins.address externalProposers.address')
    .lean()
    .exec()) as unknown as Array<{
    pluginAddress: string
    stages?: Array<{ plugins?: Array<{ address?: string }> }>
    externalProposers?: Array<{ address?: string }>
  }>

  const safe = safeAddress.toLowerCase()
  const authorized = new Set<string>()
  for (const setting of settings) {
    const bodies = [
      ...(setting.stages ?? []).flatMap(stage => stage.plugins ?? []),
      ...(setting.externalProposers ?? []),
    ]
    if (bodies.some(body => body.address?.toLowerCase() === safe)) {
      authorized.add(setting.pluginAddress.toLowerCase())
    }
  }

  return authorized
}

/**
 * Attach `aragonReports` to every queue entry whose calldata decodes into proposal reports. Two
 * Mongo reads for the whole page, and none at all when nothing in it is a report - the common case.
 *
 * The field distinguishes three states: absent (not a recognised report), empty (a report that
 * could not be resolved), populated (resolved). A correlation outage degrades to empty rather than
 * taking the signing UI with it, and never to silence - silence would present a governance
 * transaction as an anonymous payload.
 */
export async function attachProposalReports(
  network: NetworksEnum,
  safeAddress: string,
  transactions: ISafeMultisigTransaction[],
): Promise<ISafeMultisigTransaction[]> {
  const perTransaction = transactions.map(extractReports)
  const reported = perTransaction.flat()
  if (reported.length === 0) return transactions

  try {
    // `Plugin.address` is written from an ethers-decoded `address` argument, so stored plugin
    // addresses are checksummed - the same form `parseTransaction` normalises `to` to.
    const [proposals, authorized] = await Promise.all([
      Models.Proposal.find({
        network,
        $or: reported.map(({ pluginAddress, proposalIndex }) => ({ pluginAddress, proposalIndex })),
      })
        .select('pluginAddress proposalIndex incrementalId daoAddress')
        .lean()
        .exec() as unknown as Promise<
        Array<{ pluginAddress: string; proposalIndex: string; incrementalId: number; daoAddress: string }>
      >,
      readAuthorizedPlugins(
        network,
        safeAddress,
        reported.map(report => report.pluginAddress),
      ),
    ])

    const matches = new Map(
      proposals.map(proposal => [`${proposal.pluginAddress.toLowerCase()}-${proposal.proposalIndex}`, proposal]),
    )

    let refused = 0
    let unmatched = 0

    const results = transactions.map((transaction, index) => {
      const decoded = perTransaction[index]
      if (decoded.length === 0) return transaction

      const reports: IAragonProposalReport[] = []
      for (const report of decoded) {
        if (!authorized.has(report.pluginAddress.toLowerCase())) {
          refused++
          continue
        }

        const match = matches.get(`${report.pluginAddress.toLowerCase()}-${report.proposalIndex}`)
        if (!match) {
          unmatched++
          continue
        }

        reports.push({
          // `${network}-${checksummedDaoAddress}`, the composite the app's `resolveDaoId` builds and
          // `useDao` is keyed by. Same rule as `TelegramSubscription.getDaoId`.
          //
          // Resolved per entry, not per row: a Safe that is a body in two processes under different
          // DAOs produces one row whose entries carry different `daoId` values.
          daoId: `${network}-${getAddress(match.daoAddress)}`,
          bodyId: report.pluginAddress,
          proposalId: match.incrementalId,
          stageId: report.stageId,
          resultType: report.resultType,
        })
      }

      // Present whenever the calldata decoded into reports, even when none of them resolved. An
      // empty array says "this is a governance report whose proposal could not be resolved", which
      // absence cannot: absence means "not a recognised report", and the app must be able to tell a
      // transient indexing gap from an ordinary transfer.
      return { ...transaction, aragonReports: reports }
    })

    // A report that decoded but did not resolve is expected and benign - proposal not yet indexed,
    // or a process this backend does not track. It is logged because one pathological cause looks
    // identical from outside: a stored `pluginAddress` whose case differs from the checksummed `to`
    // the filters query by. `refused` and `unmatched` separate "Safe is not a body of that plugin"
    // from "no such proposal row", which is the distinction that tells those apart.
    if (refused > 0 || unmatched > 0) {
      logger.info(
        'Safe: queued reports decoded but not fully correlated',
        llo({
          network,
          safeAddress,
          reports: reported.length,
          refused,
          unmatched,
          plugins: [...new Set(reported.map(report => report.pluginAddress))],
        }),
      )
    }

    return results
  } catch (error) {
    logger.warn('Safe: proposal report correlation failed', llo({ network, safeAddress, error }))

    // The reads failed, so nothing can be resolved - but the calldata already told us which rows
    // are reports, and saying so is strictly more honest than returning them as ordinary transfers.
    return transactions.map((transaction, index) =>
      perTransaction[index].length === 0 ? transaction : { ...transaction, aragonReports: [] },
    )
  }
}
