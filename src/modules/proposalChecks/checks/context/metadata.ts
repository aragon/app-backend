import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
} from '@types'

export const METADATA_CHECK_ID = 'context/metadata'

/** A title this short, or made of punctuation only, explains nothing. */
const PLACEHOLDER = /^[\s.\-_*#]*$|^(test|title|untitled|proposal|tbd|todo|n\/a)$/i
const MIN_TITLE_LENGTH = 3

/**
 * Rule "The proposal explains what it asks for". A reader needs a usable title and some text or
 * reachable metadata behind it. Nothing here judges whether the text matches the actions; it
 * only says when there is no explanation to judge: a placeholder title, free text where a
 * reference was expected, or a reference that gave nothing and an index that holds nothing.
 */
const MetadataCheck = {
  id: METADATA_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    const m = ctx.metadata
    const title = m.fetched?.title ?? m.indexed.title
    const body = m.fetched?.description ?? m.fetched?.summary ?? m.indexed.description ?? m.indexed.summary
    const problems: string[] = []

    if (m.uriKind === 'text')
      problems.push(
        `the metadata field holds free text where a reference was expected: "${(m.uri ?? '').slice(0, 80)}"`,
      )
    if (!title && !body) problems.push(MetadataCheck._noExplanation(m))
    if (title && MetadataCheck._placeholder(title)) problems.push(`the title "${title}" is a placeholder`)
    if (!title && body) problems.push('the proposal has no title')

    const limits = [
      "metadata is untrusted; whether the actions match the author's intent is not something deterministic checks can tell",
    ]
    if (m.uriKind === 'ipfs' && m.fetchStatus === 'failed')
      limits.push('unread metadata may still exist at its referenced location')

    if (problems.length === 0) {
      return {
        status: IAssessmentCheckStatus.Ok,
        findings: [],
        reason: `explained: "${title}"${m.fetched ? `, metadata hash ${m.fetched.hash.slice(0, 18)}` : ', from the index'}`,
      }
    }
    const finding: IAssessmentFinding = {
      id: `${METADATA_CHECK_ID}:explanation`,
      checkId: METADATA_CHECK_ID,
      kind: IAssessmentFindingKind.NeedsReview,
      labels: [],
      notify: true,
      title: 'The proposal does not explain what it asks for',
      details: problems,
      actionPaths: [],
      evidenceLimit: limits.join('; '),
      after: { uri: m.uri, uriKind: m.uriKind, title, fetchStatus: m.fetchStatus, hash: m.fetched?.hash ?? null },
    }
    return { status: IAssessmentCheckStatus.NeedsReview, findings: [finding], reason: problems.join('; ') }
  },

  /** Why there is nothing to read, said in terms of where the explanation was meant to come from. */
  _noExplanation(m: IAssessmentContext['metadata']): string {
    if (m.uriKind === 'empty') return 'no metadata reference and no title or description'
    if (m.fetchStatus === 'failed')
      return `the metadata at ${m.uri} could not be fetched and the index holds no title or description`
    return `the metadata at ${m.uri} holds no title or description`
  },

  _placeholder(title: string): boolean {
    const t = title.trim()
    return t.length < MIN_TITLE_LENGTH || PLACEHOLDER.test(t) || /^(.)\1*$/.test(t)
  },
}

export default MetadataCheck
