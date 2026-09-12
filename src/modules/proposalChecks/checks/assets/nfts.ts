import KnownAbi from '@modules/proposalChecks/abi'
import { recipientReview } from '@modules/proposalChecks/recipients'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  type IResolvedAddress,
} from '@types'

export const NFTS_CHECK_ID = 'assets/nfts'

/**
 * Rule "NFTs or operator permissions change". Transfers and new approvals, including a
 * collection-wide operator, are worth a message; revoking an approval only the dashboard. The
 * signatures unique to ERC721 and ERC1155 are recognised on any target; the ones shared with
 * ERC20 (transferFrom, approve) only when the token is known to be an NFT collection.
 */
const NftsCheck = {
  id: NFTS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall' || !action.decoded) continue
      const finding = NftsCheck._finding(action, ctx)
      if (finding) findings.push(finding)
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _finding(action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): IAssessmentFinding | null {
    if (!KnownAbi.isBuiltin(action)) return null
    const { name, signature, args } = action.decoded!
    const collection = action.target
    const isErc721 = ctx.tokens[collection.toLowerCase()] === 'ERC721'

    if (name === 'safeTransferFrom' || name === 'safeBatchTransferFrom' || (name === 'transferFrom' && isErc721)) {
      // The shared decoder names transferFrom's third argument `amount`; on an ERC721 it is the token id.
      const ids =
        name === 'safeBatchTransferFrom' ? (args.ids ?? '').split(',') : [args.tokenId ?? args.id ?? args.amount]
      const amounts =
        name === 'safeBatchTransferFrom'
          ? args.amounts.split(',')
          : signature.includes('uint256,uint256')
            ? [args.amount]
            : ['1']
      return NftsCheck._build(action, ctx, {
        kind: 'transfer',
        notify: true,
        counterparty: args.to,
        title: `Transfers token${ids.length > 1 ? 's' : ''} ${ids.join(', ')} of collection ${collection} to ${args.to}`,
        after: { collection, from: args.from, to: args.to, ids, amounts },
      })
    }
    if (name === 'setApprovalForAll') {
      const approved = args.approved === 'true'
      return NftsCheck._build(action, ctx, {
        kind: approved ? 'operator' : 'operatorRevoked',
        notify: approved,
        counterparty: args.operator,
        title: approved
          ? `Lets ${args.operator} transfer every token of collection ${collection}`
          : `Stops ${args.operator} from transferring tokens of collection ${collection}`,
        after: { collection, operator: args.operator, approved },
      })
    }
    if (name === 'approve' && isErc721) {
      const revoked = /^0x0{40}$/i.test(args.spender ?? '')
      return NftsCheck._build(action, ctx, {
        kind: revoked ? 'approvalRevoked' : 'approval',
        notify: !revoked,
        counterparty: args.spender,
        title: revoked
          ? `Removes the approval on token ${args.amount} of collection ${collection}`
          : `Lets ${args.spender} transfer token ${args.amount} of collection ${collection}`,
        after: { collection, to: args.spender, id: args.amount },
      })
    }
    return null
  },

  _build(
    action: IAssessmentFlatAction,
    ctx: Readonly<IAssessmentContext>,
    input: { kind: string; notify: boolean; counterparty: string; title: string; after: Record<string, unknown> },
  ): IAssessmentFinding {
    const recipient = ctx.recipients[input.counterparty.toLowerCase()] ?? null
    const review =
      input.kind === 'operatorRevoked' || input.kind === 'approvalRevoked'
        ? null
        : recipientReview(recipient, 'counterparty')
    const details = [`action ${action.path} on collection ${action.target}`]
    if (review) details.push(review)
    const limits: string[] = []
    if (ctx.availability.simulation !== 'ok') limits.push('not confirmed by simulation')
    if (input.notify && (!recipient || recipient.kind === 'unknown')) limits.push('counterparty not resolved')
    if (!ctx.tokens[action.target.toLowerCase()]) limits.push('collection standard not known')
    return {
      id: `${NFTS_CHECK_ID}:${input.kind}:${action.path}`,
      checkId: NFTS_CHECK_ID,
      kind: review ? IAssessmentFindingKind.NeedsReview : IAssessmentFindingKind.Change,
      labels: [],
      notify: input.notify || !!review,
      title: input.title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.length ? limits.join('; ') : undefined,
      after: { ...input.after, recipient },
    }
  },
}

export default NftsCheck
