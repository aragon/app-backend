import { Models } from '@dbModels'
import logger from '@logger'
import { appBaseUrl } from '@services/aragon-telegram/helpers/appUrl'
import { htmlEscape } from '@services/aragon-telegram/helpers/telegramHtml'
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

const llo = logger.logMeta.bind(null, { service: 'telegram:renderer' })

/**
 * Builds Telegram messages for the notification events as HTML strings,
 * sent with `parse_mode: 'HTML'`.
 *
 * Messages never carry third-party personal data or proposal description bodies.
 *
 * The queue payload carries only entity ids; the renderer fetches the
 * referenced Proposal / PluginSlug / Dao at render-time. This keeps
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
      case ITelegramNotificationEvent.ProposalEnding:
        return this.renderProposalEnding(msg)
      case ITelegramNotificationEvent.ProposalExecuted:
        return this.renderProposalExecuted(msg)
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

    const lines = [`<b>New proposal in ${htmlEscape(daoName)}</b>`, '', `<b>${htmlEscape(title)}</b>`]
    if (summary) lines.push('', htmlEscape(this.truncate(summary, SUMMARY_MAX)))

    return { text: lines.join('\n'), keyboardFor: this.openKeyboard(msg, slug, proposal.incrementalId) }
  }

  private async renderProposalEnding(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
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

    const title = this.truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)
    const text = [
      `<b>Voting ends soon in ${htmlEscape(daoName)}</b>`,
      '',
      `<b>${htmlEscape(title)}</b>`,
      `Voting closes ${this.timeLeft(proposal.endDate)}.`,
    ].join('\n')

    return { text, keyboardFor: this.openKeyboard(msg, slug, proposal.incrementalId) }
  }

  private async renderProposalExecuted(msg: IQueueTelegramNotification): Promise<IRenderedNotification | null> {
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

    const title = this.truncate(proposal.title || `proposal ${proposal.incrementalId}`, TITLE_MAX)
    const text = [`<b>Proposal executed in ${htmlEscape(daoName)}</b>`, '', `<b>${htmlEscape(title)}</b>`].join('\n')

    return { text, keyboardFor: this.openKeyboard(msg, slug, proposal.incrementalId) }
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

  /** The "Open in Aragon" keyboard, built for the app a subscriber is on. */
  private openKeyboard(msg: IQueueTelegramNotification, slug: string | null, incrementalId?: number) {
    return (appCode?: string): InlineKeyboard =>
      new InlineKeyboard().url(
        'Open in Aragon',
        this.proposalUrl(msg.network, msg.daoAddress, slug, incrementalId, appCode),
      )
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
    appCode?: string,
  ): string {
    const base = `${appBaseUrl(appCode)}/dao/${network}/${daoAddress}/proposals`
    if (slug && incrementalId !== undefined) {
      return `${base}/${slug.toUpperCase()}-${incrementalId}`
    }
    return base
  }

  /** Human wording for the time between now and `endDate` (unix seconds). */
  private timeLeft(endDate: number): string {
    const secondsLeft = endDate - Math.floor(Date.now() / 1000)
    if (secondsLeft <= 60 * 60) return 'in under an hour'
    const hours = Math.round(secondsLeft / (60 * 60))
    return hours === 1 ? 'in about 1 hour' : `in about ${hours} hours`
  }

  /** Hard truncate at `max` chars; appends `…` when cut. */
  private truncate(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`
  }
}
