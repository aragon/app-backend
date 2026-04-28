import { DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { type HexAddress, type IQueueTelegramNotification, ITelegramNotificationEvent, NetworksEnum } from '@types'
import { expect } from 'chai'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

const baseMsg = (overrides: Partial<IQueueTelegramNotification> = {}): IQueueTelegramNotification => ({
  id: 'test-id',
  event: ITelegramNotificationEvent.ProposalCreated,
  network: NetworksEnum.ethereumSepolia,
  daoAddress: DAO,
  daoName: 'Andr DAO',
  ...overrides,
})

describe('AragonTelegram: NotificationRenderer', () => {
  let cache: DescriptionCache
  let renderer: NotificationRenderer

  beforeEach(() => {
    cache = new DescriptionCache()
    renderer = new NotificationRenderer(cache)
  })

  describe('proposal.created', () => {
    it('renders the title and an Aragon URL button', () => {
      const { text, keyboard } = renderer.render(
        baseMsg({
          proposal: { id: '12', title: 'Fund the treasury', summary: 'Send 100 ETH' },
        }),
      )

      expect(text).to.include('🗳 *New proposal in Andr DAO*')
      expect(text).to.include('Fund the treasury')
      expect(text).to.include('Send 100 ETH')

      const flat = JSON.stringify(keyboard.inline_keyboard)
      expect(flat).to.include('Open in Aragon')
      expect(flat).to.include(`/dao/${NetworksEnum.ethereumSepolia}-${DAO}/proposals/12`)
      expect(flat).to.not.include('See details') // no description -> no See-details button
    })

    it("adds a 'See details' button and caches the description when one is supplied", () => {
      const description = 'A very long body the bot can show on demand.'
      const { keyboard } = renderer.render(baseMsg({ proposal: { id: '7', title: 'X', description } }))

      const flat = JSON.stringify(keyboard.inline_keyboard)
      expect(flat).to.include('See details')

      // Pull the pd:<token> off the keyboard and verify it round-trips through the cache
      const m = /pd:([a-f0-9]{12})/.exec(flat)
      expect(m, 'expected a pd:<token> button').to.not.be.null
      expect(cache.get(m![1])).to.eq(description)
    })

    it('falls back to "<network>-<address>" when no DAO name is provided', () => {
      const { text } = renderer.render(baseMsg({ daoName: undefined, proposal: { id: '1', title: 'P' } }))
      // The canonical id is `ethereum-sepolia-0xDd…`. All three MarkdownV2-reserved
      // dashes get escaped → `ethereum\-sepolia\-0xDd…`.
      expect(text).to.include(`ethereum\\-sepolia\\-${DAO}`)
    })
  })

  describe('vote.cast', () => {
    it('uses the voter ENS when available', () => {
      const { text } = renderer.render(
        baseMsg({
          event: ITelegramNotificationEvent.VoteCast,
          vote: {
            voterAddress: '0xabc' as HexAddress,
            voterEns: 'alice.eth',
            voteOption: 'yes',
            proposalId: '5',
            proposalTitle: 'P',
          },
        }),
      )
      expect(text).to.include('✅ *Vote cast in Andr DAO*')
      expect(text).to.include('alice\\.eth') // ENS dot is escaped
      expect(text).to.include('voted *yes*')
    })

    it('falls back to "A member" when no voter info is supplied', () => {
      const { text } = renderer.render(
        baseMsg({
          event: ITelegramNotificationEvent.VoteCast,
          // `??` only triggers on null/undefined, so we leave both fields undefined.
          vote: { voterAddress: undefined as unknown as HexAddress, proposalId: '5' },
        }),
      )
      expect(text).to.include('A member')
    })
  })

  describe('vote.reset', () => {
    it('renders the reset header', () => {
      const { text } = renderer.render(
        baseMsg({
          event: ITelegramNotificationEvent.VoteReset,
          vote: {
            voterAddress: '0xabc' as HexAddress,
            voterEns: 'alice.eth',
            proposalId: '5',
            proposalTitle: 'P',
          },
        }),
      )
      expect(text).to.include('↩️ *Vote reset in Andr DAO*')
      expect(text).to.include('reset their vote')
    })
  })
})
