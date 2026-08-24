import { Models } from '@dbModels'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { type HexAddress, type IQueueTelegramNotification, ITelegramNotificationEvent, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const PLUGIN = '0xAaaaaaAA00000000000000000000000000000001' as HexAddress
const NETWORK = NetworksEnum.ethereumSepolia

const baseMsg = (overrides: Partial<IQueueTelegramNotification> = {}): IQueueTelegramNotification => ({
  id: 'test-id',
  event: ITelegramNotificationEvent.ProposalCreated,
  network: NETWORK,
  daoAddress: DAO,
  proposalId: 'proposal-entity-id',
  ...overrides,
})

describe('AragonTelegram: NotificationRenderer', () => {
  let sandbox: SinonSandbox
  let renderer: NotificationRenderer

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    renderer = new NotificationRenderer()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('proposal.created', () => {
    it('renders the title, summary, and an Aragon URL with `<SLUG>-<incrementalId>`', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'Fund the treasury',
        summary: 'Send 100 ETH',
        description: undefined,
        incrementalId: 12,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      expect(result, 'expected a rendered notification').to.not.be.null
      const { text, keyboard } = result!

      // HTML mode: header + title are wrapped in <b>; summary is plain.
      expect(text).to.include('🗳 <b>New proposal in Andr DAO</b>')
      expect(text).to.include('<b>Fund the treasury</b>')
      expect(text).to.include('Send 100 ETH')

      const flat = JSON.stringify(keyboard.inline_keyboard)
      // Aragon URL form: `/dao/<network>/<addr>/proposals/<SLUG>-<incrementalId>`
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals/ADMIN-12`)
    })

    it('includes the description inline when one is supplied (truncated for long bodies)', async () => {
      const description = 'A short description body.'
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        summary: undefined,
        description,
        incrementalId: 7,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'TOKEN_VOTING' } as any)

      const result = await renderer.render(baseMsg())
      expect(result).to.not.be.null
      expect(result!.text).to.include(description)
    })

    it('sanitizes the description HTML — paragraphs become newlines, lists become bullets, inline tags are kept', async () => {
      const description =
        '<p><strong>Background</strong></p><p>The v3 contracts have been live for 4 months.</p><ul class="tight"><li><p>Trail of Bits engagement</p></li><li><p>Immunefi bounty</p></li></ul>'
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        summary: undefined,
        description,
        incrementalId: 8,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      expect(result).to.not.be.null
      const text = result!.text

      // Block tags Telegram doesn't support are flattened.
      expect(text).to.not.include('<p>')
      expect(text).to.not.include('<br>')
      expect(text).to.not.include('<ul')
      expect(text).to.not.include('<li')
      expect(text).to.not.include('class="tight"')
      // Inline tags Telegram does support survive (lowercased, attribute-stripped).
      expect(text).to.include('<strong>Background</strong>')
      // Bullet rendering for list items.
      expect(text).to.include('• Trail of Bits engagement')
      expect(text).to.include('• Immunefi bounty')
    })

    it('truncates a very long description on a sentence boundary and appends an ellipsis', async () => {
      // Build a body well over the 1500-char DESCRIPTION_MAX cap.
      const sentence = 'This is a sentence that adds non-trivial length to the description body. '
      const longBody = sentence.repeat(40) // ~3000 chars
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        summary: undefined,
        description: longBody,
        incrementalId: 9,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      expect(result).to.not.be.null
      expect(result!.text.length).to.be.lessThan(longBody.length)
      expect(result!.text.endsWith('…')).to.eq(true)
    })

    it('falls back to the listing URL when the plugin slug is missing', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        incrementalId: 1,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves(null)

      const result = await renderer.render(baseMsg())
      const flat = JSON.stringify(result!.keyboard.inline_keyboard)
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals`)
      expect(flat).to.not.include('proposals/-')
    })

    it('returns null when the proposal entity is gone', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const result = await renderer.render(baseMsg())
      expect(result).to.be.null
    })

    it('returns null when the payload carries no proposal id', async () => {
      const findStub = sandbox.stub(Models.Proposal, 'findByEntityId')
      const result = await renderer.render(baseMsg({ proposalId: undefined }))
      expect(result).to.be.null
      expect(findStub.called).to.be.false
    })

    it('falls back to a generic title and a network-prefixed DAO name when both are missing', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: '',
        incrementalId: 3,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      expect(result!.text).to.include(`🗳 <b>New proposal in ${NETWORK}-${DAO}</b>`)
      expect(result!.text).to.include('<b>New proposal</b>')
    })

    it('cuts a title longer than 120 characters and appends an ellipsis', async () => {
      const title = 'A'.repeat(200)
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title,
        incrementalId: 4,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      expect(result!.text).to.include(`<b>${'A'.repeat(119)}…</b>`)
    })

    it('hard-cuts a long description when it has no sentence break near the end', async () => {
      // No `. ` or `\n\n` anywhere, so there is no boundary to break on.
      const longBody = 'word '.repeat(400)
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        description: longBody,
        incrementalId: 10,
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg())
      const body = result!.text.split('\n').pop()!
      expect(body.endsWith('word…')).to.eq(true)
      expect(body.length).to.eq(1500)
    })
  })

  describe('proposal.ending-soon', () => {
    const endingMsg = (overrides: Partial<IQueueTelegramNotification> = {}) =>
      baseMsg({ event: ITelegramNotificationEvent.ProposalEnding, ...overrides })

    it('renders the reminder with the rounded hours left and a proposal link', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'Fund the treasury',
        incrementalId: 12,
        pluginAddress: PLUGIN,
        endDate: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(endingMsg())
      expect(result).to.not.be.null
      expect(result!.text).to.include('⏰ <b>Voting ends soon in Andr DAO</b>')
      expect(result!.text).to.include('<b>Fund the treasury</b>')
      expect(result!.text).to.include('voting closes in about 3 hours.')

      const flat = JSON.stringify(result!.keyboard.inline_keyboard)
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals/ADMIN-12`)
    })

    it('says "under an hour" when the window closes within the hour', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        incrementalId: 1,
        pluginAddress: PLUGIN,
        endDate: Math.floor(Date.now() / 1000) + 30 * 60,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(endingMsg())
      expect(result!.text).to.include('voting closes in under an hour.')
    })

    it('says "in about 1 hour" when a little over an hour is left', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        incrementalId: 1,
        pluginAddress: PLUGIN,
        endDate: Math.floor(Date.now() / 1000) + 70 * 60,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(endingMsg())
      expect(result!.text).to.include('voting closes in about 1 hour.')
    })

    it('names the proposal by its number when it has no title', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: '',
        incrementalId: 6,
        pluginAddress: PLUGIN,
        endDate: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(endingMsg())
      expect(result!.text).to.include('<b>proposal 6</b>')
    })

    it('falls back to the listing URL when the proposal has no number', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves({
        title: 'X',
        pluginAddress: PLUGIN,
        endDate: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(endingMsg())
      const flat = JSON.stringify(result!.keyboard.inline_keyboard)
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals`)
      expect(flat).to.not.include('ADMIN-')
    })

    it('returns null when the proposal entity is gone', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const result = await renderer.render(endingMsg())
      expect(result).to.be.null
    })

    it('returns null when the payload carries no proposal id', async () => {
      const findStub = sandbox.stub(Models.Proposal, 'findByEntityId')
      const result = await renderer.render(endingMsg({ proposalId: undefined }))
      expect(result).to.be.null
      expect(findStub.called).to.be.false
    })
  })

  describe('vote.cast', () => {
    it('renders the voter and links to the proposal', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves({
        memberAddress: '0xabc',
        voteOption: 'yes',
        proposalIndex: '5',
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        title: 'P',
        incrementalId: 5,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteCast, voteId: 'v-id' }))
      expect(result).to.not.be.null
      expect(result!.text).to.include('✅ <b>Vote cast in Andr DAO</b>')
      expect(result!.text).to.include('voted <b>yes</b>')

      const flat = JSON.stringify(result!.keyboard.inline_keyboard)
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals/ADMIN-5`)
    })

    it('says "A member voted" when the vote has neither an address nor an option', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves({
        proposalIndex: '5',
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        title: '',
        incrementalId: 5,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteCast, voteId: 'v-id' }))
      expect(result!.text).to.include('A member voted <b>voted</b> on proposal 5.')
    })

    it('returns null when the payload carries no vote id', async () => {
      const findStub = sandbox.stub(Models.Vote, 'findByEntityId')
      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteCast }))
      expect(result).to.be.null
      expect(findStub.called).to.be.false
    })

    it('returns null when the vote entity is gone', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves(null)
      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteCast, voteId: 'v-id' }))
      expect(result).to.be.null
    })

    it('returns null when the vote exists but its proposal cannot be found', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves({
        memberAddress: '0xabc',
        voteOption: 'yes',
        proposalIndex: '5',
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteCast, voteId: 'v-id' }))
      expect(result).to.be.null
    })
  })

  describe('vote.reset', () => {
    it('renders the reset header', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves({
        memberAddress: '0xabc',
        proposalIndex: '5',
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        title: 'P',
        incrementalId: 5,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteReset, voteId: 'v-id' }))
      expect(result).to.not.be.null
      expect(result!.text).to.include('↩️ <b>Vote reset in Andr DAO</b>')
      expect(result!.text).to.include('reset their vote')
    })

    it('says "A member" and names the proposal by number when both are missing', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves({
        proposalIndex: '5',
        pluginAddress: PLUGIN,
      } as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        title: '',
        incrementalId: 5,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)
      sandbox.stub(Models.PluginSlug, 'findPluginSlug').resolves({ slug: 'admin' } as any)

      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteReset, voteId: 'v-id' }))
      expect(result!.text).to.include('A member reset their vote on proposal 5.')
    })

    it('returns null when the vote entity is gone', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves(null)
      const result = await renderer.render(baseMsg({ event: ITelegramNotificationEvent.VoteReset, voteId: 'v-id' }))
      expect(result).to.be.null
    })
  })
})
