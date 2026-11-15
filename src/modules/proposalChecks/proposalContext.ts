import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import IPFSModule from '@modules/ipfs'
import { type HexAddress, type ICreatorContext, type IMetadataFacts } from '@types'
import { createHash } from 'node:crypto'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:proposalContext' })

/** What the two readers need from the request. */
type IContextRequest = Pick<
  ProposalAssessment,
  'id' | 'proposalId' | 'network' | 'daoAddress' | 'pluginAddress' | 'captured'
>

export interface IIndexedForContext {
  title?: string | null
  summary?: string | null
  description?: string | null
  /** Of the revision the document holds now, which is not always the revision being assessed. */
  metadataUri?: string | null
  creatorAddress?: string | null
  proposalIndex?: string
}

/**
 * Reads the proposal's explanation and the three context lines about its creator and voters.
 * Metadata is fetched from IPFS within the configured limits and hashed, so the text a reader
 * saw is identifiable apart from the action bytes; it stays untrusted. The creator's history is
 * read from the index up to the evidence block only, so a later proposal never counts.
 */
const ProposalContext = {
  async metadata(request: IContextRequest, proposal: IIndexedForContext | null): Promise<IMetadataFacts> {
    const uri = request.captured.metadataUri
    const uriKind = ProposalContext._uriKind(uri)
    // The indexed text belongs to whatever revision the document holds now. An edit that landed
    // while this request waited would otherwise explain this revision with the next one's words.
    const sameRevision = (proposal?.metadataUri ?? null) === uri
    const indexed = {
      title: sameRevision ? ProposalContext._text(proposal?.title) : null,
      summary: sameRevision ? ProposalContext._text(proposal?.summary) : null,
      description: sameRevision ? ProposalContext._text(proposal?.description) : null,
    }
    if (uriKind !== 'ipfs' || !uri) return { uri, uriKind, indexed, fetched: null, fetchStatus: 'skipped' }
    try {
      const data = (await IPFSModule.fetchMetadata(uri)) as Record<string, unknown> | null
      if (!data) return { uri, uriKind, indexed, fetched: null, fetchStatus: 'failed' }
      const hash = `0x${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`
      return {
        uri,
        uriKind,
        indexed,
        fetched: {
          title: ProposalContext._text((data.title ?? data.name) as string | undefined),
          summary: ProposalContext._text(data.summary as string | undefined),
          description: ProposalContext._text(data.description as string | undefined),
          hash,
        },
        fetchStatus: 'ok',
      }
    } catch (error) {
      logger.warn('proposal checks: metadata could not be fetched', llo({ requestId: request.id, uri, error }))
      return { uri, uriKind, indexed, fetched: null, fetchStatus: 'failed' }
    }
  },

  async creator(
    request: IContextRequest,
    proposal: IIndexedForContext | null,
    tokenAddress: HexAddress | null,
  ): Promise<ICreatorContext> {
    const block = request.captured.evidenceBlock
    const address = proposal?.creatorAddress ?? null
    const context: ICreatorContext = {
      address,
      priorProposals: null,
      powerAppearedAt: null,
      powerAgeSeconds: null,
      votesCast: 0,
      largestVoterShare: null,
      largestVoter: null,
      limits: [],
    }
    if (!address) return { ...context, limits: ['the creator is not indexed'] }
    try {
      context.priorProposals = await Models.Proposal.countDocuments({
        daoAddress: request.daoAddress,
        network: request.network,
        creatorAddress: address,
        blockNumber: { $lt: block.number },
      })
      if (tokenAddress) {
        const first = await Models.LogDelegateChanged.findOne(
          { network: request.network, tokenAddress, toDelegate: address, blockNumber: { $lte: block.number } },
          { blockNumber: 1, blockTimestamp: 1 },
          { sort: { blockNumber: 1, logIndex: 1 } },
        )
        if (first) {
          const at =
            first.blockTimestamp ?? (await Web3Helper.getBlockTimestamp(first.blockNumber, request.network)) ?? null
          context.powerAppearedAt = at
          context.powerAgeSeconds = at === null ? null : Math.max(0, block.time - at)
        } else {
          context.limits.push('no delegation to the creator is indexed for the voting token')
        }
      } else {
        context.limits.push('the plugin has no voting token, so when voting power appeared is not read')
      }
      const votes = await Models.Vote.find(
        {
          network: request.network,
          pluginAddress: request.pluginAddress,
          proposalIndex: proposal?.proposalIndex ?? request.proposalId.split('-').pop() ?? '0',
          blockNumber: { $lte: block.number },
        },
        { memberAddress: 1, votingPower: 1 },
      )
      const byVoter = new Map<string, bigint>()
      for (const vote of votes) {
        const key = vote.memberAddress
        byVoter.set(key, (byVoter.get(key) ?? 0n) + BigInt(vote.votingPower ?? '0'))
      }
      context.votesCast = byVoter.size
      // Replacing a vote deletes the record it replaces, so an empty result does not prove that
      // nobody voted by the evidence block; it only says what the index holds right now.
      context.limits.push(
        'a vote that was replaced or overridden later is stored as it stands now, so the voter numbers are the index of today, not of the evidence block',
      )
      const total = [...byVoter.values()].reduce((a, b) => a + b, 0n)
      if (total > 0n) {
        const [voter, power] = [...byVoter.entries()].sort((a, b) => (a[1] > b[1] ? -1 : 1))[0]
        context.largestVoter = voter
        context.largestVoterShare = ProposalContext._share(power, total)
      } else if (votes.length) {
        context.limits.push('votes are indexed without their voting power, so no share is computed')
      }
    } catch (error) {
      logger.warn('proposal checks: creator context could not be read', llo({ requestId: request.id, error }))
      context.limits.push('the creator context could not be read from the index')
    }
    return context
  },

  _uriKind(uri: string | null): IMetadataFacts['uriKind'] {
    if (!uri?.trim()) return 'empty'
    if (IPFSModule.isValidIpfsUrl(uri)) return 'ipfs'
    if (/^https?:\/\/\S+$/i.test(uri.trim())) return 'http'
    return 'text'
  },

  _text(value: string | null | undefined): string | null {
    const text =
      typeof value === 'string'
        ? value
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : ''
    return text.length ? text : null
  },

  /** Exact to four decimals, as a decimal string; no floating point on voting power. */
  _share(part: bigint, total: bigint): string {
    const scaled = (part * 10000n) / total
    const whole = scaled / 10000n
    const fraction = (scaled % 10000n).toString().padStart(4, '0').replace(/0+$/, '')
    return fraction.length ? `${whole}.${fraction}` : `${whole}`
  },
}

export default ProposalContext
