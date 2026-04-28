import config from '@config'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { type DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { MarkdownV2 } from '@services/aragon-telegram/helpers/markdownV2'
import { type IQueueTelegramNotification, ITelegramNotificationEvent } from '@types'
import { InlineKeyboard } from 'grammy'

export interface IRenderedNotification {
  text: string
  keyboard: InlineKeyboard
}

const TITLE_MAX = 120
const SUMMARY_MAX = 280

/**
 * Builds MarkdownV2 messages for the three notification events. Wraps the
 * description-token cache so callers don't need to know about the 64-byte
 * `callback_data` limit on Telegram inline buttons.
 */
export class NotificationRenderer {
  constructor(private readonly descriptionCache: DescriptionCache) {}

  render(msg: IQueueTelegramNotification): IRenderedNotification {
    switch (msg.event) {
      case ITelegramNotificationEvent.ProposalCreated:
        return this.renderProposalCreated(msg)
      case ITelegramNotificationEvent.VoteCast:
        return this.renderVoteCast(msg)
      case ITelegramNotificationEvent.VoteReset:
        return this.renderVoteReset(msg)
    }
  }

  private renderProposalCreated(msg: IQueueTelegramNotification): IRenderedNotification {
    const dao = MarkdownV2.escape(msg.daoName ?? DaoIdParser.format(msg.network, msg.daoAddress))
    const title = MarkdownV2.escape(MarkdownV2.truncate(msg.proposal?.title ?? 'New proposal', TITLE_MAX))
    const summary = msg.proposal?.summary?.trim()

    const lines = [`🗳 *New proposal in ${dao}*`, '', `*${title}*`]
    if (summary) lines.push('', MarkdownV2.escape(MarkdownV2.truncate(summary, SUMMARY_MAX)))

    const keyboard = new InlineKeyboard()
    const description = msg.proposal?.description?.trim()
    if (description) {
      const token = this.descriptionCache.put(description)
      keyboard.text('📄 See details', `pd:${token}`).row()
    }
    keyboard.url('🔗 Open in Aragon', this.proposalUrl(msg.network, msg.daoAddress, msg.proposal?.id))

    return { text: lines.join('\n'), keyboard }
  }

  private renderVoteCast(msg: IQueueTelegramNotification): IRenderedNotification {
    const dao = MarkdownV2.escape(msg.daoName ?? DaoIdParser.format(msg.network, msg.daoAddress))
    const voter = MarkdownV2.escape(msg.vote?.voterEns ?? msg.vote?.voterAddress ?? 'A member')
    const option = MarkdownV2.escape(msg.vote?.voteOption ?? 'voted')
    const propTitle = MarkdownV2.escape(
      MarkdownV2.truncate(msg.vote?.proposalTitle ?? `proposal ${msg.vote?.proposalId ?? ''}`, TITLE_MAX),
    )

    const lines = [`✅ *Vote cast in ${dao}*`, '', `${voter} voted *${option}* on ${propTitle}\\.`]
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, msg.vote?.proposalId),
    )
    return { text: lines.join('\n'), keyboard }
  }

  private renderVoteReset(msg: IQueueTelegramNotification): IRenderedNotification {
    const dao = MarkdownV2.escape(msg.daoName ?? DaoIdParser.format(msg.network, msg.daoAddress))
    const voter = MarkdownV2.escape(msg.vote?.voterEns ?? msg.vote?.voterAddress ?? 'A member')
    const propTitle = MarkdownV2.escape(
      MarkdownV2.truncate(msg.vote?.proposalTitle ?? `proposal ${msg.vote?.proposalId ?? ''}`, TITLE_MAX),
    )

    const lines = [`↩️ *Vote reset in ${dao}*`, '', `${voter} reset their vote on ${propTitle}\\.`]
    const keyboard = new InlineKeyboard().url(
      '🔗 Open in Aragon',
      this.proposalUrl(msg.network, msg.daoAddress, msg.vote?.proposalId),
    )
    return { text: lines.join('\n'), keyboard }
  }

  private proposalUrl(network: string, daoAddress: string, proposalId?: string): string {
    const base = `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${network}-${daoAddress}/proposals`
    return proposalId ? `${base}/${proposalId}` : base
  }
}
