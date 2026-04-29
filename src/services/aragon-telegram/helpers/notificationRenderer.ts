import { bold, fmt, type FormattedString } from '@grammyjs/parse-mode'
import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { type HexAddress, type IQueueTelegramNotification, ITelegramNotificationEvent, type NetworksEnum } from '@types'
import { InlineKeyboard, type MessageEntity } from 'grammy'

export interface IRenderedNotification {
  text: string
  entities: MessageEntity[]
  keyboard: InlineKeyboard
}

const TITLE_MAX = 120
const SUMMARY_MAX = 280

const llo = logger.logMeta.bind(null, { service: 'telegram:renderer' })

const truncate = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`)

const toRendered = (formatted: FormattedString, keyboard: InlineKeyboard): IRenderedNotification => ({
  text: formatted.text,
  entities: formatted.entities,
  keyboard,
})

/**
 * Builds Telegram messages for the three notification events using the
 * parse-mode plugin's entity-based formatting (no MarkdownV2 escapes).
 *
 * The queue payload carries only entity ids; the renderer fetches the
 * referenced Proposal / Vote / PluginSlug / Dao at render-time. This keeps
 * the queue small, avoids data drift between publish-time and send-time,
 * and lets us evolve message content without re-indexing.
 *
 * Returns `null` when the referenced entity has gone (race / replay /
 * deletion) — the dispatcher silently drops the notification.
 */
export class NotificationRenderer {
  constructor(private readonly descriptionCache: DescriptionCache) {}

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

    const title = truncate(proposal.title || 'New proposal', TITLE_MAX)
    const summary = proposal.summary?.trim()

    let text = fmt`🗳 ${bold(`New proposal in ${daoName}`)}\n\n${bold(title)}`
    if (summary) text = fmt`${text}\n\n${truncate(summary, SUMMARY_MAX)}`

    const keyboard = new InlineKeyboard()
    const description = proposal.description?.trim()
    if (description) {
      const token = this.descriptionCache.put(description)
      keyboard.text('📄 See details', `pd:${token}`).row()
    }
    keyboard.url('🔗 Open in Aragon', this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId))

    return toRendered(text, keyboard)
  }

  private async renderVoteCast(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    const ctx = await this.loadVoteContext(msg)
    if (!ctx) return null
    const { vote, proposal, daoName, slug } = ctx

    const voter = vote.memberAddress ?? 'A member'
    const option = vote.voteOption !== undefined ? String(vote.voteOption) : 'voted'
    const propTitle = truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)

    const text = fmt`✅ ${bold(`Vote cast in ${daoName}`)}\n\n${voter} voted ${bold(option)} on ${propTitle}.`
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId),
    )
    return toRendered(text, keyboard)
  }

  private async renderVoteReset(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
    const ctx = await this.loadVoteContext(msg)
    if (!ctx) return null
    const { vote, proposal, daoName, slug } = ctx

    const voter = vote.memberAddress ?? 'A member'
    const propTitle = truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)

    const text = fmt`↩️ ${bold(`Vote reset in ${daoName}`)}\n\n${voter} reset their vote on ${propTitle}.`
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, slug, proposal.incrementalId),
    )
    return toRendered(text, keyboard)
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
}
