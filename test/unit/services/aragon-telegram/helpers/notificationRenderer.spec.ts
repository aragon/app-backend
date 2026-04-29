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
      const { text, entities, keyboard } = result!

      expect(text).to.include('🗳 New proposal in Andr DAO')
      expect(text).to.include('Fund the treasury')
      expect(text).to.include('Send 100 ETH')
      expect(entities).to.be.an('array')

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
      expect(result!.text).to.include('✅ Vote cast in Andr DAO')
      expect(result!.text).to.include('voted yes')

      const flat = JSON.stringify(result!.keyboard.inline_keyboard)
      expect(flat).to.include(`/dao/${NETWORK}/${DAO}/proposals/ADMIN-5`)
    })

    it('returns null when the vote entity is gone', async () => {
      sandbox.stub(Models.Vote, 'findByEntityId').resolves(null)
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
      expect(result!.text).to.include('↩️ Vote reset in Andr DAO')
      expect(result!.text).to.include('reset their vote')
    })
  })
})
