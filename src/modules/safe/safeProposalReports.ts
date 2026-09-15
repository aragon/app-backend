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
 * Attach `aragonReports` to every queue entry that reports to an indexed proposal the Safe is
 * actually a body of. Two Mongo reads for the whole page, and none at all when nothing in it is a
 * report - which is the common case.
 *
 * Failure is silent: the field is optional and the queue read is the deliverable. A correlation
 * outage must not take the signing UI with it.
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

    // A decoded report that matches nothing is indistinguishable from an ordinary transaction in the
    // response, so it is said out loud here. The expected causes are benign - a proposal not yet
    // indexed, or a report to a process this backend does not track - but a stored `pluginAddress`
    // whose case differs from the checksummed `to` this queries by would look exactly the same.
    if (matches.size === 0) {
      logger.info(
        'Safe: queued reports decoded but none correlated',
        llo({
          network,
          safeAddress,
          reports: reported.length,
          plugins: [...new Set(reported.map(r => r.pluginAddress))],
        }),
      )
    }

    return transactions.map((transaction, index) => {
      const reports = perTransaction[index]
        .map((report): IAragonProposalReport | null => {
          if (!authorized.has(report.pluginAddress.toLowerCase())) return null

          const match = matches.get(`${report.pluginAddress.toLowerCase()}-${report.proposalIndex}`)
          if (!match) return null

          return {
            // `${network}-${checksummedDaoAddress}`, the composite the app's `daoUtils.getDaoId`
            // builds and `useDao` is keyed by. Same rule as `TelegramSubscription.getDaoId`.
            daoId: `${network}-${getAddress(match.daoAddress)}`,
            bodyId: report.pluginAddress,
            proposalId: match.incrementalId,
            stageId: report.stageId,
            resultType: report.resultType,
          }
        })
        .filter((report): report is IAragonProposalReport => report != null)

      return reports.length === 0 ? transaction : { ...transaction, aragonReports: reports }
    })
  } catch (error) {
    logger.warn('Safe: proposal report correlation failed', llo({ network, safeAddress, error }))

    return transactions
  }
}
