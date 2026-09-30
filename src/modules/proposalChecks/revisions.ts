import { createHash } from 'crypto'
import { type IAssessmentEventLocation, type IAssessmentRequestInput, type IRawAction } from '@types'

const Revisions = {
  _sha256(input: string): string {
    return `0x${createHash('sha256').update(input).digest('hex')}`
  },

  /** JSON with sorted keys so two equal objects always hash the same. */
  _canonical(value: unknown): string {
    return JSON.stringify(value, (_key, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.keys(v)
            .sort()
            .reduce((acc: Record<string, unknown>, k) => {
              acc[k] = v[k]
              return acc
            }, {})
        : v,
    )
  },

  _canonicalAction(action: IRawAction) {
    return {
      to: String(action.to ?? '').toLowerCase(),
      value: String(action.value ?? '0'),
      data: String(action.data ?? '0x').toLowerCase(),
    }
  },

  /** Ordered actions plus the failure map: any byte or order change is a different revision. */
  actionsHash(actions: IRawAction[], allowFailureMap: string): string {
    return Revisions._sha256(
      Revisions._canonical({
        actions: (actions ?? []).map(Revisions._canonicalAction),
        allowFailureMap: String(allowFailureMap ?? '0'),
      }),
    )
  },

  /** The proposal as it exists after one creation or edit event. */
  revisionId(input: {
    proposalId: string
    event: IAssessmentEventLocation
    actionsHash: string
    metadataUri: string | null
    storedSettings: unknown
  }): string {
    return Revisions._sha256(
      Revisions._canonical({
        proposalId: input.proposalId,
        event: {
          blockNumber: input.event.blockNumber,
          blockHash: input.event.blockHash ? input.event.blockHash.toLowerCase() : null,
          transactionHash: input.event.transactionHash.toLowerCase(),
          logIndex: input.event.logIndex,
        },
        actionsHash: input.actionsHash,
        metadataUri: input.metadataUri ?? null,
        storedSettings: input.storedSettings ?? null,
      }),
    )
  },

  /** One assessment of one revision for one cause under one rules version. */
  requestId(input: { proposalId: string; revisionId: string; causeId: string; rulesVersion: number }): string {
    return Revisions._sha256(Revisions._canonical(input))
  },

  causeIdForEvent(kind: 'created' | 'edited', event: IAssessmentEventLocation): string {
    return `${kind}:${event.transactionHash.toLowerCase()}:${event.logIndex}`
  },

  revisionOf(input: IAssessmentRequestInput, rulesVersion: number) {
    const actionsHash = Revisions.actionsHash(input.proposal.rawActions, input.proposal.allowFailureMap)
    const revisionId = Revisions.revisionId({
      proposalId: input.proposal.id,
      event: input.event,
      actionsHash,
      metadataUri: input.proposal.metadataUri,
      storedSettings: input.proposal.settings,
    })
    const requestId = Revisions.requestId({
      proposalId: input.proposal.id,
      revisionId,
      causeId: input.causeId,
      rulesVersion,
    })
    return { actionsHash, revisionId, requestId }
  },
}

export default Revisions
