import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { htmlEscape, sanitizeDescriptionHtml } from '@services/aragon-telegram/helpers/telegramHtml'
import {
  type HexAddress,
  type IQueueTelegramNotification,
  type IRenderedNotification,
  ITelegramNotificationEvent,
  type NetworksEnum,
} from '@types'
import { InlineKeyboard } from 'grammy'

const TITLE_MAX = 120
const SUMMARY_MAX = 280
const DESCRIPTION_MAX = 1500

const llo = logger.logMeta.bind(null, { service: 'telegram:renderer' })

/**
 * Builds Telegram messages for the three notification events as HTML strings,
 * sent with `parse_mode: 'HTML'`. We use HTML mode (rather than entity-based
 * formatting) so the proposal description's existing rich-editor HTML can ride
 * through with its inline `<strong>`, `<code>`, `<a>` etc. preserved.
 *
 * The queue payload carries only entity ids; the renderer fetches the
 * referenced Proposal / Vote / PluginSlug / Dao at render-time. This keeps
 * the queue small and lets us evolve message content without re-indexing.
 *
 * Returns `null` when the referenced entity has gone (race / replay /
 * deletion) — the dispatcher silently drops the notification.
 */
export class NotificationRenderer {
  async render(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    switch (msg.event) {
      case ITelegramNotificationEvent.ProposalCreated:
        return this.renderProposalCreated(msg)
      case ITelegramNotificationEvent.VoteCast:
        return this.renderVoteCast(msg)
      case ITelegramNotificationEvent.VoteReset:
        return this.renderVoteReset(msg)
    }
  }

  private async renderProposalCreated(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    if (!msg.proposalId) return null
    const proposal = await Models.Proposal.findByEntityId(msg.proposalId)
    if (!proposal) {
      logger.warn('renderer: proposal not found', llo({ id: msg.id, proposalId: msg.proposalId }))
      return null
    }

    const [daoName, slug] = await Promise.all([
      this.daoName(msg.network, msg.daoAddress),
      this.pluginSlug(proposal.pluginAddress, msg.daoAddress, msg.network),
    ])

    const title = this.truncate(proposal.title || 'New proposal', TITLE_MAX)
    const summary = proposal.summary?.trim()
    const description = proposal.description?.trim()

    const lines = [`🗳 <b>New proposal in ${htmlEscape(daoName)}</b>`, '', `<b>${htmlEscape(title)}</b>`]
    if (summary) lines.push('', htmlEscape(this.truncate(summary, SUMMARY_MAX)))
    if (description) lines.push('', this.truncateBody(sanitizeDescriptionHtml(description), DESCRIPTION_MAX))

    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId),
    )

    return { text: lines.join('\n'), keyboard }
  }

  private async renderVoteCast(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    const ctx = await this.loadVoteContext(msg)
    if (!ctx) return null
    const { vote, proposal, daoName, slug } = ctx

    const voter = vote.memberAddress ?? 'A member'
    const option = vote.voteOption !== undefined ? String(vote.voteOption) : 'voted'
    const propTitle = this.truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)

    const text = [
      `✅ <b>Vote cast in ${htmlEscape(daoName)}</b>`,
      '',
      `${htmlEscape(voter)} voted <b>${htmlEscape(option)}</b> on ${htmlEscape(propTitle)}.`,
    ].join('\n')
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId),
    )
    return { text, keyboard }
  }

  private async renderVoteReset(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    const ctx = await this.loadVoteContext(msg)
    if (!ctx) return null
    const { vote, proposal, daoName, slug } = ctx

    const voter = vote.memberAddress ?? 'A member'
    const propTitle = this.truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)

    const text = [
      `↩️ <b>Vote reset in ${htmlEscape(daoName)}</b>`,
      '',
      `${htmlEscape(voter)} reset their vote on ${htmlEscape(propTitle)}.`,
    ].join('\n')
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId),
    )
    return { text, keyboard }
  }

  /**
   * Vote events all need the Vote → Proposal → PluginSlug + Dao name chain.
   * Loaded once and shared between cast/reset.
   */
  private async loadVoteContext(msg: IQueueTelegramNotification) {
    if (!msg.voteId) return null
    const vote = await Models.Vote.findByEntityId(msg.voteId)
    if (!vote) {
      logger.warn('renderer: vote not found', llo({ id: msg.id, voteId: msg.voteId }))
      return null
    }
    const proposal = await Models.Proposal.findByProposalIndex(vote.proposalIndex, vote.pluginAddress, msg.network)
    if (!proposal) {
      logger.warn('renderer: proposal not found for vote', llo({ id: msg.id, voteId: msg.voteId }))
      return null
    }
    const [daoName, slug] = await Promise.all([
      this.daoName(msg.network, msg.daoAddress),
      this.pluginSlug(vote.pluginAddress, msg.daoAddress, msg.network),
    ])
    return { vote, proposal, daoName, slug }
  }

  private async daoName(network: NetworksEnum, daoAddress: HexAddress): Promise<string> {
    const dao = await Models.Dao.findByAddress(daoAddress, network)
    return dao?.name || `${network}-${daoAddress}`
  }

  private async pluginSlug(
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<string | null> {
    const doc = await Models.PluginSlug.findPluginSlug(pluginAddress, daoAddress, network)
    return doc?.slug ?? null
  }

  /**
   * Aragon app URL form: `/dao/<network>/<address>/proposals/<SLUG>-<incrementalId>`.
   * Falls back to the listing page if either piece of the proposal id is missing,
   * so a missing slug never breaks the deep link.
   */
  private proposalUrl(
    network: NetworksEnum,
    daoAddress: HexAddress,
    slug: string | null,
    incrementalId?: number,
  ): string {
    const base = `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${network}/${daoAddress}/proposals`
    if (slug && incrementalId !== undefined) {
      return `${base}/${slug.toUpperCase()}-${incrementalId}`
    }
    return base
  }

  /** Hard truncate at `max` chars; appends `…` when cut. Used for short fields (title, voter, option). */
  private truncate(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`
  }

  /**
   * Truncate a long body on a sentence/paragraph boundary when possible. Falls
   * back to a hard cut at `max` if no good break is found in the last 20% of
   * the budget. Trailing whitespace is trimmed and `…` is appended.
   */
  private truncateBody(s: string, max: number): string {
    if (s.length <= max) return s
    const slice = s.slice(0, max)
    const cutoff = max - Math.floor(max * 0.2)
    const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('.\n'))
    const end = breakAt > cutoff ? breakAt : max - 1
    return `${slice.slice(0, end).trimEnd()}…`
  }
}
